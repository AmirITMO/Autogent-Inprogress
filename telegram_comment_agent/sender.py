"""
Публикует одобренные сотрудником черновики (см. approveTgCommentDraft в
основном репозитории CRM) — единственное место в этом сервисе, которое
реально пишет в Telegram. Throttled (throttle.py): дневной лимит и
минимальная пауза между публикациями действуют независимо от того, сколько
черновиков сотрудник одобрил разом — без этого одобренная пачка улетела бы
в Telegram одним залпом, что и есть тот самый риск бана за паттерн
активности, ради которого вообще нужно одобрение (см. README.md).
"""

import asyncio
import logging

import crm_client
import throttle
from config import Config

logger = logging.getLogger(__name__)


def _post_id_from_link(post_link: str) -> int:
    return int(post_link.rstrip("/").rsplit("/", 1)[-1])


async def send_approved_drafts(client, cfg: Config) -> int:
    sent = 0
    drafts = await crm_client.get_approved_drafts(cfg)
    for draft in drafts:
        if not throttle.can_send_now(cfg):
            logger.info(
                "Дневной лимит/пауза между комментариями — %d черновик(ов) ждут следующего окна.",
                len(drafts) - sent,
            )
            break
        try:
            entity = await client.get_entity(draft.target_channel_username)
            post_id = _post_id_from_link(draft.post_link)
            # comment_to — Telethon сам резолвит привязанную группу
            # обсуждений канала и публикует ответ туда, реплаем на пост.
            await client.send_message(entity, draft.draft_comment, comment_to=post_id)
            throttle.record_comment_sent(cfg.sqlite_path)
            await crm_client.complete_draft(cfg, draft.id)
            sent += 1
            logger.info("Комментарий опубликован под %s", draft.post_link)
        except Exception as e:
            logger.exception("Не удалось опубликовать комментарий для черновика %s", draft.id)
            await crm_client.complete_draft(cfg, draft.id, error=str(e))
        await asyncio.sleep(2)  # пауза между запросами к Telegram даже в пределах одной пачки
    return sent


async def run_sender_loop(client, cfg: Config) -> None:
    while True:
        try:
            await send_approved_drafts(client, cfg)
        except Exception:
            logger.exception("Ошибка в цикле отправки одобренных комментариев")
        await asyncio.sleep(cfg.poll_interval_seconds)
