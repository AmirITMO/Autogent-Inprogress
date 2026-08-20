"""comment_writer.py — OpenAI замокан, никаких реальных сетевых вызовов."""

import json

import pytest

import comment_writer
from config import Config


class _FakeChoice:
    def __init__(self, content: str):
        self.message = type("Msg", (), {"content": content})()


class _FakeCompletion:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeOpenAI:
    response_content = "{}"
    raise_error = False

    def __init__(self, *args, **kwargs):
        self.chat = type("Chat", (), {"completions": self})()

    async def create(self, **kwargs):
        if _FakeOpenAI.raise_error:
            raise RuntimeError("openai down")
        return _FakeCompletion(_FakeOpenAI.response_content)


@pytest.fixture(autouse=True)
def _reset_fakes(monkeypatch):
    _FakeOpenAI.response_content = "{}"
    _FakeOpenAI.raise_error = False
    monkeypatch.setattr(comment_writer, "AsyncOpenAI", _FakeOpenAI)
    yield


def _cfg(**overrides) -> Config:
    defaults = dict(
        crm_api_url="https://crm.example.com",
        crm_api_key="test-key",
        crm_channel_id="chan1",
        openai_api_key="sk-test",
        tg_api_id=1,
        tg_api_hash="hash",
    )
    defaults.update(overrides)
    return Config(**defaults)


@pytest.mark.asyncio
async def test_extract_target_channels_returns_empty_for_blank_kb():
    result = await comment_writer.extract_target_channels(_cfg(), "   ")
    assert result == []


@pytest.mark.asyncio
async def test_extract_target_channels_strips_at_sign():
    _FakeOpenAI.response_content = json.dumps({"channels": ["@niche_channel", "another_channel"]})
    result = await comment_writer.extract_target_channels(_cfg(), "Комментируем в @niche_channel")
    assert result == ["niche_channel", "another_channel"]


@pytest.mark.asyncio
async def test_extract_target_channels_falls_back_on_error():
    _FakeOpenAI.raise_error = True
    result = await comment_writer.extract_target_channels(_cfg(), "текст")
    assert result == []


@pytest.mark.asyncio
async def test_should_comment_false_for_empty_post():
    result = await comment_writer.should_comment(_cfg(), "критерии", "   ")
    assert result is False


@pytest.mark.asyncio
async def test_should_comment_parses_relevant_true():
    _FakeOpenAI.response_content = json.dumps({"relevant": True})
    result = await comment_writer.should_comment(_cfg(), "критерии", "Ищем подрядчика по автоматизации")
    assert result is True


@pytest.mark.asyncio
async def test_should_comment_false_on_llm_error():
    _FakeOpenAI.raise_error = True
    result = await comment_writer.should_comment(_cfg(), "критерии", "текст поста")
    assert result is False


@pytest.mark.asyncio
async def test_draft_comment_returns_model_content():
    _FakeOpenAI.response_content = "Отличный пост, у нас похожий опыт был!"
    result = await comment_writer.draft_comment(_cfg(), "контекст", "текст поста")
    assert result == "Отличный пост, у нас похожий опыт был!"
