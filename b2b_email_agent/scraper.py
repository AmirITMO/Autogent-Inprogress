"""
Поиск и разбор целевых компаний для B2B email-рассылки через Apify — своей
инфраструктуры для поиска/скрейпинга не нужно, всё исполняется на стороне
Apify:

1. build_search_queries — по свободному описанию ICP из базы знаний агента
   (см. lib/actions/agentKnowledgeBase.ts) строит короткие поисковые запросы
   одним LLM-вызовом. Раньше такого шага не было вообще — критерии из
   интервью нигде не использовались для поиска, только для текста письма.
2. discover_candidate_domains — ищет сайты компаний по этим запросам через
   Apify Google Search actor.
3. crawl_site — превращает сайт в markdown/текст через Apify Website
   Content Crawler.
4. extract_company — LLM решает, подходит ли компания под критерии, и
   достаёт название/контактный email из содержимого сайта.
"""

import json
import logging
from dataclasses import dataclass

import httpx
from openai import AsyncOpenAI

from config import Config

logger = logging.getLogger(__name__)

APIFY_BASE_URL = "https://api.apify.com/v2"
EXTRACTION_MODEL = "gpt-4o-mini"


@dataclass
class ExtractedCompany:
    company_name: str
    contact_email: str | None
    matches: bool
    reasoning: str


async def _run_apify_actor(cfg: Config, actor_id: str, run_input: dict) -> list[dict]:
    """run-sync-get-dataset-items — см. docs.apify.com/api/v2. До 300с на
    прогон; таймаут ниже с запасом под сетевые накладные расходы."""
    actor_path = actor_id.replace("/", "~")
    url = f"{APIFY_BASE_URL}/acts/{actor_path}/run-sync-get-dataset-items"
    async with httpx.AsyncClient(timeout=290) as client:
        resp = await client.post(url, params={"token": cfg.apify_token}, json=run_input)
        resp.raise_for_status()
        return resp.json()


async def build_search_queries(cfg: Config, kb_text: str, max_queries: int = 3) -> list[str]:
    if not kb_text.strip():
        return []
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    try:
        completion = await client.chat.completions.create(
            model=EXTRACTION_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Ты помогаешь составить поисковые запросы для поиска целевых B2B-компаний в Google.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Описание целевого клиента (из базы знаний агента):\n---\n{kb_text}\n---\n\n"
                        f'Верни JSON {{"queries": [...]}} — до {max_queries} коротких запросов на русском '
                        '(ниша + гео, например "мебельные фабрики Москва официальный сайт"), по которым в '
                        "Google реально находятся сайты подходящих компаний."
                    ),
                },
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        return list(data.get("queries") or [])[:max_queries]
    except Exception as e:
        logger.warning("Не удалось составить поисковые запросы: %s", e)
        return []


def _domain_from_url(url: str) -> str | None:
    try:
        host = httpx.URL(url).host
    except Exception:
        return None
    return host or None


async def discover_candidate_domains(cfg: Config, queries: list[str], limit_per_query: int) -> list[str]:
    domains: list[str] = []
    seen: set[str] = set()
    for query in queries:
        run_input = {"queries": query, "resultsPerPage": limit_per_query, "maxPagesPerQuery": 1}
        try:
            items = await _run_apify_actor(cfg, cfg.apify_search_actor, run_input)
        except (httpx.HTTPStatusError, httpx.TransportError) as e:
            logger.warning("Apify-поиск компаний по '%s' не удался: %s", query, e)
            continue
        for item in items:
            results = item.get("organicResults") if isinstance(item.get("organicResults"), list) else [item]
            for result in results:
                url = result.get("url") or result.get("link")
                if not url:
                    continue
                domain = _domain_from_url(url)
                if domain and domain not in seen:
                    seen.add(domain)
                    domains.append(domain)
    return domains


async def crawl_site(cfg: Config, domain: str) -> str | None:
    run_input = {"startUrls": [{"url": f"https://{domain}"}], "maxCrawlPages": 3, "crawlerType": "cheerio"}
    try:
        items = await _run_apify_actor(cfg, cfg.apify_crawler_actor, run_input)
    except (httpx.HTTPStatusError, httpx.TransportError) as e:
        logger.warning("Не удалось прочитать сайт %s: %s", domain, e)
        return None
    if not items:
        return None
    text = "\n\n".join(item.get("markdown") or item.get("text") or "" for item in items)
    return text[:8000] if text.strip() else None


async def extract_company(cfg: Config, kb_text: str, domain: str, markdown: str) -> ExtractedCompany | None:
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    try:
        completion = await client.chat.completions.create(
            model=EXTRACTION_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Ты решаешь, подходит ли компания под критерии B2B лидогенерации, и достаёшь контактные данные с её сайта.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Критерии целевого клиента:\n---\n{kb_text}\n---\n\n"
                        f"Сайт {domain}, содержимое:\n---\n{markdown[:6000]}\n---\n\n"
                        'Верни JSON {"company_name": "...", "contact_email": "..."|null, '
                        '"matches": true|false, "reasoning": "..."} — matches=true только если компания '
                        "реально подходит; reasoning — короткое (1 предложение) объяснение почему подходит "
                        "или нет; contact_email — только если реально виден на сайте, не выдумывай."
                    ),
                },
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        return ExtractedCompany(
            company_name=data.get("company_name") or domain,
            contact_email=data.get("contact_email") or None,
            matches=bool(data.get("matches")),
            reasoning=data.get("reasoning") or "",
        )
    except Exception as e:
        logger.warning("Извлечение данных с сайта %s не удалось: %s", domain, e)
        return None
