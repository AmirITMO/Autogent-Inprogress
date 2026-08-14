"""
Push-интеграция с внешним CRM (Autogent Platform), три эндпоинта:

- push_contact — карточка конкретного диалога (апсерт по channelId+externalId).
  Вызывается при первом исходящем сообщении (status=WRITTEN) и повторно при
  каждом новом сообщении в диалоге (status=REPLIED).
- push_lead — контакт квалифицирован и передаётся в отдел продаж. Вызывается
  ОДИН раз на контакт (не на каждое сообщение) — см. storage.mark_lead_pushed_if_new.
- push_metrics — периодический агрегированный снимок работы агента (не про
  конкретного человека), см. metrics_reporter.py.

Работает по push, а не pull — CRM опрашивать некого (агент крутится локально,
без публичного адреса), а агенту исходящий интернет и так нужен для
Telegram/OpenAI. Полностью опционально: если crm_api_url/crm_api_key/
crm_channel_id не заданы — все функции no-op (лог один раз при первом вызове).
"""

import logging

import httpx

from config import AppConfig

logger = logging.getLogger(__name__)

_disabled_warned = False

STATUS_WRITTEN = "WRITTEN"
STATUS_REPLIED = "REPLIED"


def _is_configured(cfg: AppConfig) -> bool:
    global _disabled_warned
    if cfg.crm_api_url and cfg.crm_api_key and cfg.crm_channel_id:
        return True
    if not _disabled_warned:
        logger.info(
            "CRM-интеграция выключена (CRM_API_URL/CRM_API_KEY/CRM_CHANNEL_ID не заданы) "
            "— контакты/лиды/метрики никуда не отправляются."
        )
        _disabled_warned = True
    return False


def _headers(cfg: AppConfig) -> dict:
    return {"X-Api-Key": cfg.crm_api_key, "Content-Type": "application/json"}


async def _post(cfg: AppConfig, path: str, payload: dict, *, what: str) -> None:
    """
    Общая best-effort отправка. Никогда не поднимает исключение наружу —
    сбой внешней интеграции не должен ронять обработчик Telegram-события
    (тот же принцип, что agent.AgentGenerationError для вызовов LLM, только
    здесь сеть не критична для работы самого агента).
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{cfg.crm_api_url.rstrip('/')}{path}", json=payload, headers=_headers(cfg),
            )
        if resp.status_code >= 400:
            logger.warning("CRM отклонил %s (status=%s): %s", what, resp.status_code, resp.text[:300])
    except httpx.HTTPError as e:
        logger.warning("Не удалось отправить %s в CRM: %s", what, e)


def _dialogue_from_history(history: list[dict]) -> list[dict]:
    """history — [{"role": "lead"|"manager", "content": str, "ts": iso-str}], из
    storage.get_full_history(). CRM ждёт {"from": "scout"|"contact", "text", "at"}."""
    return [
        {"from": "scout" if turn["role"] == "manager" else "contact", "text": turn["content"], "at": turn["ts"]}
        for turn in history
    ]


async def push_contact(cfg: AppConfig, *, external_id: str, status: str, dialogue: list[dict],
                        name: str | None = None, telegram_username: str | None = None,
                        source_chat_name: str | None = None, trigger_message: str | None = None,
                        trigger_reason: str | None = None, outreach_account: str | None = None) -> None:
    if not _is_configured(cfg):
        return

    optional = {
        "name": name,
        "telegramUsername": telegram_username,
        "sourceChatName": source_chat_name,
        "triggerMessage": trigger_message,
        "triggerReason": trigger_reason,
        "outreachAccount": outreach_account,
    }
    payload = {
        "channelId": cfg.crm_channel_id,
        "externalId": external_id,
        "status": status,
        "dialogue": dialogue,
        **{k: v for k, v in optional.items() if v},
    }

    await _post(cfg, "/api/integrations/scout-agent/contacts", payload, what="контакт")


async def push_lead(cfg: AppConfig, *, contact_external_id: str, title: str,
                     contact_name: str | None = None, contact: str | None = None) -> None:
    if not _is_configured(cfg):
        return

    optional = {"contactName": contact_name, "contact": contact}
    payload = {
        "channelId": cfg.crm_channel_id,
        "contactExternalId": contact_external_id,
        "title": title[:200],
        **{k: v for k, v in optional.items() if v},
    }

    await _post(cfg, "/api/integrations/scout-agent/leads", payload, what="лид")
    logger.info("Лид передан в CRM (contactExternalId=%s): %s", contact_external_id, title[:80])


async def push_metrics(cfg: AppConfig, snapshot: dict) -> None:
    if not _is_configured(cfg):
        return
    payload = {**snapshot, "channelId": cfg.crm_channel_id}
    await _post(cfg, "/api/integrations/scout-agent/metrics", payload, what="снимок метрик")
