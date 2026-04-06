"""
Application Factory
Creates and configures the FastAPI app instance.
"""

from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.router import api_router
from core.config import settings
from core.logging import configure_logging, get_logger
from db.session import close_db, get_db_context, init_db
from services.ai_review_guidance_service import AIReviewGuidanceService
from services.document_guidance_service import DocumentGuidanceService
from services.emoji_guidance_service import EmojiGuidanceService
from services.few_shot_example_service import FewShotExampleService
from services.stakeholder_guidance_service import StakeholderGuidanceService
from services.system_prompt_service import SystemPromptService
from scripts.seed_ai_review_guidance import seed_ai_review_guidance
from scripts.seed_document_guidance import seed_document_guidance
from scripts.seed_emoji_guidance import seed_emoji_guidance
from scripts.seed_few_shot_examples import seed_few_shot_examples
from scripts.seed_first_founder import seed_first_founder
from scripts.seed_stakeholder_guidance import seed_stakeholder_guidance
from scripts.seed_system_prompt import seed_system_prompt
from utils.exception_handlers import register_exception_handlers

logger = get_logger(__name__)


async def run_startup_seed_scripts() -> None:
    """
    Run the repo's reusable seed scripts on app startup.
    These functions are idempotent in normal mode and mirror the manual scripts.
    """
    seed_tasks = [
        ("seed_first_founder", seed_first_founder),
        ("seed_system_prompt", seed_system_prompt),
        ("seed_stakeholder_guidance", seed_stakeholder_guidance),
        ("seed_ai_review_guidance", seed_ai_review_guidance),
        ("seed_emoji_guidance", seed_emoji_guidance),
        ("seed_document_guidance", seed_document_guidance),
        ("seed_few_shot_examples", seed_few_shot_examples),
    ]

    for label, task in seed_tasks:
        logger.info("Running startup seed script: %s", label)
        await task(overwrite=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    configure_logging()
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    if settings.DEBUG or settings.AUTO_INIT_DB:
        # In local/dev, auto-create tables. Set AUTO_INIT_DB=false to require migrations.
        await init_db()
        async with get_db_context() as session:
            await AIReviewGuidanceService(session).ensure_seeded()
            await DocumentGuidanceService(session).ensure_seeded()
            await EmojiGuidanceService(session).ensure_seeded()
            await FewShotExampleService(session).ensure_seeded()
            await StakeholderGuidanceService(session).ensure_seeded()
            await SystemPromptService(session).ensure_seeded()
        await run_startup_seed_scripts()

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

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
