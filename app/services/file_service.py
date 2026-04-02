"""
File Service
Handles upload of .docx / .pdf files to S3-compatible storage.
Text extraction is attempted so AI can review uploaded files too.
"""

import io
import mimetypes
import uuid
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import StorageError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class FileService:
    """Upload, delete, and extract text from document files."""

    def __init__(self) -> None:
        self._s3 = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        )
        self._bucket = settings.S3_BUCKET_NAME

    # ── Upload ────────────────────────────────────────────────────────────────

    async def upload(self, file: UploadFile, user_id: uuid.UUID) -> tuple[str, str]:
        """
        Validate, upload to S3, and return (file_url, original_filename).
        Raises ValidationError / StorageError on failure.
        """
        self._validate(file)
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise ValidationError(
                f"File exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB."
            )

        ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else "bin"
        key = f"submissions/{user_id}/{uuid.uuid4()}.{ext}"

        try:
            self._s3.upload_fileobj(
                io.BytesIO(content),
                self._bucket,
                key,
                ExtraArgs={"ContentType": file.content_type or "application/octet-stream"},
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed", extra={"key": key, "error": str(exc)})
            raise StorageError("File upload failed.") from exc

        url = f"https://{self._bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
        logger.info("File uploaded", extra={"key": key, "user_id": str(user_id)})
        return url, file.filename or key

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
        key = file_url.split(f"{self._bucket}.s3.{settings.AWS_REGION}.amazonaws.com/")[-1]
        try:
            self._s3.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("S3 delete failed", extra={"key": key, "error": str(exc)})

    # ── Validation ────────────────────────────────────────────────────────────

    @staticmethod
    def _validate(file: UploadFile) -> None:
        if not file.filename:
            raise ValidationError("Uploaded file has no filename.")
        mime = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
        if mime not in ALLOWED_MIME_TYPES:
            raise ValidationError("Only .pdf and .docx files are accepted.")
