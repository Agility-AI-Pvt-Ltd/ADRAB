"""
Application Configuration
Centralised settings loaded from environment variables.
Uses pydantic-settings for validation and type coercion.
"""

from functools import lru_cache
from typing import List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    APP_NAME: str = "AI Document Review & Approval Tool"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, validation_alias="APP_DEBUG")
    AUTO_INIT_DB: bool = True
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: str  # Required — set in .env. Example: "https://adrab.vercel.app"

    # ── Auth & Security ───────────────────────────────────────────────────────
    SECRET_KEY: str                          # used to sign JWTs
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # Domain whitelist — only @agilityai.in emails may log in
    ALLOWED_EMAIL_DOMAIN: str = "agilityai.in"
    ALLOWED_EMAIL_EXCEPTIONS: str = ""
    FIRST_FOUNDER_NAME: str = "Sharad"
    FIRST_FOUNDER_EMAIL: str = "sharad@agilityai.in"
    FIRST_FOUNDER_PASSWORD: str = "password"

    # ── Google OAuth ──────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str  # Required — set in .env e.g. https://adrab.vercel.app/auth/google/callback
    FRONTEND_URL: str  # Required — set in .env e.g. https://adrab.vercel.app

    # ── PostgreSQL (with async + pooling) ─────────────────────────────────────
    DATABASE_URL_OVERRIDE: Optional[str] = Field(default=None, validation_alias="DATABASE_URL")
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str = "lyfshilp"

    # Connection pool tunables
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800        # seconds before a connection is recycled
    DB_POOL_PRE_PING: bool = True      # validate connections before checkout

    @property
    def DATABASE_URL(self) -> str:
        """Async DSN for asyncpg / SQLAlchemy async."""
        if self.DATABASE_URL_OVERRIDE:
            url = self.DATABASE_URL_OVERRIDE
            if url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

            if url.startswith("postgresql+asyncpg://"):
                parsed = urlsplit(url)
                query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
                normalized_query: list[tuple[str, str]] = []
                for key, value in query_pairs:
                    if key == "sslmode":
                        normalized_query.append(("ssl", value))
                    elif key == "channel_binding":
                        continue
                    else:
                        normalized_query.append((key, value))
                return urlunsplit(
                    (
                        parsed.scheme,
                        parsed.netloc,
                        parsed.path,
                        urlencode(normalized_query),
                        parsed.fragment,
                    )
                )

            return url
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── OpenAI ────────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_MAX_TOKENS: int = 2000

    # ── File Storage (local disk) ─────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"           # "json" | "text"

    # ── Email / Password Reset ───────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM: str = "noreply@agilityai.in"
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def ALLOWED_EMAIL_EXCEPTION_LIST(self) -> List[str]:
        return [email.strip().lower() for email in self.ALLOWED_EMAIL_EXCEPTIONS.split(",") if email.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton of Settings."""
    return Settings()


settings = get_settings()
