from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.ai_service import AIService


class _FakeBadRequest:
    def __init__(self, message: str) -> None:
        self._message = message

    def __str__(self) -> str:
        return self._message


@pytest.mark.asyncio
async def test_call_uses_max_completion_tokens() -> None:
    service = AIService(system_prompt="system")
    create = AsyncMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="Draft output"))]
        )
    )
    service._client.chat.completions.create = create

    result = await service._call("Write a draft", operation="generate_draft")

    assert result == "Draft output"
    kwargs = create.await_args.kwargs
    assert "max_completion_tokens" in kwargs
    assert "max_tokens" not in kwargs


def test_format_bad_request_message_for_legacy_max_tokens() -> None:
    message = "Unsupported parameter: 'max_tokens' is not compatible with this model."

    formatted = AIService._format_bad_request_message(_FakeBadRequest(message))

    assert "legacy max_tokens parameter" in formatted


def test_format_bad_request_message_for_invalid_model() -> None:
    message = "The model `gpt-5.3` does not exist or you do not have access to it."

    formatted = AIService._format_bad_request_message(_FakeBadRequest(message))

    assert "is unavailable or invalid" in formatted
