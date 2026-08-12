"""
Тесты crm_integration.py. httpx.AsyncClient замокан — никаких реальных
сетевых вызовов к CRM.
"""

import pytest

import crm_integration
from config import AppConfig


class _FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "{}"):
        self.status_code = status_code
        self.text = text


class _FakeAsyncClient:
    """Фейковый httpx.AsyncClient — записывает вызовы .post(), не ходит в сеть."""
    calls = []
    response = _FakeResponse()

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        _FakeAsyncClient.calls.append({"url": url, "json": json, "headers": headers})
        return _FakeAsyncClient.response


@pytest.fixture(autouse=True)
def _reset_fake_client(monkeypatch):
    _FakeAsyncClient.calls = []
    _FakeAsyncClient.response = _FakeResponse()
    monkeypatch.setattr(crm_integration.httpx, "AsyncClient", _FakeAsyncClient)
    # _disabled_warned — модульный флаг "уже залогировали, что интеграция
    # выключена"; сбрасываем между тестами, чтобы они не зависели от порядка.
    crm_integration._disabled_warned = False
    yield


def _configured_cfg(**overrides) -> AppConfig:
    defaults = dict(
        crm_api_url="https://crm.example.com",
        crm_api_key="secret-key",
        crm_channel_id="channel-1",
    )
    defaults.update(overrides)
    return AppConfig(**defaults)


@pytest.mark.asyncio
async def test_push_lead_noop_when_not_configured():
    cfg = AppConfig(crm_api_url=None, crm_api_key="", crm_channel_id="")
    await crm_integration.push_lead(cfg, {"problem": "нужна мебель"})
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_push_lead_sends_expected_payload():
    cfg = _configured_cfg()
    profile = {
        "problem": "ищет мебельщика",
        "niche_info": "интернет-магазин мебели",
        "display_name": "Иван",
        "username": "ivan123",
        "raw_last_message": "кто может сделать кухню?",
    }
    await crm_integration.push_lead(cfg, profile)

    assert len(_FakeAsyncClient.calls) == 1
    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/integrations/scout-agent/leads"
    assert call["headers"]["X-Api-Key"] == "secret-key"
    assert call["json"]["title"] == "ищет мебельщика"
    assert call["json"]["channelId"] == "channel-1"
    assert call["json"]["contact"] == "@ivan123"


@pytest.mark.asyncio
async def test_push_lead_strips_trailing_slash_from_base_url():
    cfg = _configured_cfg(crm_api_url="https://crm.example.com/")
    await crm_integration.push_lead(cfg, {"problem": "тест"})
    assert _FakeAsyncClient.calls[0]["url"] == "https://crm.example.com/api/integrations/scout-agent/leads"


@pytest.mark.asyncio
async def test_push_lead_falls_back_to_default_title():
    cfg = _configured_cfg()
    await crm_integration.push_lead(cfg, {})
    assert _FakeAsyncClient.calls[0]["json"]["title"] == "Лид из Telegram-группы"


@pytest.mark.asyncio
async def test_push_lead_omits_empty_optional_fields():
    cfg = _configured_cfg()
    await crm_integration.push_lead(cfg, {"problem": "тест"})
    payload = _FakeAsyncClient.calls[0]["json"]
    assert "contact" not in payload
    assert "contactName" not in payload
    assert "company" not in payload


@pytest.mark.asyncio
async def test_push_lead_does_not_raise_on_http_error(monkeypatch):
    cfg = _configured_cfg()

    class _FailingClient(_FakeAsyncClient):
        async def post(self, *args, **kwargs):
            import httpx
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(crm_integration.httpx, "AsyncClient", _FailingClient)
    await crm_integration.push_lead(cfg, {"problem": "тест"})  # не должно поднять исключение


@pytest.mark.asyncio
async def test_push_lead_logs_warning_on_4xx(caplog):
    cfg = _configured_cfg()
    _FakeAsyncClient.response = _FakeResponse(status_code=400, text="unknown_channel")
    with caplog.at_level("WARNING"):
        await crm_integration.push_lead(cfg, {"problem": "тест"})
    assert any("400" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_push_metrics_noop_when_not_configured():
    cfg = AppConfig(crm_api_url=None, crm_api_key="", crm_channel_id="")
    await crm_integration.push_metrics(cfg, {"messagesScanned": 5})
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_push_metrics_includes_channel_id_and_snapshot():
    cfg = _configured_cfg()
    snapshot = {"messagesScanned": 10, "triggersFound": 2, "outboundSent": 1, "accounts": []}
    await crm_integration.push_metrics(cfg, snapshot)

    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/integrations/scout-agent/metrics"
    assert call["json"]["channelId"] == "channel-1"
    assert call["json"]["messagesScanned"] == 10
    assert call["json"]["triggersFound"] == 2
