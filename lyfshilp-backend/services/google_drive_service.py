"""
Google Drive Service
Handles founder verification via Google OAuth and optional Drive-backed source storage.
"""

from __future__ import annotations

import json
import mimetypes
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.exceptions import AuthenticationError, ForbiddenError, StorageError
from core.logging import get_logger
from models.models import GoogleDriveConnection, User, UserRole

logger = get_logger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3"
GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
GOOGLE_DRIVE_SCOPES = (
    "openid email profile https://www.googleapis.com/auth/drive"
)


@dataclass(slots=True)
class DriveUploadResult:
    file_url: str
    file_name: str
    provider: str
    notes: Optional[str] = None


@dataclass(slots=True)
class DriveFileEntry:
    id: str
    name: str
    mime_type: str
    web_view_link: Optional[str]
    modified_time: Optional[str]
    size_bytes: Optional[int]


class GoogleDriveService:
    """OAuth and Drive file helpers for founder-linked Google accounts."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def get_auth_url(self, state: str) -> str:
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": GOOGLE_DRIVE_SCOPES,
            "state": state,
            "access_type": "offline",
            "prompt": "consent select_account",
        }
        query = urlencode(params)
        return f"{GOOGLE_AUTH_URL}?{query}"

    async def get_connection(self, user_id) -> GoogleDriveConnection | None:
        stmt = select(GoogleDriveConnection).where(
            GoogleDriveConnection.user_id == user_id,
            GoogleDriveConnection.is_active.is_(True),
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_connection_status(self, user_id) -> dict:
        connection = await self.get_connection(user_id)
        if connection is None:
            return {
                "connected": False,
                "google_email": None,
                "folder_id": None,
                "scopes": None,
                "connected_at": None,
            }
        return {
            "connected": True,
            "google_email": connection.google_email,
            "folder_id": connection.folder_id,
            "scopes": connection.scopes,
            "connected_at": connection.created_at,
        }

    async def list_files(self, *, current_user: User, query: Optional[str] = None, page_size: int = 50) -> list[DriveFileEntry]:
        connection = await self.get_connection(current_user.id)
        if connection is None:
            raise StorageError("Google Drive is not connected for this account.")

        access_token = await self._refresh_access_token(connection.refresh_token)
        filters = ["trashed = false", "mimeType != 'application/vnd.google-apps.folder'"]
        if connection.folder_id:
            filters.append(f"'{connection.folder_id}' in parents")
        if query:
            safe_query = query.replace("'", "\\'")
            filters.append(f"name contains '{safe_query}'")

        params = {
            "q": " and ".join(filters),
            "pageSize": max(1, min(page_size, 100)),
            "fields": "files(id,name,mimeType,webViewLink,modifiedTime,size)",
            "orderBy": "modifiedTime desc",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{GOOGLE_DRIVE_API_URL}/files",
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code != 200:
            logger.warning(
                "Google Drive file listing failed",
                extra={"status_code": response.status_code, "body": response.text[:500]},
            )
            raise StorageError("Could not list Google Drive files.")

        payload = response.json()
        files: list[DriveFileEntry] = []
        for item in payload.get("files", []):
            size_value = item.get("size")
            try:
                size_bytes = int(size_value) if size_value is not None else None
            except (TypeError, ValueError):
                size_bytes = None
            files.append(
                DriveFileEntry(
                    id=item["id"],
                    name=item.get("name") or item["id"],
                    mime_type=item.get("mimeType") or "application/octet-stream",
                    web_view_link=item.get("webViewLink"),
                    modified_time=item.get("modifiedTime"),
                    size_bytes=size_bytes,
                )
            )
        return files

    async def connect_user(self, *, current_user: User, code: str) -> GoogleDriveConnection:
        if current_user.role not in {UserRole.FOUNDER, UserRole.ADMIN}:
            raise ForbiddenError("Only founders can connect Google Drive.")

        token_data = await self._exchange_code(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        if not access_token:
            raise AuthenticationError("Failed to exchange Google auth code.")
        if not refresh_token:
            raise AuthenticationError("Google did not return a refresh token. Reconnect and approve access again.")

        user_info = await self._fetch_userinfo(access_token)
        email = (user_info.get("email") or "").lower().strip()
        if not email:
            raise AuthenticationError("Google did not return an email address.")
        if email != current_user.email.lower():
            raise ForbiddenError("Please connect the same Google account that matches your Lyfshilp login email.")

        google_sub = user_info.get("sub")
        scopes = token_data.get("scope") or GOOGLE_DRIVE_SCOPES

        stmt = select(GoogleDriveConnection).where(GoogleDriveConnection.user_id == current_user.id)
        result = await self._session.execute(stmt)
        connection = result.scalar_one_or_none()
        if connection is None:
            connection = GoogleDriveConnection(
                user_id=current_user.id,
                google_sub=google_sub,
                google_email=email,
                refresh_token=refresh_token,
                scopes=scopes,
                folder_id=settings.GOOGLE_DRIVE_FOLDER_ID or None,
                is_active=True,
            )
            self._session.add(connection)
        else:
            connection.google_sub = google_sub
            connection.google_email = email
            connection.refresh_token = refresh_token
            connection.scopes = scopes
            connection.folder_id = settings.GOOGLE_DRIVE_FOLDER_ID or connection.folder_id
            connection.is_active = True
            self._session.add(connection)

        await self._session.flush()
        await self._session.refresh(connection)
        logger.info("Google Drive connected", extra={"user_id": str(current_user.id), "google_email": email})
        return connection

    async def upload_file(
        self,
        *,
        current_user: User,
        file: UploadFile,
        folder_id: Optional[str] = None,
    ) -> DriveUploadResult:
        connection = await self.get_connection(current_user.id)
        if connection is None:
            raise StorageError("Google Drive is not connected for this account.")

        target_folder = folder_id or connection.folder_id or settings.GOOGLE_DRIVE_FOLDER_ID or None
        access_token = await self._refresh_access_token(connection.refresh_token)
        data = await file.read()
        if not file.filename:
            raise StorageError("Uploaded file is missing a filename.")
        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"

        metadata: dict[str, str] = {"name": file.filename}
        if target_folder:
            metadata["parents"] = [target_folder]  # type: ignore[assignment]

        files = {
            "metadata": ("metadata", json.dumps(metadata), "application/json; charset=UTF-8"),
            "file": (file.filename, data, mime_type),
        }
        params = {"uploadType": "multipart", "fields": "id,name,webViewLink"}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                GOOGLE_DRIVE_UPLOAD_URL,
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
                files=files,
            )
        if response.status_code >= 400:
            logger.warning(
                "Google Drive upload failed",
                extra={"status_code": response.status_code, "body": response.text[:500]},
            )
            raise StorageError("Google Drive upload failed.")

        payload = response.json()
        file_id = payload["id"]
        web_view_link = payload.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"
        return DriveUploadResult(
            file_url=web_view_link,
            file_name=payload.get("name") or file.filename,
            provider="google_drive",
        )

    async def download_file(self, *, current_user: User, file_id: str) -> tuple[bytes, str, str, Optional[str]]:
        connection = await self.get_connection(current_user.id)
        if connection is None:
            raise StorageError("Google Drive is not connected for this account.")

        access_token = await self._refresh_access_token(connection.refresh_token)
        metadata = await self._fetch_file_metadata(access_token, file_id)
        mime_type = metadata.get("mimeType") or "application/octet-stream"
        filename = metadata.get("name") or file_id
        web_view_link = metadata.get("webViewLink")

        if mime_type.startswith("application/vnd.google-apps."):
            export_mime = self._export_mime_for_google_file(mime_type)
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(
                    f"{GOOGLE_DRIVE_API_URL}/files/{file_id}/export",
                    params={"mimeType": export_mime},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            if response.status_code != 200:
                raise StorageError("Could not export the selected Google Drive file.")
            data = response.content
            filename = self._filename_with_extension(filename, export_mime)
            return data, filename, export_mime, web_view_link

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{GOOGLE_DRIVE_API_URL}/files/{file_id}",
                params={"alt": "media", "supportsAllDrives": "true"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code != 200:
            raise StorageError("Could not download the selected Google Drive file.")
        return response.content, filename, mime_type, web_view_link

    async def _exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
        if response.status_code != 200:
            raise AuthenticationError("Failed to exchange Google auth code.")
        return response.json()

    async def _fetch_userinfo(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code != 200:
            raise AuthenticationError("Failed to fetch Google user info.")
        return response.json()

    async def _refresh_access_token(self, refresh_token: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code != 200:
            raise AuthenticationError("Failed to refresh Google access token.")
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise AuthenticationError("Google did not return an access token.")
        return token

    async def _fetch_file_metadata(self, access_token: str, file_id: str) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{GOOGLE_DRIVE_API_URL}/files/{file_id}",
                params={"fields": "id,name,mimeType,webViewLink,size,modifiedTime", "supportsAllDrives": "true"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if response.status_code != 200:
            raise StorageError("Could not read Google Drive file metadata.")
        return response.json()

    @staticmethod
    def _export_mime_for_google_file(mime_type: str) -> str:
        if mime_type == "application/vnd.google-apps.document":
            return "text/plain"
        if mime_type == "application/vnd.google-apps.spreadsheet":
            return "text/csv"
        if mime_type == "application/vnd.google-apps.presentation":
            return "text/plain"
        return "text/plain"

    @staticmethod
    def _filename_with_extension(filename: str, mime_type: str) -> str:
        extension = {
            "text/plain": ".txt",
            "text/csv": ".csv",
            "application/pdf": ".pdf",
            "text/markdown": ".md",
        }.get(mime_type)
        if not extension:
            return filename
        base = filename.rsplit(".", 1)[0]
        return f"{base}{extension}"
