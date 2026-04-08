"""
Knowledge Library Service
Founders can upload PDFs, DOCX files, or text snippets into a structured
library. The AI workflow uses matching library items as prompt context.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import NotFoundError, ValidationError
from core.logging import get_logger
from models.models import KnowledgeLibraryItem, Stakeholder, TeamDepartment, User
from services.document_guidance_service import DocumentGuidanceService
from services.ai_service import AIService
from services.file_service import FileService
from services.google_drive_service import GoogleDriveService
from services.knowledge_library_parser import KnowledgeLibraryParser, ParsedLibraryDocument
from services.stakeholder_guidance_service import StakeholderGuidanceService

logger = get_logger(__name__)


class KnowledgeLibraryService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._file_service = FileService()
        self._drive_service = GoogleDriveService(session)
        self._parser = KnowledgeLibraryParser()
        self._ai_service = AIService()
        self._document_guidance_service = DocumentGuidanceService(session)
        self._stakeholder_guidance_service = StakeholderGuidanceService(session)

    async def ensure_schema(self) -> None:
        await self._session.execute(
            text(
                """
                ALTER TABLE knowledge_library_items
                ADD COLUMN IF NOT EXISTS intake_analysis JSON
                """
            )
        )
        await self._session.execute(
            text(
                """
                ALTER TABLE knowledge_library_items
                ADD COLUMN IF NOT EXISTS intake_conversation JSON
                """
            )
        )
        await self._session.execute(
            text(
                """
                ALTER TABLE knowledge_library_items
                ADD COLUMN IF NOT EXISTS visible_to_departments VARCHAR(255)[]
                """
            )
        )

    @staticmethod
    def normalize_section_key(value: str) -> str:
        key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
        if not key:
            raise ValidationError("section_key is required.")
        return key

    @staticmethod
    def _split_csv(value: Optional[str]) -> Optional[list[str]]:
        if not value:
            return None
        items = [part.strip().lower() for part in value.split(",")]
        cleaned = [item for item in items if item]
        return cleaned or None

    @staticmethod
    def _normalize_stakeholder_values(values: Optional[list[str]]) -> Optional[list[str]]:
        if not values:
            return None
        cleaned = [value.strip().lower() for value in values if value and value.strip()]
        return cleaned or None

    @staticmethod
    def _normalize_doc_type_values(values: Optional[list[str]]) -> Optional[list[str]]:
        if not values:
            return None
        cleaned = [KnowledgeLibraryService.normalize_section_key(value) for value in values if value and value.strip()]
        return cleaned or None

    @staticmethod
    def _normalize_department_values(values: Optional[list[str]]) -> Optional[list[str]]:
        if not values:
            return None
        allowed = {member.value for member in TeamDepartment}
        cleaned = [value.strip().lower() for value in values if value and value.strip() and value.strip().lower() in allowed]
        return cleaned or None

    @staticmethod
    def _normalize_tag_values(values: Optional[list[str]]) -> Optional[list[str]]:
        if not values:
            return None
        cleaned = [value.strip().lower() for value in values if value and value.strip()]
        return cleaned or None

    @staticmethod
    def _truncate_markdown(content: str, limit: int = 1500) -> str:
        content = content.strip()
        if len(content) <= limit:
            return content
        return content[:limit].rstrip() + "\n\n[truncated]"

    @staticmethod
    def _conversation_messages(item: KnowledgeLibraryItem) -> list[dict]:
        conversation = item.intake_conversation or []
        return [message for message in conversation if isinstance(message, dict)]

    @staticmethod
    def _append_conversation_message(messages: list[dict], role: str, content: str) -> None:
        cleaned = content.strip()
        if not cleaned:
            return
        messages.append({
            "role": role,
            "content": cleaned,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })

    @staticmethod
    def _assistant_summary(analysis) -> str:
        parts = [
            f"content_kind: {analysis.content_kind}",
            f"summary: {analysis.summary}",
            f"confidence: {analysis.confidence:.2f}",
        ]
        if analysis.inferred_title:
            parts.append(f"inferred_title: {analysis.inferred_title}")
        if analysis.inferred_section_label:
            parts.append(f"inferred_section_label: {analysis.inferred_section_label}")
        if analysis.recommended_doc_types:
            parts.append(f"recommended_doc_types: {', '.join(analysis.recommended_doc_types)}")
        if analysis.recommended_stakeholders:
            parts.append(f"recommended_stakeholders: {', '.join(analysis.recommended_stakeholders)}")
        if analysis.recommended_tags:
            parts.append(f"recommended_tags: {', '.join(analysis.recommended_tags)}")
        if analysis.clarifying_questions:
            parts.append(f"clarifying_questions: {' | '.join(analysis.clarifying_questions)}")
        if analysis.notes:
            parts.append(f"notes: {analysis.notes}")
        return "\n".join(parts)

    async def _accepted_stakeholders(self) -> list[str]:
        await self._stakeholder_guidance_service.ensure_seeded()
        guidance = await self._stakeholder_guidance_service.list_guidance()
        return [item.stakeholder.value for item in guidance]

    @staticmethod
    def _guidance_requests_all(value: Optional[str], *, field_name: str) -> bool:
        if not value:
            return False
        text = value.strip().lower()
        if not text:
            return False
        if field_name == "stakeholders":
            return any(
                phrase in text
                for phrase in (
                    "all stakeholders",
                    "every stakeholder",
                    "everyone",
                    "all audience",
                    "all audiences",
                    "global stakeholder",
                    "apply to all stakeholders",
                    "applies to all stakeholders",
                )
            )
        return any(
            phrase in text
            for phrase in (
                "all doc types",
                "all document types",
                "every doc type",
                "every document type",
                "global doc type",
                "apply to all doc types",
                "applies to all doc types",
            )
        )

    @staticmethod
    def _expand_all_scope_values(
        values: Optional[list[str]],
        all_values: list[str],
        instruction: Optional[str],
        field_name: str,
    ) -> Optional[list[str]]:
        if KnowledgeLibraryService._guidance_requests_all(instruction, field_name=field_name):
            return list(all_values)
        return values

    async def _accepted_doc_types(self) -> list[str]:
        guidance = await self._document_guidance_service.list_guidance()
        return [item.doc_type for item in guidance]

    async def _store_source_file(self, file: UploadFile, current_user: User) -> tuple[str, str]:
        """
        Store a locally-uploaded source file in the app's upload directory.
        Drive imports use a separate flow so founders explicitly choose that source.
        """
        await file.seek(0)
        local_url, uploaded_name = await self._file_service.upload(
            file,
            current_user.id,
            namespace="library",
        )
        return local_url, uploaded_name

    async def import_drive_item(
        self,
        *,
        current_user: User,
        drive_file_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        source_file_url: Optional[str] = None,
        is_active: bool = False,
    ) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        data, filename, mime_type, source_url = await self._drive_service.download_file(
            current_user=current_user,
            file_id=drive_file_id,
        )
        parsed = await self._parser.parse_bytes(filename=filename, data=data, mime_type=mime_type)
        parsed_title = (title or parsed.source_filename or "Library Item").strip()
        item = KnowledgeLibraryItem(
            title=parsed_title,
            section_key="unclassified",
            section_label="Unclassified",
            description=description.strip() if description else None,
            source_kind="drive",
            source_file_url=source_file_url or source_url,
            source_filename=filename,
            source_mime_type=mime_type,
            source_size_bytes=len(data),
            content_markdown=parsed.content_markdown.strip(),
            raw_text=parsed.raw_text,
            applies_to_doc_types=None,
            applies_to_stakeholders=None,
            visible_to_departments=None,
            tags=None,
            sort_order=0,
            is_active=is_active,
            parser_provider=parsed.parser_provider,
            parser_status=parsed.parser_status,
            parser_notes="Imported from Google Drive",
            intake_analysis=None,
            intake_conversation=[],
            updated_by=current_user.id,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def list_items(self, *, include_inactive: bool = True) -> List[KnowledgeLibraryItem]:
        await self.ensure_schema()
        stmt = select(KnowledgeLibraryItem).order_by(
            KnowledgeLibraryItem.section_label.asc(),
            KnowledgeLibraryItem.sort_order.asc(),
            KnowledgeLibraryItem.updated_at.desc(),
        )
        if not include_inactive:
            stmt = stmt.where(KnowledgeLibraryItem.is_active.is_(True))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_item(self, item_id: UUID) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        stmt = select(KnowledgeLibraryItem).where(KnowledgeLibraryItem.id == item_id)
        result = await self._session.execute(stmt)
        item = result.scalar_one_or_none()
        if item is None:
            raise NotFoundError(f"Knowledge library item '{item_id}' not found.")
        return item

    async def create_item(
        self,
        *,
        title: str,
        section_key: str,
        section_label: str,
        description: Optional[str],
        source_file_url: Optional[str],
        content_markdown: str,
        current_user: User,
        file: UploadFile | None = None,
        applies_to_doc_types: Optional[list[str]] = None,
        applies_to_stakeholders: Optional[list[str]] = None,
        visible_to_departments: Optional[list[str]] = None,
        tags: Optional[list[str]] = None,
        sort_order: int = 0,
        is_active: bool = True,
        archive_source: bool = True,
    ) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        title = title.strip()
        if not title:
            raise ValidationError("title is required.")

        section_key = self.normalize_section_key(section_key)
        section_label = section_label.strip()
        if not section_label:
            raise ValidationError("section_label is required.")

        parsed: ParsedLibraryDocument | None = None
        source_kind = "manual"
        resolved_source_file_url = source_file_url.strip() if source_file_url else None
        source_filename = None
        source_mime_type = None
        source_size_bytes = None
        raw_text = content_markdown.strip() or None
        final_markdown = content_markdown.strip()
        parser_provider = "manual"
        parser_status = "manual"
        parser_notes = None

        if file is not None:
            source_kind = "file"
            parsed = await self._parser.parse_upload(file)
            await file.seek(0)
            if archive_source:
                source_file_url, uploaded_name = await self._store_source_file(file, current_user)
                source_filename = uploaded_name or parsed.source_filename
            else:
                source_file_url = None
                source_filename = parsed.source_filename
            source_mime_type = parsed.source_mime_type or file.content_type
            source_size_bytes = parsed.source_size_bytes
            parser_provider = parsed.parser_provider
            parser_status = parsed.parser_status
            parser_notes = parsed.parser_notes
            raw_text = parsed.raw_text
            if not final_markdown:
                final_markdown = parsed.content_markdown.strip()

        if not final_markdown:
            raise ValidationError("A file parse or markdown body is required.")

        item = KnowledgeLibraryItem(
            title=title,
            section_key=section_key,
            section_label=section_label,
            description=description.strip() if description else None,
            source_kind=source_kind,
            source_file_url=resolved_source_file_url,
            source_filename=source_filename,
            source_mime_type=source_mime_type,
            source_size_bytes=source_size_bytes,
            content_markdown=final_markdown,
            raw_text=raw_text,
            applies_to_doc_types=self._normalize_doc_type_values(applies_to_doc_types),
            applies_to_stakeholders=self._normalize_stakeholder_values(applies_to_stakeholders),
            visible_to_departments=self._normalize_department_values(visible_to_departments),
            tags=self._normalize_tag_values(tags),
            sort_order=sort_order,
            is_active=is_active,
            parser_provider=parser_provider,
            parser_status=parser_status,
            parser_notes=parser_notes,
            intake_analysis=None,
            intake_conversation=[],
            updated_by=current_user.id,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def parse_item(
        self,
        *,
        current_user: User,
        file: UploadFile,
        title: Optional[str] = None,
        description: Optional[str] = None,
        source_file_url: Optional[str] = None,
        is_active: bool = False,
        archive_source: bool = True,
    ) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        parsed = await self._parser.parse_upload(file)
        await file.seek(0)
        uploaded_name = None
        parsed_source_file_url = None
        if archive_source:
            parsed_source_file_url, uploaded_name = await self._store_source_file(file, current_user)

        parsed_title = (title or uploaded_name or parsed.source_filename or "Library Item").strip()
        item = KnowledgeLibraryItem(
            title=parsed_title,
            section_key="unclassified",
            section_label="Unclassified",
            description=description.strip() if description else None,
            source_kind="file",
            source_file_url=source_file_url.strip() if source_file_url else parsed_source_file_url,
            source_filename=uploaded_name or parsed.source_filename,
            source_mime_type=parsed.source_mime_type or file.content_type,
            source_size_bytes=parsed.source_size_bytes,
            content_markdown=parsed.content_markdown.strip(),
            raw_text=parsed.raw_text,
            applies_to_doc_types=None,
            applies_to_stakeholders=None,
            visible_to_departments=None,
            tags=None,
            sort_order=0,
            is_active=is_active,
            parser_provider=parsed.parser_provider,
            parser_status=parsed.parser_status,
            parser_notes=parsed.parser_notes,
            intake_analysis=None,
            intake_conversation=[],
            updated_by=current_user.id,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def update_item(
        self,
        item_id: UUID,
        *,
        title: str,
        section_key: str,
        section_label: str,
        description: Optional[str],
        source_file_url: Optional[str],
        content_markdown: str,
        current_user: User,
        applies_to_doc_types: Optional[list[str]] = None,
        applies_to_stakeholders: Optional[list[str]] = None,
        visible_to_departments: Optional[list[str]] = None,
        tags: Optional[list[str]] = None,
        sort_order: int = 0,
        is_active: bool = True,
        intake_analysis: Optional[dict] = None,
    ) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        item = await self.get_item(item_id)
        item.title = title.strip()
        item.section_key = self.normalize_section_key(section_key)
        item.section_label = section_label.strip()
        item.description = description.strip() if description else None
        item.source_file_url = source_file_url.strip() if source_file_url else item.source_file_url
        item.content_markdown = content_markdown.strip()
        item.applies_to_doc_types = self._normalize_doc_type_values(applies_to_doc_types)
        item.applies_to_stakeholders = self._normalize_stakeholder_values(applies_to_stakeholders)
        item.visible_to_departments = self._normalize_department_values(visible_to_departments)
        item.tags = self._normalize_tag_values(tags)
        item.sort_order = sort_order
        item.is_active = is_active
        item.intake_analysis = intake_analysis or item.intake_analysis
        item.updated_by = current_user.id
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def analyze_item(self, item_id: UUID, current_user: User) -> KnowledgeLibraryItem:
        return await self.analyze_item_with_guidance(item_id, current_user, founder_instructions=None, auto_only=True)

    async def analyze_item_with_guidance(
        self,
        item_id: UUID,
        current_user: User,
        *,
        founder_instructions: Optional[str] = None,
        auto_only: bool = False,
    ) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        item = await self.get_item(item_id)
        conversation = self._conversation_messages(item)
        if founder_instructions and founder_instructions.strip():
            self._append_conversation_message(conversation, "user", founder_instructions)
        all_doc_types = await self._accepted_doc_types()
        all_stakeholders = await self._accepted_stakeholders()
        analysis = await self._ai_service.analyze_library_intake(
            item.content_markdown,
            file_name=item.source_filename,
            mime_type=item.source_mime_type,
            title=item.title,
            description=item.description,
            section_key=item.section_key,
            section_label=item.section_label,
            applies_to_doc_types=item.applies_to_doc_types,
            applies_to_stakeholders=item.applies_to_stakeholders,
            tags=item.tags,
            founder_instructions=founder_instructions,
            auto_only=auto_only,
            conversation_history=conversation,
            available_doc_types=all_doc_types,
            available_stakeholders=all_stakeholders,
        )

        analysis.recommended_doc_types = self._expand_all_scope_values(
            analysis.recommended_doc_types,
            all_doc_types,
            founder_instructions,
            "doc_types",
        )
        analysis.recommended_stakeholders = self._expand_all_scope_values(
            analysis.recommended_stakeholders,
            all_stakeholders,
            founder_instructions,
            "stakeholders",
        )

        self._append_conversation_message(conversation, "assistant", self._assistant_summary(analysis))

        item.intake_analysis = analysis.model_dump()
        item.intake_conversation = conversation
        if analysis.inferred_title:
            item.title = analysis.inferred_title
        if analysis.inferred_section_key:
            item.section_key = self.normalize_section_key(analysis.inferred_section_key)
        if analysis.inferred_section_label:
            item.section_label = analysis.inferred_section_label
        if analysis.summary and not item.description:
            item.description = analysis.summary
        if analysis.recommended_doc_types:
            item.applies_to_doc_types = self._normalize_doc_type_values(analysis.recommended_doc_types)
        if analysis.recommended_stakeholders:
            item.applies_to_stakeholders = self._normalize_stakeholder_values(analysis.recommended_stakeholders)
        if analysis.recommended_tags:
            item.tags = self._normalize_tag_values(analysis.recommended_tags)
        item.is_active = not analysis.needs_clarification
        item.updated_by = current_user.id
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def toggle_item(self, item_id: UUID, current_user: User) -> KnowledgeLibraryItem:
        await self.ensure_schema()
        item = await self.get_item(item_id)
        item.is_active = not item.is_active
        item.updated_by = current_user.id
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete_item(self, item_id: UUID, current_user: User) -> None:
        await self.ensure_schema()
        item = await self.get_item(item_id)
        if item.source_file_url and item.source_file_url.startswith("/uploads/"):
            self._file_service.delete(item.source_file_url)
        await self._session.delete(item)
        await self._session.flush()

    async def _get_context_matches(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        current_department: Optional[str] = None,
    ) -> List[KnowledgeLibraryItem]:
        await self.ensure_schema()
        doc_type_key = self.normalize_section_key(doc_type)
        stakeholder_value = stakeholder.value.lower()
        department_value = current_department.strip().lower() if current_department else None
        rows = await self.list_items(include_inactive=False)
        matches: list[KnowledgeLibraryItem] = []
        for row in rows:
            doc_types = [self.normalize_section_key(value) for value in (row.applies_to_doc_types or [])]
            stakeholders = [value.lower() for value in (row.applies_to_stakeholders or [])]
            departments = [value.lower() for value in (row.visible_to_departments or [])]
            doc_ok = not doc_types or doc_type_key in doc_types
            stakeholder_ok = not stakeholders or stakeholder_value in stakeholders
            department_ok = (
                not departments
                or department_value is None
                or department_value == "founders"
                or department_value in departments
            )
            if doc_ok and stakeholder_ok and department_ok:
                matches.append(row)
        return matches

    async def render_prompt_block(
        self,
        doc_type: str,
        stakeholder: Stakeholder,
        current_department: Optional[str] = None,
    ) -> str:
        matches = await self._get_context_matches(doc_type, stakeholder, current_department=current_department)
        if not matches:
            return ""

        sections: list[str] = ["FOUNDERS' KNOWLEDGE LIBRARY"]
        current_section = None
        for item in matches:
            if item.section_label != current_section:
                current_section = item.section_label
                sections.append(f"## {current_section}")
            source_bits = []
            if item.source_kind:
                source_bits.append(item.source_kind)
            if item.source_filename:
                source_bits.append(item.source_filename)
            source_label = f" ({', '.join(source_bits)})" if source_bits else ""
            sections.append(f"- {item.title}{source_label}")
            if item.description:
                sections.append(f"  {item.description}")
            sections.append(self._truncate_markdown(item.content_markdown))
            sections.append("")
        return "\n".join(sections).strip()

    async def preview_intake(
        self,
        *,
        title: str,
        section_key: str,
        section_label: str,
        description: Optional[str],
        content_markdown: str,
        file: UploadFile | None = None,
        applies_to_doc_types: Optional[list[str]] = None,
        applies_to_stakeholders: Optional[list[str]] = None,
        visible_to_departments: Optional[list[str]] = None,
        tags: Optional[list[str]] = None,
    ) -> dict:
        await self.ensure_schema()
        parsed: ParsedLibraryDocument | None = None
        source_filename = file.filename if file is not None else None
        source_mime_type = file.content_type if file is not None else None
        if file is not None:
            parsed = await self._parser.parse_upload(file)
            await file.seek(0)
            source_filename = parsed.source_filename or source_filename
            source_mime_type = parsed.source_mime_type or source_mime_type
            content_markdown = content_markdown.strip() or parsed.content_markdown.strip()
        if not content_markdown.strip():
            raise ValidationError("A file parse or markdown body is required.")

        analysis = await self._ai_service.analyze_library_intake(
            content_markdown.strip(),
            file_name=source_filename,
            mime_type=source_mime_type,
            title=title,
            description=description,
            section_key=section_key,
            section_label=section_label,
            applies_to_doc_types=applies_to_doc_types,
            applies_to_stakeholders=applies_to_stakeholders,
            tags=tags,
            available_doc_types=await self._accepted_doc_types(),
            available_stakeholders=await self._accepted_stakeholders(),
        )

        return {
            "source_filename": source_filename,
            "source_mime_type": source_mime_type,
            "source_size_bytes": parsed.source_size_bytes if parsed is not None else None,
            "content_markdown": content_markdown.strip(),
            "raw_text": parsed.raw_text if parsed is not None else content_markdown.strip(),
            "parser_provider": parsed.parser_provider if parsed is not None else "manual",
            "parser_status": parsed.parser_status if parsed is not None else "manual",
            "parser_notes": parsed.parser_notes if parsed is not None else None,
            "analysis": analysis.model_dump(),
        }
