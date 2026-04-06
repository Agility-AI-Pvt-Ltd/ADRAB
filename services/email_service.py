"""Email delivery service with SMTP and local-dev logging fallback."""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)


class EmailService:
    async def send_password_reset_email(self, recipient_email: str, recipient_name: str, reset_link: str) -> None:
        subject = "Reset your Lyfshilp AI Doc Tool password"
        body = (
            f"Hi {recipient_name},\n\n"
            "We received a request to reset your password for Lyfshilp AI Doc Tool.\n\n"
            f"Reset your password here:\n{reset_link}\n\n"
            f"This link will expire in {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes and can only be used once.\n"
            "If you did not request this, you can safely ignore this email.\n\n"
            "Regards,\n"
            "Lyfshilp AI Doc Tool"
        )

        if not settings.SMTP_HOST or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
            logger.warning(
                "SMTP not configured; password reset link generated for local use | email=%s | link=%s",
                recipient_email,
                reset_link,
            )
            return

        await asyncio.to_thread(
            self._send_via_smtp,
            recipient_email,
            subject,
            body,
        )

    def _send_via_smtp(self, recipient_email: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = settings.EMAIL_FROM
        message["To"] = recipient_email
        message["Subject"] = subject
        message.set_content(body)

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)
