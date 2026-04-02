"""
Exception Handlers
Maps AppException subclasses to structured JSON error responses.
Registered on the FastAPI app at startup.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from core.exceptions import AppException
from core.logging import get_logger

logger = get_logger(__name__)


def _error_body(status_code: int, message: str, detail=None) -> dict:
    body = {"error": {"code": status_code, "message": message}}
    if detail is not None:
        body["error"]["detail"] = detail
    return body


def register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        logger.warning(
            "Application error",
            extra={"path": request.url.path, "message": exc.message, "status": exc.status_code},
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.status_code, exc.message, exc.detail),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "Unhandled exception",
            extra={"path": request.url.path, "error": str(exc)},
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content=_error_body(500, "An unexpected server error occurred."),
        )
