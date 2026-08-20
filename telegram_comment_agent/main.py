"""Точка входа: один Telegram-клиент (юзербот) — слушает целевые каналы
(monitor.py, список из базы знаний CRM) и параллельно рассылает одобренные
сотрудником комментарии (sender.py, throttled).

Список целевых каналов читается ОДИН РАЗ при старте — если сотрудник
поменял тему «В каких каналах комментировать» в CRM, процесс нужно
перезапустить, чтобы подхватить изменение (динамическая пере-подписка на
NewMessage не реализована, это осознанное упрощение MVP)."""

import asyncio
import logging

from telethon import TelegramClient

import comment_writer
import crm_client
import monitor
import sender
import throttle
from config import Config, require_complete

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _build_proxy(cfg: Config) -> tuple | None:
    if not cfg.tg_proxy_host or not cfg.tg_proxy_port:
        return None
    import socks

    return (socks.SOCKS5, cfg.tg_proxy_host, cfg.tg_proxy_port, True, cfg.tg_proxy_username, cfg.tg_proxy_password)


async def main() -> None:
    cfg = Config()
    require_complete(cfg)
    throttle.init_db(cfg.sqlite_path)

    kb_text = await crm_client.get_knowledge_base(cfg)
    target_channels = await comment_writer.extract_target_channels(cfg, kb_text)

    client = TelegramClient(cfg.tg_session_path, cfg.tg_api_id, cfg.tg_api_hash, proxy=_build_proxy(cfg))
    await client.start()

    monitor.register(client, cfg, target_channels, kb_text)
    sender_task = asyncio.create_task(sender.run_sender_loop(client, cfg))

    logger.info("Агент автокомментинга запущен. Целевые каналы: %s", target_channels or "(не заданы)")
    try:
        await client.run_until_disconnected()
    finally:
        sender_task.cancel()
        await asyncio.gather(sender_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
