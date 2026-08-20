"""crm_client.py — httpx замокан, никаких реальных сетевых вызовов."""

import pytest

import crm_client
from config import Config


class _FakeResponse:
    def __init__(self, status_code: int = 200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data if json_data is not None else {}

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeAsyncClient:
    calls: list = []
    response = _FakeResponse()

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None, headers=None):
        _FakeAsyncClient.calls.append({"method": "GET", "url": url, "params": params, "headers": headers})
        return _FakeAsyncClient.response

    async def post(self, url, json=None, headers=None):
        _FakeAsyncClient.calls.append({"method": "POST", "url": url, "json": json, "headers": headers})
        return _FakeAsyncClient.response


@pytest.fixture(autouse=True)
def _reset_fake_client(monkeypatch):
    _FakeAsyncClient.calls = []
    _FakeAsyncClient.response = _FakeResponse()
    monkeypatch.setattr(crm_client.httpx, "AsyncClient", _FakeAsyncClient)
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
async def test_get_knowledge_base_returns_content():
    _FakeAsyncClient.response = _FakeResponse(json_data={"content": "Целевые каналы: @niche_channel"})
    content = await crm_client.get_knowledge_base(_cfg())
    assert content == "Целевые каналы: @niche_channel"


@pytest.mark.asyncio
async def test_push_draft_omits_none_fields():
    await crm_client.push_draft(
        _cfg(),
        external_id="chan:1",
        target_channel_username="chan",
        post_link="https://t.me/chan/1",
        post_excerpt=None,
        draft_comment="Отличный пост!",
    )
    call = _FakeAsyncClient.calls[0]
    assert call["json"]["draftComment"] == "Отличный пост!"
    assert "postExcerpt" not in call["json"]


@pytest.mark.asyncio
async def test_get_approved_drafts_parses_response():
    _FakeAsyncClient.response = _FakeResponse(
        json_data={
            "drafts": [
                {
                    "id": "d1",
                    "channelId": "chan1",
                    "targetChannelUsername": "somechannel",
                    "postLink": "https://t.me/somechannel/5",
                    "draftComment": "текст",
                }
            ]
        }
    )
    drafts = await crm_client.get_approved_drafts(_cfg())
    assert len(drafts) == 1
    assert drafts[0].id == "d1"
    assert drafts[0].post_link == "https://t.me/somechannel/5"


@pytest.mark.asyncio
async def test_complete_draft_with_error():
    await crm_client.complete_draft(_cfg(), "d1", error="flood wait")
    call = _FakeAsyncClient.calls[0]
    assert call["json"] == {"errorMessage": "flood wait"}
    assert "drafts/d1/complete" in call["url"]


@pytest.mark.asyncio
async def test_complete_draft_without_error_sends_empty_body():
    await crm_client.complete_draft(_cfg(), "d1")
    call = _FakeAsyncClient.calls[0]
    assert call["json"] == {}
