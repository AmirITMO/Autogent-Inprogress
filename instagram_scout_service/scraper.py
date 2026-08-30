"""
Двухстадийный поиск целевых Instagram-аккаунтов через Apify (см.
docs/pipeline/spikes/FINDINGS.md — официальный Graph API не даёт поиска по
чужим аккаунтам в принципе).

Архитектура скорректирована по образцу референсного instagram-lead-parser-v2
(предоставлен пользователем) — там же взяты извлечение контактов из bio
регексом и явный детект исчерпанной квоты Apify:

1. ДИСКАВЕРИ (только юзернеймы, БЕЗ профильных данных):
   - apify/instagram-hashtag-scraper по keywords — отдаёт ПОСТЫ, не профили
     (у поста нет надёжного bio/followers — оно есть только на профиле).
   - apify/instagram-search-scraper по niche+city — отдаёт результаты
     поиска пользователей с подписчиками, но без bio/категории.
   Раньше эти же акторы (точнее, один спекулятивный "apify/instagram-scraper"
   с разными searchType) ошибочно трактовались как источник полных
   профилей — для хэштег-ветки это давало пустые/неполные данные почти по
   всем кандидатам, LLM ранжировала по дырам, а не по реальным bio.

2. ОБОГАЩЕНИЕ (полные профили батчами):
   - apify/instagram-profile-scraper по юзернеймам, батчами по 30, до 5
     батчей параллельно — bio, followers, category, contact-поля.

Между стадиями — фильтр по already-seen (seen_store.py): юзернейм, уже
обработанный при прошлом поиске по этому каналу, не уходит повторно в
платный enrichment. Дешёвый follower-фильтр и финальное LLM-ранжирование —
после обогащения, когда данные уже полные.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass

import httpx
from openai import AsyncOpenAI

from config import Config
import seen_store

logger = logging.getLogger(__name__)

APIFY_BASE_URL = "https://api.apify.com/v2"
RANKING_MODEL = "gpt-4o-mini"
MAX_CANDIDATES_FOR_RANKING = 60
ENRICH_BATCH_SIZE = 30
ENRICH_PARALLEL = 5

# Строки, которыми Apify сигнализирует исчерпанный баланс/лимит — детект по
# тексту ошибки, не по HTTP-коду (Apify отдаёт это как обычный 4xx/5xx с
# описанием в теле). Без этого сервис долбит API до последнего на пустом
# балансе и отдаёт в CRM невнятное "нашли 0" вместо понятной причины.
QUOTA_ERROR_MARKERS = (
    "monthly usage hard limit",
    "monthly usage limit",
    "insufficient funds",
    "payment required",
    "usage limit exceeded",
    "account has run out",
    "quota exceeded",
)


class ApifyQuotaExhausted(Exception):
    """Apify сообщил об исчерпанном лимите/балансе — дальнейшие попытки в
    рамках этого задания бессмысленны и только тратят оставшийся баланс."""


@dataclass
class AccountData:
    external_id: str
    username: str
    full_name: str | None
    bio: str | None
    category: str | None
    followers: int | None
    contact_info: str | None


def _is_quota_error(message: str) -> bool:
    m = message.lower()
    return any(marker in m for marker in QUOTA_ERROR_MARKERS)


async def _run_apify_actor(cfg: Config, actor_id: str, run_input: dict) -> list[dict]:
    """run-sync-get-dataset-items — см. docs.apify.com/api/v2. До 300с на
    прогон; таймаут ниже с запасом под сетевые накладные расходы."""
    actor_path = actor_id.replace("/", "~")
    url = f"{APIFY_BASE_URL}/acts/{actor_path}/run-sync-get-dataset-items"
    async with httpx.AsyncClient(timeout=290) as client:
        resp = await client.post(url, params={"token": cfg.apify_token}, json=run_input)
        if resp.status_code >= 400 and _is_quota_error(resp.text):
            raise ApifyQuotaExhausted(
                "Закончился баланс/лимит Apify — пополните на console.apify.com/billing "
                "или увеличьте месячный лимит."
            )
        resp.raise_for_status()
        return resp.json()


# --- Контакты из bio регексом — дешевле и надёжнее, чем структурные поля
# Apify (businessEmail/publicEmail Instagram отдаёт редко). ---

_TG_PATTERNS = [
    re.compile(r"t\.me/([a-zA-Z0-9_]{5,})", re.IGNORECASE),
    # ":" или "@" после "telegram"/"tg"/"тг" обязательны — просто пробел
    # (как в оригинальном референсе) даёт ложные срабатывания на любом
    # обычном слове после "telegram" в тексте bio (поймано тестом).
    re.compile(r"telegram\s*[:@]\s*@?([a-zA-Z0-9_]{5,})", re.IGNORECASE),
    re.compile(r"\btg\s*[:@]\s*@?([a-zA-Z0-9_]{5,})", re.IGNORECASE),
    re.compile(r"\bтг\s*[:@]\s*@?([a-zA-Z0-9_]{5,})", re.IGNORECASE),
]
_EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_PATTERNS = [
    re.compile(r"\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,4}"),
    re.compile(r"\b[87][\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b"),
]


def extract_contacts(bio: str, external_url: str | None) -> dict[str, str | None]:
    telegram: str | None = None
    for pattern in _TG_PATTERNS:
        m = pattern.search(bio)
        if m:
            telegram = f"https://t.me/{m.group(1)}"
            break
    if not telegram and external_url and ("t.me/" in external_url or "telegram" in external_url.lower()):
        telegram = external_url

    email_match = _EMAIL_PATTERN.search(bio)
    email = email_match.group(0) if email_match else None

    phone: str | None = None
    for pattern in _PHONE_PATTERNS:
        m = pattern.search(bio)
        if m:
            digits = re.sub(r"\D", "", m.group(0))
            if 10 <= len(digits) <= 15:
                phone = m.group(0).strip()
                break

    return {"telegram": telegram, "email": email, "phone": phone}


def _extract_account(item: dict) -> AccountData | None:
    username = item.get("username") or item.get("ownerUsername")
    if not username:
        return None
    followers = item.get("followersCount")
    bio = item.get("biography") or item.get("bio") or ""
    external_url = item.get("externalUrl") or item.get("website")
    contact = extract_contacts(bio, external_url)
    contact_info = (
        item.get("businessEmail")
        or item.get("publicEmail")
        or item.get("businessPhoneNumber")
        or contact["email"]
        or contact["telegram"]
        or contact["phone"]
    )
    return AccountData(
        external_id=str(item.get("id") or item.get("pk") or username),
        username=username,
        full_name=item.get("fullName") or item.get("full_name"),
        bio=bio or None,
        category=item.get("businessCategoryName") or item.get("category"),
        followers=followers if isinstance(followers, int) else None,
        contact_info=contact_info,
    )


# --- Стадия 1: дискавери — только юзернеймы ---


async def _discover_by_hashtags(cfg: Config, keywords: list[str], limit: int) -> set[str]:
    if not keywords:
        return set()
    usernames: set[str] = set()
    for kw in keywords:
        run_input = {"hashtags": [kw.lstrip("#")], "resultsLimit": limit, "resultsType": "posts"}
        try:
            items = await _run_apify_actor(cfg, "apify/instagram-hashtag-scraper", run_input)
        except ApifyQuotaExhausted:
            raise
        except (httpx.HTTPStatusError, httpx.TransportError) as e:
            logger.warning("Хэштег-поиск #%s не удался: %s", kw, e)
            continue
        for item in items:
            username = str(item.get("ownerUsername") or item.get("username") or "").lower()
            likes = item.get("likesCount") or item.get("likes") or 0
            # Дешёвый прокси на размер аккаунта ДО похода в профиль — пост
            # с горсткой лайков почти наверняка мелкий/неактивный аккаунт.
            if username and likes >= 500:
                usernames.add(username)
    return usernames


async def _discover_by_search(cfg: Config, query: str, limit: int) -> set[str]:
    if not query.strip():
        return set()
    run_input = {"searchType": "user", "search": query, "searchLimit": limit, "resultsLimit": limit}
    try:
        items = await _run_apify_actor(cfg, "apify/instagram-search-scraper", run_input)
    except ApifyQuotaExhausted:
        raise
    except (httpx.HTTPStatusError, httpx.TransportError) as e:
        logger.warning("Текстовый поиск '%s' не удался: %s", query, e)
        return set()
    return {
        str(item.get("username") or item.get("ownerUsername") or "").lower()
        for item in items
        if item.get("username") or item.get("ownerUsername")
    }


# --- Стадия 2: обогащение — полные профили батчами ---


async def _enrich_batch(cfg: Config, usernames: list[str]) -> list[AccountData]:
    run_input = {"usernames": usernames, "resultsLimit": len(usernames)}
    items = await _run_apify_actor(cfg, "apify/instagram-profile-scraper", run_input)
    return [a for a in (_extract_account(item) for item in items) if a]


async def _enrich_profiles(cfg: Config, usernames: list[str]) -> list[AccountData]:
    batches = [usernames[i : i + ENRICH_BATCH_SIZE] for i in range(0, len(usernames), ENRICH_BATCH_SIZE)]
    accounts: list[AccountData] = []
    for i in range(0, len(batches), ENRICH_PARALLEL):
        chunk = batches[i : i + ENRICH_PARALLEL]
        results = await asyncio.gather(*(_enrich_batch(cfg, b) for b in chunk), return_exceptions=True)
        for r in results:
            if isinstance(r, ApifyQuotaExhausted):
                raise r
            if isinstance(r, BaseException):
                logger.warning("Обогащение батча не удалось: %s", r)
                continue
            accounts.extend(r)
    return accounts


def _passes_hard_filters(account: AccountData, criteria: dict) -> bool:
    """Дешёвая до-LLM фильтрация по диапазону подписчиков — применяется
    ПОСЛЕ обогащения (только тут известны реальные followers для обеих
    осей дискавери, включая хэштег-ветку)."""
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


async def search_accounts(cfg: Config, channel_id: str, criteria: dict, limit: int) -> list[AccountData]:
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

    try:
        hashtag_usernames, search_usernames = await asyncio.gather(
            _discover_by_hashtags(cfg, keywords, fetch_limit),
            _discover_by_search(cfg, search_query, fetch_limit),
        )
    except ApifyQuotaExhausted:
        raise

    candidate_usernames = hashtag_usernames | search_usernames
    if not candidate_usernames:
        return []

    already_seen = seen_store.load_seen(cfg.seen_store_path, channel_id)
    fresh_usernames = [u for u in candidate_usernames if u not in already_seen]
    if not fresh_usernames:
        logger.info("Все %d кандидатов уже обрабатывались для канала %s — новых нет", len(candidate_usernames), channel_id)
        return []

    enriched = await _enrich_profiles(cfg, fresh_usernames)
    seen_store.save_seen(cfg.seen_store_path, channel_id, set(fresh_usernames))

    filtered = [a for a in enriched if _passes_hard_filters(a, criteria)]
    if not filtered:
        return []

    ranked = await _rank_by_relevance(cfg, criteria, filtered)
    return ranked[:limit]
