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


@pytest.mark.asyncio
async def test_build_search_queries_returns_empty_for_blank_kb():
    result = await scraper.build_search_queries(_cfg(), "   ")
    assert result == []
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_build_search_queries_parses_and_caps():
    _FakeOpenAI.response_content = json.dumps({"queries": ["q1", "q2", "q3", "q4"]})
    result = await scraper.build_search_queries(_cfg(), "мебель на заказ, Москва", max_queries=2)
    assert result == ["q1", "q2"]


@pytest.mark.asyncio
async def test_build_search_queries_falls_back_on_llm_error():
    _FakeOpenAI.raise_error = True
    result = await scraper.build_search_queries(_cfg(), "мебель на заказ")
    assert result == []


@pytest.mark.asyncio
async def test_discover_candidate_domains_extracts_and_dedupes():
    _FakeAsyncClient.queue = [
        _FakeResponse(json_data=[{"organicResults": [{"url": "https://a.example.com/x"}, {"url": "https://b.example.com"}]}]),
        _FakeResponse(json_data=[{"organicResults": [{"url": "https://a.example.com/y"}]}]),
    ]

    domains = await scraper.discover_candidate_domains(_cfg(), ["q1", "q2"], limit_per_query=10)

    assert domains == ["a.example.com", "b.example.com"]


@pytest.mark.asyncio
async def test_discover_candidate_domains_survives_one_query_failing():
    _FakeAsyncClient.queue = [
        _FakeResponse(status_code=500),
        _FakeResponse(json_data=[{"organicResults": [{"url": "https://survivor.example.com"}]}]),
    ]

    domains = await scraper.discover_candidate_domains(_cfg(), ["bad", "good"], limit_per_query=10)

    assert domains == ["survivor.example.com"]


@pytest.mark.asyncio
async def test_crawl_site_joins_markdown_and_caps_length():
    _FakeAsyncClient.queue = [_FakeResponse(json_data=[{"markdown": "a" * 5000}, {"markdown": "b" * 5000}])]

    text = await scraper.crawl_site(_cfg(), "example.com")

    assert text is not None
    assert len(text) == 8000


@pytest.mark.asyncio
async def test_crawl_site_returns_none_on_empty_items():
    _FakeAsyncClient.queue = [_FakeResponse(json_data=[])]
    text = await scraper.crawl_site(_cfg(), "example.com")
    assert text is None


@pytest.mark.asyncio
async def test_crawl_site_returns_none_on_apify_error():
    _FakeAsyncClient.queue = [_FakeResponse(status_code=500)]
    text = await scraper.crawl_site(_cfg(), "example.com")
    assert text is None


@pytest.mark.asyncio
async def test_extract_company_parses_fields():
    _FakeOpenAI.response_content = json.dumps(
        {"company_name": "ООО Ромашка", "contact_email": "info@romashka.ru", "matches": True, "reasoning": "делает мебель в Москве"}
    )

    company = await scraper.extract_company(_cfg(), "критерии", "romashka.ru", "содержимое сайта")

    assert company.company_name == "ООО Ромашка"
    assert company.contact_email == "info@romashka.ru"
    assert company.matches is True


@pytest.mark.asyncio
async def test_extract_company_returns_none_on_llm_error():
    _FakeOpenAI.raise_error = True
    company = await scraper.extract_company(_cfg(), "критерии", "romashka.ru", "содержимое сайта")
    assert company is None
