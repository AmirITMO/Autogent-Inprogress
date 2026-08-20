"""scraper.py — Apify/OpenAI замокан, никаких реальных сетевых вызовов."""

import json

import httpx
import pytest

import scraper
from config import Config


class _FakeResponse:
    def __init__(self, status_code: int = 200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data if json_data is not None else []

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=self)


class _FakeAsyncClient:
    # queue — по одному ответу на каждый вызов post(), в порядке вызова
    # (hashtag-поиск идёт первым, текстовый — вторым, см. asyncio.gather).
    queue: list = []
    calls: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, params=None, json=None, headers=None):
        _FakeAsyncClient.calls.append({"url": url, "params": params, "json": json})
        if not _FakeAsyncClient.queue:
            return _FakeResponse(json_data=[])
        return _FakeAsyncClient.queue.pop(0)


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
    _FakeAsyncClient.queue = []
    _FakeAsyncClient.calls = []
    _FakeOpenAI.response_content = "{}"
    _FakeOpenAI.raise_error = False
    monkeypatch.setattr(scraper.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(scraper, "AsyncOpenAI", _FakeOpenAI)
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


def test_extract_account_maps_known_field_variants():
    item = {
        "username": "furniture_spb",
        "fullName": "Мебель СПб",
        "biography": "Изготавливаем мебель на заказ, СПб",
        "businessCategoryName": "Furniture",
        "followersCount": 4200,
        "businessEmail": "hi@furniture.spb",
        "id": "123",
    }
    acc = scraper._extract_account(item)
    assert acc.username == "furniture_spb"
    assert acc.full_name == "Мебель СПб"
    assert acc.followers == 4200
    assert acc.contact_info == "hi@furniture.spb"


def test_extract_account_returns_none_without_username():
    assert scraper._extract_account({"biography": "no username here"}) is None


@pytest.mark.asyncio
async def test_search_accounts_returns_empty_without_criteria():
    result = await scraper.search_accounts(_cfg(), {}, 10)
    assert result == []
    assert _FakeAsyncClient.calls == []  # ни одного запроса впустую


@pytest.mark.asyncio
async def test_search_accounts_combines_hashtag_and_text_search_and_ranks():
    _FakeAsyncClient.queue = [
        _FakeResponse(json_data=[{"username": "hash_match", "followersCount": 500, "biography": "мебель ручной работы"}]),
        _FakeResponse(json_data=[{"username": "text_match", "followersCount": 3000, "biography": "мебель, Москва"}]),
    ]
    _FakeOpenAI.response_content = json.dumps({"usernames": ["text_match", "hash_match"]})

    result = await scraper.search_accounts(
        _cfg(), {"keywords": ["мебель"], "niche": "мебель", "city": "Москва"}, 10
    )

    assert [a.username for a in result] == ["text_match", "hash_match"]


@pytest.mark.asyncio
async def test_search_accounts_applies_follower_range_before_ranking():
    _FakeAsyncClient.queue = [
        _FakeResponse(json_data=[
            {"username": "too_small", "followersCount": 50},
            {"username": "in_range", "followersCount": 5000},
        ]),
        _FakeResponse(json_data=[]),
    ]
    _FakeOpenAI.response_content = json.dumps({"usernames": ["in_range"]})

    result = await scraper.search_accounts(
        _cfg(), {"keywords": ["мебель"], "minFollowers": 1000, "maxFollowers": 100000}, 10
    )

    assert [a.username for a in result] == ["in_range"]


@pytest.mark.asyncio
async def test_search_accounts_respects_limit():
    _FakeAsyncClient.queue = [
        _FakeResponse(json_data=[{"username": f"acc{i}", "followersCount": 100} for i in range(5)]),
        _FakeResponse(json_data=[]),
    ]
    _FakeOpenAI.response_content = json.dumps({"usernames": [f"acc{i}" for i in range(5)]})

    result = await scraper.search_accounts(_cfg(), {"keywords": ["мебель"]}, 2)

    assert len(result) == 2


@pytest.mark.asyncio
async def test_search_accounts_survives_apify_error_on_one_axis():
    _FakeAsyncClient.queue = [
        _FakeResponse(status_code=500),
        _FakeResponse(json_data=[{"username": "survivor", "followersCount": 100}]),
    ]
    _FakeOpenAI.response_content = json.dumps({"usernames": ["survivor"]})

    result = await scraper.search_accounts(_cfg(), {"keywords": ["мебель"], "niche": "мебель"}, 10)

    assert [a.username for a in result] == ["survivor"]


@pytest.mark.asyncio
async def test_search_accounts_falls_back_to_unsorted_when_ranking_fails():
    _FakeAsyncClient.queue = [
        _FakeResponse(json_data=[{"username": "acc1", "followersCount": 100}]),
        _FakeResponse(json_data=[]),
    ]
    _FakeOpenAI.raise_error = True

    result = await scraper.search_accounts(_cfg(), {"keywords": ["мебель"]}, 10)

    assert [a.username for a in result] == ["acc1"]
