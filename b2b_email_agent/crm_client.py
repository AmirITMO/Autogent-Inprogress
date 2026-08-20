"""
HTTP-клиент к CRM (Autogent Platform). Сервис сам инициирует все запросы —
у него нет публичного адреса, CRM никогда не стучится сюда первой (тот же
pull-принцип, что у instagram_scout_service/crm_client.py). Ошибки
пробрасываются наружу — получение заданий и отправка результатов не
опциональны для работы сервиса.
"""

from dataclasses import dataclass

import httpx

from config import Config


@dataclass
class SearchJob:
    id: str
    channel_id: str
    requested_count: int


def _headers(cfg: Config) -> dict:
    return {"X-Api-Key": cfg.crm_api_key, "Content-Type": "application/json"}


async def get_pending_jobs(cfg: Config) -> list[SearchJob]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/b2b-email-agent/jobs",
            params={"status": "PENDING"},
            headers=_headers(cfg),
        )
    resp.raise_for_status()
    data = resp.json()
    return [SearchJob(id=j["id"], channel_id=j["channelId"], requested_count=j["requestedCount"]) for j in data["jobs"]]


async def get_knowledge_base(cfg: Config, channel_id: str) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/b2b-email-agent/knowledge-base",
            params={"channelId": channel_id},
            headers=_headers(cfg),
        )
    resp.raise_for_status()
    return resp.json().get("content", "")


async def push_contact(
    cfg: Config,
    channel_id: str,
    *,
    external_id: str,
    company_name: str,
    website: str | None = None,
    contact_email: str | None = None,
    trigger_reason: str | None = None,
    draft_message: str | None = None,
) -> None:
    payload = {
        "channelId": channel_id,
        "externalId": external_id,
        "companyName": company_name,
        "website": website,
        "contactEmail": contact_email,
        "triggerReason": trigger_reason,
        "draftMessage": draft_message,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/b2b-email-agent/contacts",
            json={k: v for k, v in payload.items() if v is not None},
            headers=_headers(cfg),
        )
    resp.raise_for_status()


async def complete_job(cfg: Config, job_id: str, *, found_count: int, error: str | None = None) -> None:
    payload: dict = {"foundCount": found_count}
    if error is not None:
        # != None, не truthy — исключение с пустым текстом тоже означает
        # "была ошибка" (см. тот же приём в instagram_scout_service).
        payload["errorMessage"] = error
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/b2b-email-agent/jobs/{job_id}/complete",
            json=payload,
            headers=_headers(cfg),
        )
    resp.raise_for_status()
