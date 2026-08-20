"""crm_client.py — httpx замокан, никаких реальных сетевых вызовов."""

import pytest

import crm_client
from config import Config


class _FakeResponse:
    def __init__(self, status_code: int = 200, json_data: dict | None = None):
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
        openai_api_key="sk-test",
        apify_token="apify-test",
    )
    defaults.update(overrides)
    return Config(**defaults)


@pytest.mark.asyncio
async def test_get_pending_jobs_parses_response():
    _FakeAsyncClient.response = _FakeResponse(
        json_data={
            "jobs": [
                {
                    "id": "job1",
                    "channelId": "chan1",
                    "requestedCount": 20,
                    "searchProfile": {"id": "prof1", "name": "Мебельщики", "criteria": {"keywords": ["мебель"]}},
                }
            ]
        }
    )

    jobs = await crm_client.get_pending_jobs(_cfg())

    assert len(jobs) == 1
    assert jobs[0].id == "job1"
    assert jobs[0].requested_count == 20
    assert jobs[0].search_profile.criteria == {"keywords": ["мебель"]}


@pytest.mark.asyncio
async def test_get_pending_jobs_sends_status_param_and_api_key():
    _FakeAsyncClient.response = _FakeResponse(json_data={"jobs": []})

    await crm_client.get_pending_jobs(_cfg())

    call = _FakeAsyncClient.calls[0]
    assert call["method"] == "GET"
    assert call["params"] == {"status": "PENDING"}
    assert call["headers"]["X-Api-Key"] == "test-key"


@pytest.mark.asyncio
async def test_get_pending_jobs_raises_on_http_error():
    _FakeAsyncClient.response = _FakeResponse(status_code=401)

    with pytest.raises(RuntimeError):
        await crm_client.get_pending_jobs(_cfg())


@pytest.mark.asyncio
async def test_push_contact_sends_draft_message_and_omits_none_fields():
    await crm_client.push_contact(
        _cfg(), "chan1", external_id="acc1", username="furniture_spb", draft_message="Добрый день!"
    )

    call = _FakeAsyncClient.calls[0]
    assert call["json"]["draftMessage"] == "Добрый день!"
    assert call["json"]["username"] == "furniture_spb"
    assert "fullName" not in call["json"]


@pytest.mark.asyncio
async def test_complete_job_without_error():
    await crm_client.complete_job(_cfg(), "job1", found_count=18)

    call = _FakeAsyncClient.calls[0]
    assert call["json"] == {"foundCount": 18}
    assert "jobs/job1/complete" in call["url"]


@pytest.mark.asyncio
async def test_complete_job_with_error():
    await crm_client.complete_job(_cfg(), "job1", found_count=0, error="login challenge")

    call = _FakeAsyncClient.calls[0]
    assert call["json"] == {"foundCount": 0, "errorMessage": "login challenge"}
