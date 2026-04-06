"""
Logging Configuration
Structured JSON logging (production) or human-readable text (development).
"""

import logging
import sys

from core.config import settings



def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    if settings.LOG_FORMAT == "json":
        try:
            import structlog  # optional dependency for JSON logs

            structlog.configure(
                wrapper_class=structlog.make_filtering_bound_logger(level),
                logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
            )
        except ImportError:
            _configure_standard(level)
    else:
        _configure_standard(level)


def _configure_standard(level: int) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    # Silence noisy third-party loggers
    for noisy in ("httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
