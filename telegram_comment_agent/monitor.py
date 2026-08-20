"""
Слушает новые посты в целевых каналах (список берётся из базы знаний через
comment_writer.extract_target_channels) и предлагает черновик комментария
под каждый подходящий пост — публикация только после одобрения в CRM
(см. sender.py). Сам этот модуль никогда не пишет в Telegram.
"""

import logging

from telethon import events

import comment_writer
import crm_client
from config import Config

logger = logging.getLogger(__name__)


def register(client, cfg: Config, target_channels: list[str], kb_text: str) -> None:
    if not target_channels:
        logger.warning(
            "Список целевых каналов пуст — комментировать негде. Заполните тему "
            "«В каких каналах комментировать» в разделе «Управление» CRM."
        )
        return

    @client.on(events.NewMessage(chats=target_channels))
    async def handler(event):
        if not event.message.message:
            return  # пост без текста (только медиа) — нечего анализировать

        chat = await event.get_chat()
        username = getattr(chat, "username", None)
        if not username:
            return  # без юзернейма нет постоянной ссылки на пост для postLink

        post_text = event.message.message
        relevant = await comment_writer.should_comment(cfg, kb_text, post_text)
        if not relevant:
            return

        comment = await comment_writer.draft_comment(cfg, kb_text, post_text)
        if not comment.strip():
            return

        await crm_client.push_draft(
            cfg,
            external_id=f"{username}:{event.message.id}",
            target_channel_username=username,
            post_link=f"https://t.me/{username}/{event.message.id}",
            post_excerpt=post_text[:300],
            draft_comment=comment,
        )
        logger.info("Предложен черновик комментария для https://t.me/%s/%s", username, event.message.id)
