"""
File Service
Handles upload of .docx / .pdf files to local storage.
Text extraction is attempted so AI can review uploaded files too.
"""

import io
import mimetypes
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from core.config import settings
from core.exceptions import StorageError, ValidationError
from core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class FileService:
    """Upload, delete, and extract text from document files."""

    def __init__(self) -> None:
        self._storage_root = Path(settings.UPLOAD_DIR).resolve()
        self._storage_root.mkdir(parents=True, exist_ok=True)

    # ── Upload ────────────────────────────────────────────────────────────────

    async def upload(
        self,
        file: UploadFile,
        user_id: uuid.UUID,
        *,
        namespace: str = "submissions",
    ) -> tuple[str, str]:
        """
        Validate, upload to local storage, and return (file_url, original_filename).
        Raises ValidationError / StorageError on failure.
        """
        self._validate(file)
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise ValidationError(
                f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
            )

        ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else "bin"
        relative_path = Path(namespace) / str(user_id) / f"{uuid.uuid4()}.{ext}"
        destination = self._storage_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)

        try:
            destination.write_bytes(content)
        except OSError as exc:
            logger.error("Local file write failed", extra={"path": str(destination), "error": str(exc)})
            raise StorageError("File upload failed.") from exc

        file_url = f"/uploads/{relative_path.as_posix()}"
        logger.info("File uploaded", extra={"path": str(destination), "user_id": str(user_id)})
        return file_url, file.filename or destination.name

    # ── Text extraction ───────────────────────────────────────────────────────

    @staticmethod
    async def extract_text(file: UploadFile) -> Optional[str]:
        """
        Extract plain text from uploaded .pdf or .docx for AI review.
        Returns None if extraction fails (caller falls back to user-pasted text).
        """
        content = await file.read()
        mime = file.content_type or ""

        try:
            if mime == "application/pdf":
                return FileService._extract_pdf(content)
            elif "wordprocessingml" in mime:
                return FileService._extract_docx(content)
            elif mime.startswith("text/") or mime == "application/json":
                return content.decode("utf-8", errors="ignore").strip()
        except Exception as exc:
            logger.warning("Text extraction failed", extra={"error": str(exc)})
        return None

    @staticmethod
    def _extract_pdf(data: bytes) -> str:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()

    @staticmethod
    def _extract_docx(data: bytes) -> str:
        from docx import Document

        doc = Document(io.BytesIO(data))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs).strip()

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete(self, file_url: str) -> None:
        try:
            path = self.resolve_path(file_url)
            if self._storage_root != path and self._storage_root not in path.parents:
                raise ValueError("Invalid file path.")
            path.unlink(missing_ok=True)
        except (OSError, ValueError) as exc:
            logger.warning("Local delete failed", extra={"file_url": file_url, "error": str(exc)})

    def resolve_path(self, file_url: str) -> Path:
        relative = file_url.removeprefix("/uploads/").lstrip("/")
        return (self._storage_root / relative).resolve()

    # ── Validation ────────────────────────────────────────────────────────────

    @staticmethod
    def _validate(file: UploadFile) -> None:
        if not file.filename:
            raise ValidationError("Uploaded file has no filename.")
        mime = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
        if mime not in ALLOWED_MIME_TYPES:
            raise ValidationError("Only .pdf, .docx, .txt, and .md files are accepted.")
