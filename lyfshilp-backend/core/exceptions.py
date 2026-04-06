"""
Custom Application Exceptions
Centralised hierarchy for clean error handling across the codebase.
"""

from typing import Any, Optional


class AppException(Exception):
    """Base for all application-level exceptions."""

    status_code: int = 500
    default_message: str = "An unexpected error occurred."

    def __init__(self, message: Optional[str] = None, detail: Any = None):
        self.message = message or self.default_message
        self.detail = detail
        super().__init__(self.message)


class AuthenticationError(AppException):
    status_code = 401
    default_message = "Authentication failed."


class ForbiddenError(AppException):
    status_code = 403
    default_message = "You do not have permission to perform this action."


class NotFoundError(AppException):
    status_code = 404
    default_message = "The requested resource was not found."


class ValidationError(AppException):
    status_code = 422
    default_message = "Validation error."


class ConflictError(AppException):
    status_code = 409
    default_message = "A resource conflict occurred."


class AIServiceError(AppException):
    status_code = 502
    default_message = "The AI service returned an unexpected response."


class StorageError(AppException):
    status_code = 502
    default_message = "A file storage error occurred."
