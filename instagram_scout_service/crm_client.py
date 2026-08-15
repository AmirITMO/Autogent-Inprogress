"""
HTTP-клиент к CRM (Autogent Platform). Сервис сам инициирует все запросы —
у него нет публичного адреса, CRM никогда не стучится сюда первой (тот же
pull-принцип, что и в telegram_sales_agent/crm_integration.py).

В отличие от crm_integration.py там (best-effort, ошибки только логируются),
здесь ошибки пробрасываются наружу — получение заданий и отправка
результатов не опциональны для работы сервиса.
"""

from dataclasses import dataclass

import httpx

from config import Config


@dataclass
class SearchProfile:
    id: str
    name: str
    criteria: dict


@dataclass
class ScrapeJob:
    id: str
    channel_id: str
    requested_count: int
    search_profile: SearchProfile


def _headers(cfg: Config) -> dict:
    return {"X-Api-Key": cfg.crm_api_key, "Content-Type": "application/json"}


async def get_pending_jobs(cfg: Config) -> list[ScrapeJob]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/instagram-agent/jobs",
            params={"status": "PENDING"},
            headers=_headers(cfg),
        )
    resp.raise_for_status()
    data = resp.json()
    return [
        ScrapeJob(
            id=j["id"],
            channel_id=j["channelId"],
            requested_count=j["requestedCount"],
            search_profile=SearchProfile(
                id=j["searchProfile"]["id"],
                name=j["searchProfile"]["name"],
                criteria=j["searchProfile"]["criteria"],
            ),
        )
        for j in data["jobs"]
    ]


async def push_contact(
    cfg: Config,
    channel_id: str,
    *,
    external_id: str,
    username: str,
    draft_message: str,
    full_name: str | None = None,
    bio: str | None = None,
    category: str | None = None,
    followers: int | None = None,
    contact_info: str | None = None,
    source_tag: str | None = None,
) -> None:
    payload = {
        "channelId": channel_id,
        "externalId": external_id,
        "username": username,
        "draftMessage": draft_message,
        "fullName": full_name,
        "bio": bio,
        "category": category,
        "followers": followers,
        "contactInfo": contact_info,
        "sourceTag": source_tag,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/instagram-agent/contacts",
            json={k: v for k, v in payload.items() if v is not None},
            headers=_headers(cfg),
        )
    resp.raise_for_status()


async def complete_job(cfg: Config, job_id: str, *, found_count: int, error: str | None = None) -> None:
    payload: dict = {"foundCount": found_count}
    if error:
        payload["errorMessage"] = error
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/instagram-agent/jobs/{job_id}/complete",
            json=payload,
            headers=_headers(cfg),
        )
    resp.raise_for_status()
