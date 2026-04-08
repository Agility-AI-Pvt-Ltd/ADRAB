"""
Application Factory
Creates and configures the FastAPI app instance.
"""

from contextlib import asynccontextmanager
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from api.router import api_router
from core.config import settings
from core.logging import configure_logging, get_logger
from db.session import close_db, init_db
from utils.exception_handlers import register_exception_handlers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    configure_logging()
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    if settings.DEBUG or settings.AUTO_INIT_DB:
        # In local/dev and bootstrap deployments, auto-create tables on startup.
        try:
            await init_db()
        except Exception:
            logger.exception("Application startup failed during DB init phase")
            raise

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Shutting down — closing DB pool.")
    await close_db()


def create_app() -> FastAPI:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # ── Exception handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "version": settings.APP_VERSION}

    @app.get("/auth/google/callback", include_in_schema=False)
    @app.get("/api/v1/auth/google/callback", include_in_schema=False)
    async def google_callback_bridge(request: Request):
        """
        Compatibility bridge for Google OAuth redirects.

        Google can be configured to land on either the bare callback path or the
        versioned API path. In both cases we hand the browser back to the
        frontend callback page, preserving the original query string.
        """
        query = request.url.query
        target = f"{settings.FRONTEND_URL.rstrip('/')}/auth/google/callback"
        if query:
            target = f"{target}?{query}"
        return RedirectResponse(url=target, status_code=307)

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
