"""
Push-интеграция с внешним CRM (Autogent Platform): при обнаружении
релевантного лида отправляет его в CRM-воронку, периодически отправляет
снимок метрик агента (см. metrics_reporter.py). Работает по push, а не
pull — CRM опрашивать некого (агент крутится локально, без публичного
адреса), а агенту исходящий интернет и так нужен для Telegram/OpenAI.

Полностью опционально: если crm_api_url/crm_api_key/crm_channel_id не
заданы — все функции no-op (лог один раз при первом вызове).
"""

import logging

import httpx

from config import AppConfig

logger = logging.getLogger(__name__)

_disabled_warned = False


def _is_configured(cfg: AppConfig) -> bool:
    global _disabled_warned
    if cfg.crm_api_url and cfg.crm_api_key and cfg.crm_channel_id:
        return True
    if not _disabled_warned:
        logger.info(
            "CRM-интеграция выключена (CRM_API_URL/CRM_API_KEY/CRM_CHANNEL_ID не заданы) "
            "— лиды и метрики никуда не отправляются."
        )
        _disabled_warned = True
    return False


def _headers(cfg: AppConfig) -> dict:
    return {"X-Api-Key": cfg.crm_api_key, "Content-Type": "application/json"}


async def push_lead(cfg: AppConfig, profile: dict) -> None:
    """
    Best-effort отправка найденного лида в CRM. Никогда не поднимает
    исключение наружу — сбой внешней интеграции не должен ронять обработчик
    Telegram-события (тот же принцип, что agent.AgentGenerationError для
    вызовов LLM, только здесь сеть не критична для работы самого агента).
    """
    if not _is_configured(cfg):
        return

    title = (profile.get("problem") or profile.get("niche_info") or "Лид из Telegram-группы")[:200]
    payload = {
        "title": title,
        "company": (profile.get("niche_info") or "")[:200] or None,
        "contactName": profile.get("display_name") or None,
        "contact": f"@{profile['username']}" if profile.get("username") else None,
        "description": profile.get("raw_last_message") or None,
        "channelId": cfg.crm_channel_id,
    }
    payload = {k: v for k, v in payload.items() if v}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{cfg.crm_api_url.rstrip('/')}/api/integrations/scout-agent/leads",
                json=payload, headers=_headers(cfg),
            )
        if resp.status_code >= 400:
            logger.warning("CRM отклонил лид (status=%s): %s", resp.status_code, resp.text[:300])
        else:
            logger.info("Лид отправлен в CRM: %s", title[:80])
    except httpx.HTTPError as e:
        logger.warning("Не удалось отправить лида в CRM: %s", e)


async def push_metrics(cfg: AppConfig, snapshot: dict) -> None:
    """Best-effort отправка снимка метрик — тот же принцип, см. push_lead."""
    if not _is_configured(cfg):
        return

    payload = {**snapshot, "channelId": cfg.crm_channel_id}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{cfg.crm_api_url.rstrip('/')}/api/integrations/scout-agent/metrics",
                json=payload, headers=_headers(cfg),
            )
        if resp.status_code >= 400:
            logger.warning("CRM отклонил снимок метрик (status=%s): %s", resp.status_code, resp.text[:300])
    except httpx.HTTPError as e:
        logger.warning("Не удалось отправить метрики в CRM: %s", e)
