"""
Многосигнальный поиск целевых Instagram-аккаунтов через Apify (см.
docs/pipeline/spikes/FINDINGS.md — официальный Graph API не даёт поиска по
чужим аккаунтам в принципе). Раньше искали ТОЛЬКО по hashtag_medias_recent
через свой залогиненный аккаунт (aiograpi): узкий канал (пропускает
аккаунты без нужных хэштегов в последних постах) и риск для своего
аккаунта (приватный API не по ToS Instagram). Apify исполняет поиск на
своей инфраструктуре — наш аккаунт в скрейпинге больше не участвует.

Комбинируем две независимые оси поиска (хэштеги + свободный текст
ниша+гео), затем ранжируем всех кандидатов одним LLM-вызовом по ПОЛНЫМ
критериям (niche/city/excludeIf/followers) — раньше эти поля собирались
на интервью, но в сам поиск не попадали, использовались только в тексте
черновика оффера.
"""

import asyncio
import json
import logging
from dataclasses import dataclass

import httpx
from openai import AsyncOpenAI

from config import Config

logger = logging.getLogger(__name__)

APIFY_BASE_URL = "https://api.apify.com/v2"
RANKING_MODEL = "gpt-4o-mini"
MAX_CANDIDATES_FOR_RANKING = 60


@dataclass
class AccountData:
    external_id: str
    username: str
    full_name: str | None
    bio: str | None
    category: str | None
    followers: int | None
    contact_info: str | None


async def _run_apify_actor(cfg: Config, run_input: dict) -> list[dict]:
    """Запускает Apify actor синхронно и отдаёт элементы датасета — см.
    docs.apify.com/api/v2/act-run-sync-get-dataset-items-post. До 300с на
    прогон; таймаут ниже с запасом под сетевые накладные расходы."""
    actor_path = cfg.apify_instagram_actor.replace("/", "~")
    url = f"{APIFY_BASE_URL}/acts/{actor_path}/run-sync-get-dataset-items"
    async with httpx.AsyncClient(timeout=290) as client:
        resp = await client.post(url, params={"token": cfg.apify_token}, json=run_input)
        resp.raise_for_status()
        return resp.json()


def _extract_account(item: dict) -> AccountData | None:
    username = item.get("username") or item.get("ownerUsername")
    if not username:
        return None
    followers = item.get("followersCount")
    return AccountData(
        external_id=str(item.get("id") or item.get("pk") or username),
        username=username,
        full_name=item.get("fullName") or item.get("full_name"),
        bio=item.get("biography") or item.get("bio"),
        category=item.get("businessCategoryName") or item.get("category"),
        followers=followers if isinstance(followers, int) else None,
        contact_info=item.get("businessEmail") or item.get("publicEmail") or item.get("businessPhoneNumber"),
    )


async def _discover(cfg: Config, run_input: dict, label: str) -> dict[str, AccountData]:
    try:
        items = await _run_apify_actor(cfg, run_input)
    except (httpx.HTTPStatusError, httpx.TransportError) as e:
        logger.warning("Apify-поиск (%s) не удался: %s", label, e)
        return {}
    accounts: dict[str, AccountData] = {}
    for item in items:
        acc = _extract_account(item)
        if acc:
            accounts[acc.username] = acc
    return accounts


async def _discover_by_hashtags(cfg: Config, keywords: list[str], limit: int) -> dict[str, AccountData]:
    if not keywords:
        return {}
    run_input = {
        "hashtags": [kw.lstrip("#") for kw in keywords],
        "searchType": "hashtag",
        "resultsType": "details",
        "resultsLimit": limit,
    }
    return await _discover(cfg, run_input, "хэштеги")


async def _discover_by_search(cfg: Config, query: str, limit: int) -> dict[str, AccountData]:
    """Свободный текстовый поиск (ниша+гео вместе) — покрывает аккаунты,
    у которых нужных хэштегов в последних постах нет, но ниша/гео есть
    прямо в bio/названии."""
    if not query.strip():
        return {}
    run_input = {"search": query, "searchType": "user", "searchLimit": limit, "resultsType": "details"}
    return await _discover(cfg, run_input, "текстовый поиск")


def _passes_hard_filters(account: AccountData, criteria: dict) -> bool:
    """Дешёвая до-LLM фильтрация по диапазону подписчиков — чтобы не
    тратить LLM-вызов на кандидатов, заведомо не подходящих по размеру."""
    min_f = criteria.get("minFollowers")
    max_f = criteria.get("maxFollowers")
    if account.followers is None:
        return True
    if isinstance(min_f, int) and account.followers < min_f:
        return False
    if isinstance(max_f, int) and account.followers > max_f:
        return False
    return True


async def _rank_by_relevance(cfg: Config, criteria: dict, candidates: list[AccountData]) -> list[AccountData]:
    """Один LLM-вызов на всю пачку кандидатов — модель видит niche/city/
    excludeIf целиком (не только ключевые слова хэштега) и решает, кто
    реально целевой, в порядке убывания релевантности."""
    if not candidates:
        return []

    pool = candidates[:MAX_CANDIDATES_FOR_RANKING]
    listing = "\n".join(
        f"- @{a.username} | категория: {a.category or '—'} | подписчики: {a.followers if a.followers is not None else '—'} | bio: {(a.bio or '—')[:200]}"
        for a in pool
    )
    prompt = (
        f"Критерии целевого лида: ниша «{criteria.get('niche') or '—'}», гео «{criteria.get('city') or '—'}», "
        f"НЕ считать целевыми: «{criteria.get('excludeIf') or '—'}».\n\n"
        f"Кандидаты:\n{listing}\n\n"
        'Верни JSON {"usernames": [...]} — только те юзернеймы (без @), которые ДЕЙСТВИТЕЛЬНО подходят под '
        "критерии, в порядке убывания релевантности. Явно неподходящих, личные/бытовые аккаунты не включай."
    )

    try:
        client = AsyncOpenAI(api_key=cfg.openai_api_key)
        completion = await client.chat.completions.create(
            model=RANKING_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Ты помогаешь отобрать целевые Instagram-аккаунты по критериям лидогенерации.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        order = data.get("usernames") or []
    except Exception as e:
        logger.warning("LLM-ранжирование не удалось (%s) — отдаю кандидатов без сортировки", e)
        return candidates

    by_username = {a.username: a for a in pool}
    ranked = [by_username[u] for u in order if u in by_username]
    seen = {r.username for r in ranked}
    ranked += [a for a in pool if a.username not in seen]
    return ranked


async def search_accounts(cfg: Config, criteria: dict, limit: int) -> list[AccountData]:
    """criteria — структура из диалога настройки поиска (см.
    lib/actions/instagramSearch.ts): keywords (хэштеги), niche, city,
    excludeIf, minFollowers, maxFollowers."""
    keywords: list[str] = criteria.get("keywords") or []
    niche = (criteria.get("niche") or "").strip()
    city = (criteria.get("city") or "").strip()
    search_query = " ".join(p for p in (niche, city) if p)

    if not keywords and not search_query:
        logger.warning("В профиле поиска нет ни keywords, ни niche/city — искать нечем")
        return []

    fetch_limit = min(max(limit * 3, limit + 10), MAX_CANDIDATES_FOR_RANKING)
    hashtag_accounts, text_search_accounts = await asyncio.gather(
        _discover_by_hashtags(cfg, keywords, fetch_limit),
        _discover_by_search(cfg, search_query, fetch_limit),
    )
    candidates = {**hashtag_accounts, **text_search_accounts}
    if not candidates:
        return []

    filtered = [a for a in candidates.values() if _passes_hard_filters(a, criteria)]
    if not filtered:
        return []

    ranked = await _rank_by_relevance(cfg, criteria, filtered)
    return ranked[:limit]
