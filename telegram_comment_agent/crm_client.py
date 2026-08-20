"""
HTTP-клиент к CRM (Autogent Platform). Тот же pull/push-принцип, что у
других сервисов этого проекта — агент сам инициирует все запросы, CRM
никогда не стучится сюда первой (нет публичного адреса).
"""

from dataclasses import dataclass

import httpx

from config import Config


@dataclass
class ApprovedDraft:
    id: str
    channel_id: str
    target_channel_username: str
    post_link: str
    draft_comment: str


def _headers(cfg: Config) -> dict:
    return {"X-Api-Key": cfg.crm_api_key, "Content-Type": "application/json"}


async def get_knowledge_base(cfg: Config) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/tg-autocomment-agent/knowledge-base",
            params={"channelId": cfg.crm_channel_id},
            headers=_headers(cfg),
        )
    resp.raise_for_status()
    return resp.json().get("content", "")


async def push_draft(
    cfg: Config,
    *,
    external_id: str,
    target_channel_username: str,
    post_link: str,
    post_excerpt: str | None,
    draft_comment: str,
) -> None:
    payload = {
        "channelId": cfg.crm_channel_id,
        "externalId": external_id,
        "targetChannelUsername": target_channel_username,
        "postLink": post_link,
        "postExcerpt": post_excerpt,
        "draftComment": draft_comment,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/tg-autocomment-agent/drafts",
            json={k: v for k, v in payload.items() if v is not None},
            headers=_headers(cfg),
        )
    resp.raise_for_status()


async def get_approved_drafts(cfg: Config) -> list[ApprovedDraft]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/tg-autocomment-agent/drafts",
            params={"status": "APPROVED"},
            headers=_headers(cfg),
        )
    resp.raise_for_status()
    data = resp.json()
    return [
        ApprovedDraft(
            id=d["id"],
            channel_id=d["channelId"],
            target_channel_username=d["targetChannelUsername"],
            post_link=d["postLink"],
            draft_comment=d["draftComment"],
        )
        for d in data["drafts"]
    ]


async def complete_draft(cfg: Config, draft_id: str, *, error: str | None = None) -> None:
    payload: dict = {}
    if error is not None:
        # != None, не truthy — та же логика, что у остальных сервисов этого
        # проекта: исключение с пустым текстом тоже означает "была ошибка".
        payload["errorMessage"] = error
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/tg-autocomment-agent/drafts/{draft_id}/complete",
            json=payload,
            headers=_headers(cfg),
        )
    resp.raise_for_status()


async def push_metrics(cfg: Config, *, posts_scanned: int, comments_sent: int) -> None:
    payload = {"channelId": cfg.crm_channel_id, "postsScanned": posts_scanned, "commentsSent": comments_sent}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{cfg.crm_api_url.rstrip('/')}/api/integrations/tg-autocomment-agent/metrics",
            json=payload,
            headers=_headers(cfg),
        )
    resp.raise_for_status()
