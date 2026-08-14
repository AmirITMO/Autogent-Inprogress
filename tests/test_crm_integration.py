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


def _not_configured_cfg() -> AppConfig:
    return AppConfig(crm_api_url=None, crm_api_key="", crm_channel_id="")


# --- push_contact -------------------------------------------------------

@pytest.mark.asyncio
async def test_push_contact_noop_when_not_configured():
    await crm_integration.push_contact(
        _not_configured_cfg(), external_id="1", status=crm_integration.STATUS_WRITTEN, dialogue=[],
    )
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_push_contact_sends_required_fields():
    cfg = _configured_cfg()
    dialogue = [{"from": "scout", "text": "Добрый день", "at": "2026-08-14T10:00:00"}]

    await crm_integration.push_contact(
        cfg, external_id="12345", status=crm_integration.STATUS_WRITTEN, dialogue=dialogue,
    )

    assert len(_FakeAsyncClient.calls) == 1
    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/integrations/scout-agent/contacts"
    assert call["headers"]["X-Api-Key"] == "secret-key"
    assert call["json"]["channelId"] == "channel-1"
    assert call["json"]["externalId"] == "12345"
    assert call["json"]["status"] == "WRITTEN"
    assert call["json"]["dialogue"] == dialogue


@pytest.mark.asyncio
async def test_push_contact_includes_optional_fields_when_given():
    cfg = _configured_cfg()
    await crm_integration.push_contact(
        cfg, external_id="1", status=crm_integration.STATUS_REPLIED, dialogue=[],
        name="Иван", telegram_username="ivan123", source_chat_name="Город 1",
        trigger_message="ищу мебельщика", trigger_reason="прямой запрос",
        outreach_account="Амир",
    )
    payload = _FakeAsyncClient.calls[0]["json"]
    assert payload["name"] == "Иван"
    assert payload["telegramUsername"] == "ivan123"
    assert payload["sourceChatName"] == "Город 1"
    assert payload["triggerMessage"] == "ищу мебельщика"
    assert payload["triggerReason"] == "прямой запрос"
    assert payload["outreachAccount"] == "Амир"


@pytest.mark.asyncio
async def test_push_contact_omits_empty_optional_fields():
    cfg = _configured_cfg()
    await crm_integration.push_contact(
        cfg, external_id="1", status=crm_integration.STATUS_WRITTEN, dialogue=[],
    )
    payload = _FakeAsyncClient.calls[0]["json"]
    for key in ("name", "telegramUsername", "sourceChatName", "triggerMessage", "triggerReason", "outreachAccount"):
        assert key not in payload


@pytest.mark.asyncio
async def test_push_contact_does_not_raise_on_http_error(monkeypatch):
    cfg = _configured_cfg()

    class _FailingClient(_FakeAsyncClient):
        async def post(self, *args, **kwargs):
            import httpx
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(crm_integration.httpx, "AsyncClient", _FailingClient)
    await crm_integration.push_contact(
        cfg, external_id="1", status=crm_integration.STATUS_WRITTEN, dialogue=[],
    )  # не должно поднять исключение


@pytest.mark.asyncio
async def test_push_contact_logs_warning_on_4xx(caplog):
    cfg = _configured_cfg()
    _FakeAsyncClient.response = _FakeResponse(status_code=400, text="unknown_channel")
    with caplog.at_level("WARNING"):
        await crm_integration.push_contact(
            cfg, external_id="1", status=crm_integration.STATUS_WRITTEN, dialogue=[],
        )
    assert any("400" in r.message for r in caplog.records)


# --- push_lead ------------------------------------------------------------

@pytest.mark.asyncio
async def test_push_lead_noop_when_not_configured():
    await crm_integration.push_lead(_not_configured_cfg(), contact_external_id="1", title="тест")
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_push_lead_sends_expected_payload():
    cfg = _configured_cfg()
    await crm_integration.push_lead(
        cfg, contact_external_id="12345", title="Иван — кухня на заказ",
        contact_name="Иван", contact="@ivan123",
    )

    assert len(_FakeAsyncClient.calls) == 1
    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/integrations/scout-agent/leads"
    assert call["headers"]["X-Api-Key"] == "secret-key"
    assert call["json"] == {
        "channelId": "channel-1",
        "contactExternalId": "12345",
        "title": "Иван — кухня на заказ",
        "contactName": "Иван",
        "contact": "@ivan123",
    }


@pytest.mark.asyncio
async def test_push_lead_strips_trailing_slash_from_base_url():
    cfg = _configured_cfg(crm_api_url="https://crm.example.com/")
    await crm_integration.push_lead(cfg, contact_external_id="1", title="тест")
    assert _FakeAsyncClient.calls[0]["url"] == "https://crm.example.com/api/integrations/scout-agent/leads"


@pytest.mark.asyncio
async def test_push_lead_omits_empty_optional_fields():
    cfg = _configured_cfg()
    await crm_integration.push_lead(cfg, contact_external_id="1", title="тест")
    payload = _FakeAsyncClient.calls[0]["json"]
    assert "contact" not in payload
    assert "contactName" not in payload


@pytest.mark.asyncio
async def test_push_lead_does_not_raise_on_http_error(monkeypatch):
    cfg = _configured_cfg()

    class _FailingClient(_FakeAsyncClient):
        async def post(self, *args, **kwargs):
            import httpx
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(crm_integration.httpx, "AsyncClient", _FailingClient)
    await crm_integration.push_lead(cfg, contact_external_id="1", title="тест")  # не должно поднять


@pytest.mark.asyncio
async def test_push_lead_logs_warning_on_4xx(caplog):
    cfg = _configured_cfg()
    _FakeAsyncClient.response = _FakeResponse(status_code=400, text="unknown_channel")
    with caplog.at_level("WARNING"):
        await crm_integration.push_lead(cfg, contact_external_id="1", title="тест")
    assert any("400" in r.message for r in caplog.records)


# --- push_metrics -----------------------------------------------------------

@pytest.mark.asyncio
async def test_push_metrics_noop_when_not_configured():
    await crm_integration.push_metrics(_not_configured_cfg(), {"messagesScanned": 5})
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_push_metrics_includes_channel_id_and_snapshot():
    cfg = _configured_cfg()
    snapshot = {"messagesScanned": 10, "triggersFound": 2, "outboundSent": 1, "responsesReceived": 1, "accounts": []}
    await crm_integration.push_metrics(cfg, snapshot)

    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/integrations/scout-agent/metrics"
    assert call["json"]["channelId"] == "channel-1"
    assert call["json"]["messagesScanned"] == 10
    assert call["json"]["triggersFound"] == 2
    assert call["json"]["responsesReceived"] == 1
