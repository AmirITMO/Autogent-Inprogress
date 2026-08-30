"""scraper.py — Apify/OpenAI замокан, никаких реальных сетевых вызовов."""

import json

import httpx
import pytest

import scraper
from config import Config


class _FakeResponse:
    def __init__(self, status_code: int = 200, json_data=None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data if json_data is not None else []
        self.text = text or json.dumps(self._json_data)

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=self)


class _FakeAsyncClient:
    # Ответы по акторам — ключ: подстрока актора в URL ("hashtag-scraper",
    # "search-scraper", "profile-scraper"). Каждый элемент списка — ответ на
    # очередной вызов этого актора (FIFO по актору, не глобально), так как
    # число вызовов profile-scraper зависит от того, сколько батчей нужно.
    queues: dict = {}
    calls: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, params=None, json=None, headers=None):
        _FakeAsyncClient.calls.append({"url": url, "params": params, "json": json})
        for key, queue in _FakeAsyncClient.queues.items():
            if key in url:
                if not queue:
                    return _FakeResponse(json_data=[])
                return queue.pop(0)
        return _FakeResponse(json_data=[])


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
    _FakeAsyncClient.queues = {}
    _FakeAsyncClient.calls = []
    _FakeOpenAI.response_content = "{}"
    _FakeOpenAI.raise_error = False
    monkeypatch.setattr(scraper.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(scraper, "AsyncOpenAI", _FakeOpenAI)
    yield


def _cfg(tmp_path, **overrides) -> Config:
    defaults = dict(
        crm_api_url="https://crm.example.com",
        crm_api_key="test-key",
        openai_api_key="sk-test",
        apify_token="apify-test",
        seen_store_path=str(tmp_path / "seen.json"),
    )
    defaults.update(overrides)
    return Config(**defaults)


# --- extract_contacts ---


def test_extract_contacts_finds_telegram_via_tme_link():
    c = scraper.extract_contacts("пишите t.me/furniture_spb по вопросам", None)
    assert c["telegram"] == "https://t.me/furniture_spb"


def test_extract_contacts_finds_telegram_via_label():
    c = scraper.extract_contacts("тг: furniture_spb", None)
    assert c["telegram"] == "https://t.me/furniture_spb"


def test_extract_contacts_falls_back_to_external_url_for_telegram():
    c = scraper.extract_contacts("no telegram mention here", "https://t.me/furniture_spb")
    assert c["telegram"] == "https://t.me/furniture_spb"


def test_extract_contacts_finds_email():
    c = scraper.extract_contacts("пишите на hi@furniture.spb с вопросами", None)
    assert c["email"] == "hi@furniture.spb"


def test_extract_contacts_finds_ru_phone():
    c = scraper.extract_contacts("звоните 8-999-123-45-67", None)
    assert c["phone"] is not None
    assert len(c["phone"].replace("-", "").replace(" ", "")) >= 10


def test_extract_contacts_finds_international_phone():
    c = scraper.extract_contacts("call +1 555 123 4567", None)
    assert c["phone"] is not None


def test_extract_contacts_returns_none_for_plain_bio():
    c = scraper.extract_contacts("просто мебель ручной работы", None)
    assert c == {"telegram": None, "email": None, "phone": None}


# --- _extract_account ---


def test_extract_account_prefers_structured_email_over_bio_regex():
    item = {"username": "acc1", "businessEmail": "structured@acc.com", "biography": "bio@acc.com пишите"}
    acc = scraper._extract_account(item)
    assert acc.contact_info == "structured@acc.com"


def test_extract_account_falls_back_to_bio_regex_contact():
    item = {"username": "acc1", "biography": "пишите на bio@acc.com"}
    acc = scraper._extract_account(item)
    assert acc.contact_info == "bio@acc.com"


def test_extract_account_returns_none_without_username():
    assert scraper._extract_account({"biography": "no username here"}) is None


# --- _is_quota_error ---


@pytest.mark.parametrize(
    "text",
    [
        "Monthly usage hard limit exceeded",
        "insufficient funds on account",
        "Usage limit exceeded for this month",
    ],
)
def test_is_quota_error_detects_known_markers(text):
    assert scraper._is_quota_error(text) is True


def test_is_quota_error_false_for_unrelated_error():
    assert scraper._is_quota_error("actor input validation failed") is False


# --- search_accounts ---


@pytest.mark.asyncio
async def test_search_accounts_returns_empty_without_criteria(tmp_path):
    result = await scraper.search_accounts(_cfg(tmp_path), "chan1", {}, 10)
    assert result == []
    assert _FakeAsyncClient.calls == []


@pytest.mark.asyncio
async def test_search_accounts_two_stage_discovery_then_enrichment(tmp_path):
    _FakeAsyncClient.queues = {
        "hashtag-scraper": [_FakeResponse(json_data=[{"ownerUsername": "hash_match", "likesCount": 900}])],
        "search-scraper": [_FakeResponse(json_data=[{"username": "text_match", "followersCount": 3000}])],
        "profile-scraper": [
            _FakeResponse(
                json_data=[
                    {"username": "hash_match", "followersCount": 500, "biography": "мебель ручной работы"},
                    {"username": "text_match", "followersCount": 3000, "biography": "мебель, Москва"},
                ]
            )
        ],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["text_match", "hash_match"]})

    result = await scraper.search_accounts(
        _cfg(tmp_path), "chan1", {"keywords": ["мебель"], "niche": "мебель", "city": "Москва"}, 10
    )

    assert [a.username for a in result] == ["text_match", "hash_match"]
    # discovery-акторы не должны получать полные профильные данные напрямую —
    # только enrichment должен был реально вызваться с юзернеймами.
    enrich_calls = [c for c in _FakeAsyncClient.calls if "profile-scraper" in c["url"]]
    assert len(enrich_calls) == 1
    assert set(enrich_calls[0]["json"]["usernames"]) == {"hash_match", "text_match"}


@pytest.mark.asyncio
async def test_search_accounts_hashtag_discovery_filters_by_likes(tmp_path):
    _FakeAsyncClient.queues = {
        "hashtag-scraper": [
            _FakeResponse(
                json_data=[
                    {"ownerUsername": "tiny_account", "likesCount": 10},
                    {"ownerUsername": "real_account", "likesCount": 900},
                ]
            )
        ],
        "profile-scraper": [_FakeResponse(json_data=[{"username": "real_account", "followersCount": 5000}])],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["real_account"]})

    result = await scraper.search_accounts(_cfg(tmp_path), "chan1", {"keywords": ["мебель"]}, 10)

    assert [a.username for a in result] == ["real_account"]
    enrich_calls = [c for c in _FakeAsyncClient.calls if "profile-scraper" in c["url"]]
    assert enrich_calls[0]["json"]["usernames"] == ["real_account"]


@pytest.mark.asyncio
async def test_search_accounts_skips_already_seen_usernames(tmp_path):
    cfg = _cfg(tmp_path)
    import seen_store

    seen_store.save_seen(cfg.seen_store_path, "chan1", {"already_known"})

    _FakeAsyncClient.queues = {
        "search-scraper": [
            _FakeResponse(
                json_data=[{"username": "already_known", "followersCount": 100}, {"username": "brand_new", "followersCount": 100}]
            )
        ],
        "profile-scraper": [_FakeResponse(json_data=[{"username": "brand_new", "followersCount": 100}])],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["brand_new"]})

    result = await scraper.search_accounts(_cfg(tmp_path, seen_store_path=cfg.seen_store_path), "chan1", {"niche": "мебель"}, 10)

    assert [a.username for a in result] == ["brand_new"]
    enrich_calls = [c for c in _FakeAsyncClient.calls if "profile-scraper" in c["url"]]
    assert enrich_calls[0]["json"]["usernames"] == ["brand_new"]


@pytest.mark.asyncio
async def test_search_accounts_returns_empty_when_all_candidates_already_seen(tmp_path):
    cfg = _cfg(tmp_path)
    import seen_store

    seen_store.save_seen(cfg.seen_store_path, "chan1", {"already_known"})

    _FakeAsyncClient.queues = {
        "search-scraper": [_FakeResponse(json_data=[{"username": "already_known", "followersCount": 100}])],
    }

    result = await scraper.search_accounts(cfg, "chan1", {"niche": "мебель"}, 10)

    assert result == []
    assert not any("profile-scraper" in c["url"] for c in _FakeAsyncClient.calls)


@pytest.mark.asyncio
async def test_search_accounts_records_seen_after_run(tmp_path):
    cfg = _cfg(tmp_path)
    _FakeAsyncClient.queues = {
        "search-scraper": [_FakeResponse(json_data=[{"username": "new_acc", "followersCount": 100}])],
        "profile-scraper": [_FakeResponse(json_data=[{"username": "new_acc", "followersCount": 100}])],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["new_acc"]})

    await scraper.search_accounts(cfg, "chan1", {"niche": "мебель"}, 10)

    import seen_store

    assert "new_acc" in seen_store.load_seen(cfg.seen_store_path, "chan1")


@pytest.mark.asyncio
async def test_search_accounts_applies_follower_range_after_enrichment(tmp_path):
    _FakeAsyncClient.queues = {
        "hashtag-scraper": [
            _FakeResponse(json_data=[{"ownerUsername": "too_small", "likesCount": 900}, {"ownerUsername": "in_range", "likesCount": 900}])
        ],
        "profile-scraper": [
            _FakeResponse(json_data=[{"username": "too_small", "followersCount": 50}, {"username": "in_range", "followersCount": 5000}])
        ],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["in_range"]})

    result = await scraper.search_accounts(
        _cfg(tmp_path), "chan1", {"keywords": ["мебель"], "minFollowers": 1000, "maxFollowers": 100000}, 10
    )

    assert [a.username for a in result] == ["in_range"]


@pytest.mark.asyncio
async def test_search_accounts_raises_quota_exhausted_on_apify_quota_error(tmp_path):
    _FakeAsyncClient.queues = {
        "hashtag-scraper": [_FakeResponse(status_code=402, text="Monthly usage hard limit reached")],
    }

    with pytest.raises(scraper.ApifyQuotaExhausted):
        await scraper.search_accounts(_cfg(tmp_path), "chan1", {"keywords": ["мебель"]}, 10)


@pytest.mark.asyncio
async def test_search_accounts_survives_apify_error_on_one_axis(tmp_path):
    _FakeAsyncClient.queues = {
        "hashtag-scraper": [_FakeResponse(status_code=500, text="internal error")],
        "search-scraper": [_FakeResponse(json_data=[{"username": "survivor", "followersCount": 100}])],
        "profile-scraper": [_FakeResponse(json_data=[{"username": "survivor", "followersCount": 100}])],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": ["survivor"]})

    result = await scraper.search_accounts(_cfg(tmp_path), "chan1", {"keywords": ["мебель"], "niche": "мебель"}, 10)

    assert [a.username for a in result] == ["survivor"]


@pytest.mark.asyncio
async def test_search_accounts_falls_back_to_unsorted_when_ranking_fails(tmp_path):
    _FakeAsyncClient.queues = {
        "search-scraper": [_FakeResponse(json_data=[{"username": "acc1", "followersCount": 100}])],
        "profile-scraper": [_FakeResponse(json_data=[{"username": "acc1", "followersCount": 100}])],
    }
    _FakeOpenAI.raise_error = True

    result = await scraper.search_accounts(_cfg(tmp_path), "chan1", {"niche": "мебель"}, 10)

    assert [a.username for a in result] == ["acc1"]


@pytest.mark.asyncio
async def test_search_accounts_respects_limit(tmp_path):
    _FakeAsyncClient.queues = {
        "search-scraper": [_FakeResponse(json_data=[{"username": f"acc{i}", "followersCount": 100} for i in range(5)])],
        "profile-scraper": [_FakeResponse(json_data=[{"username": f"acc{i}", "followersCount": 100} for i in range(5)])],
    }
    _FakeOpenAI.response_content = json.dumps({"usernames": [f"acc{i}" for i in range(5)]})

    result = await scraper.search_accounts(_cfg(tmp_path), "chan1", {"niche": "мебель"}, 2)

    assert len(result) == 2
