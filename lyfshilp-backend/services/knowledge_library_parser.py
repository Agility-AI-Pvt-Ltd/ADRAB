"""
Knowledge Library Parser
Converts founder-uploaded PDFs, DOCX files, and text files into AI-ready markdown.

When LlamaParse is configured, it is used first. If parsing is unavailable or
fails, the parser falls back to the local file extractor.
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from core.config import settings
from core.logging import get_logger
from services.file_service import FileService

logger = get_logger(__name__)

try:  # optional dependency
    from llama_parse import LlamaParse  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    LlamaParse = None  # type: ignore


@dataclass(slots=True)
class ParsedLibraryDocument:
    content_markdown: str
    raw_text: Optional[str]
    parser_provider: str
    parser_status: str
    source_filename: Optional[str] = None
    source_mime_type: Optional[str] = None
    source_size_bytes: Optional[int] = None
    parser_notes: Optional[str] = None


class KnowledgeLibraryParser:
    """Parse founder-uploaded source documents into markdown."""

    def __init__(self) -> None:
        self._file_service = FileService()

    async def parse_upload(self, file: UploadFile) -> ParsedLibraryDocument:
        data = await file.read()
        mime = file.content_type or ""
        filename = file.filename or "library-item"
        return await self.parse_bytes(filename=filename, data=data, mime_type=mime)

    async def parse_bytes(self, *, filename: str, data: bytes, mime_type: str) -> ParsedLibraryDocument:
        mime = mime_type or ""

        if not data:
            return ParsedLibraryDocument(
                content_markdown="",
                raw_text="",
                parser_provider="local",
                parser_status="empty",
                source_filename=filename,
                source_mime_type=mime,
                source_size_bytes=len(data),
                parser_notes="Uploaded file was empty.",
            )

        if self._is_text_file(filename, mime):
            text = data.decode("utf-8", errors="ignore").strip()
            return ParsedLibraryDocument(
                content_markdown=text,
                raw_text=text,
                parser_provider="local",
                parser_status="parsed",
                source_filename=filename,
                source_mime_type=mime,
                source_size_bytes=len(data),
            )

        llama_result = await self._try_llama_parse(filename, data)
        if llama_result is not None:
            return llama_result

        await file.seek(0)
        extracted = await self._file_service.extract_text(file)
        return ParsedLibraryDocument(
            content_markdown=extracted or "",
            raw_text=extracted,
            parser_provider="local",
            parser_status="parsed" if extracted else "empty",
            source_filename=filename,
            source_mime_type=mime,
            source_size_bytes=len(data),
            parser_notes="LlamaParse was unavailable; used local extraction.",
        )

    async def _try_llama_parse(self, filename: str, data: bytes) -> ParsedLibraryDocument | None:
        if LlamaParse is None or not settings.LLAMA_CLOUD_API_KEY:
            return None

        try:
            suffix = Path(filename).suffix or ".pdf"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(data)
                tmp_path = Path(tmp.name)

            try:
                parser = LlamaParse(
                    api_key=settings.LLAMA_CLOUD_API_KEY,
                    result_type="markdown",
                )
                documents = parser.load_data(str(tmp_path))
                markdown_chunks = []
                for document in documents or []:
                    text = getattr(document, "text", None)
                    if text:
                        markdown_chunks.append(str(text))
                markdown = "\n\n".join(markdown_chunks).strip()
                if markdown:
                    return ParsedLibraryDocument(
                        content_markdown=markdown,
                        raw_text=markdown,
                        parser_provider="llama_parse",
                        parser_status="parsed",
                        source_filename=filename,
                        source_mime_type=self._guess_mime(filename),
                        source_size_bytes=len(data),
                    )
            finally:
                tmp_path.unlink(missing_ok=True)
        except Exception as exc:  # pragma: no cover - external service failure
            logger.warning("LlamaParse failed; falling back to local extraction", extra={"error": str(exc)})
            return None

        return None

    @staticmethod
    def _is_text_file(filename: str, mime: str) -> bool:
        lowered = filename.lower()
        return mime.startswith("text/") or lowered.endswith(".txt") or lowered.endswith(".md")

    @staticmethod
    def _guess_mime(filename: str) -> str:
        if filename.lower().endswith(".txt"):
            return "text/plain"
        if filename.lower().endswith(".md"):
            return "text/markdown"
        if filename.lower().endswith(".docx"):
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return "application/pdf"
