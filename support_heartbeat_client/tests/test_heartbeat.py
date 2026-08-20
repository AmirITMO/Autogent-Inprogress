"""heartbeat.py — httpx замокан, никаких реальных сетевых вызовов."""

import pytest

import heartbeat
from heartbeat import HeartbeatConfig, send_heartbeat


class _FakeResponse:
    def __init__(self, status_code: int = 200):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeAsyncClient:
    calls: list = []
    response = _FakeResponse()
    raises: Exception | None = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None):
        if _FakeAsyncClient.raises:
            raise _FakeAsyncClient.raises
        _FakeAsyncClient.calls.append({"url": url, "json": json})
        return _FakeAsyncClient.response


@pytest.fixture(autouse=True)
def _reset_fake_client(monkeypatch):
    _FakeAsyncClient.calls = []
    _FakeAsyncClient.response = _FakeResponse()
    _FakeAsyncClient.raises = None
    monkeypatch.setattr(heartbeat.httpx, "AsyncClient", _FakeAsyncClient)
    yield


@pytest.mark.asyncio
async def test_send_heartbeat_posts_status_and_detail():
    cfg = HeartbeatConfig(url="https://crm.example.com/api/support/heartbeat/tok123")

    await send_heartbeat(cfg, status="DEGRADED", detail="OpenAI 500")

    call = _FakeAsyncClient.calls[0]
    assert call["url"] == "https://crm.example.com/api/support/heartbeat/tok123"
    assert call["json"] == {"status": "DEGRADED", "detail": "OpenAI 500"}


@pytest.mark.asyncio
async def test_send_heartbeat_defaults_to_ok():
    cfg = HeartbeatConfig(url="https://crm.example.com/api/support/heartbeat/tok123")

    await send_heartbeat(cfg)

    assert _FakeAsyncClient.calls[0]["json"] == {"status": "OK", "detail": None}


@pytest.mark.asyncio
async def test_send_heartbeat_without_url_is_noop():
    cfg = HeartbeatConfig(url="")

    await send_heartbeat(cfg)

    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_send_heartbeat_swallows_network_errors():
    cfg = HeartbeatConfig(url="https://crm.example.com/api/support/heartbeat/tok123")
    _FakeAsyncClient.raises = ConnectionError("boom")

    await send_heartbeat(cfg)  # не должно поднять исключение


@pytest.mark.asyncio
async def test_send_heartbeat_swallows_http_error_status():
    cfg = HeartbeatConfig(url="https://crm.example.com/api/support/heartbeat/tok123")
    _FakeAsyncClient.response = _FakeResponse(status_code=404)

    await send_heartbeat(cfg)  # not_found на платформе — тоже не должно ронять сервис
