"""
Фоновый воркер: раз в минуту проверяет, наступило ли рабочее окно,
и досылает полноценные ответы, накопленные за нерабочее время.

Ответ генерируется ЗДЕСЬ (а не в момент прихода off-hours сообщения),
чтобы учесть всю историю на момент старта рабочего дня, если селлер
написал несколько сообщений подряд ночью. Профиль из базы знаний
подтягивается точно так же, как в reactive_handler.
"""

import asyncio
import logging

import profile_store
import storage
from config import AppConfig
from working_hours import is_working_hours
from agent import AgentGenerationError, generate_reply
from manager_pool import ManagerPool

logger = logging.getLogger(__name__)


async def run_queue_worker(pool: ManagerPool, cfg: AppConfig, profiles_sheet, poll_seconds: float = 60.0):
    while True:
        if is_working_hours(cfg.working_hours):
            await _flush_due(pool, cfg, profiles_sheet)
        await asyncio.sleep(poll_seconds)


async def _flush_due(pool: ManagerPool, cfg: AppConfig, profiles_sheet):
    due = storage.pop_due_queue(cfg.sqlite_path)
    if not due:
        return

    # Несколько сообщений от одного лида за ночь -> один ответ, не несколько подряд
    seen: set[tuple[str, str]] = set()

    for item in due:
        key = (item["chat_id"], item["account_name"])
        if key in seen:
            continue
        seen.add(key)

        await _send_queued_reply(pool, cfg, item["account_name"], item["chat_id"], profiles_sheet)


async def _send_queued_reply(pool: ManagerPool, cfg: AppConfig, account_name: str, chat_id: str, profiles_sheet):
    client = pool.client_for_account(account_name)
    persona = pool.persona_for_account(account_name)

    history = storage.get_history(cfg.sqlite_path, chat_id, account_name, limit=20)
    if not history:
        return

    # Последнее сообщение в истории — от лида (то, что копилось ночью);
    # используем его как incoming_text, остальное — как контекст.
    last = history[-1]
    incoming_text = last["content"] if last["role"] == "lead" else ""
    context = history[:-1] if last["role"] == "lead" else history

    loop = asyncio.get_event_loop()
    profile = await loop.run_in_executor(None, profile_store.get_profile, profiles_sheet, chat_id)

    try:
        reply_text = await loop.run_in_executor(
            None, generate_reply, persona, context, incoming_text or "Продолжи разговор.", cfg, profile
        )
    except AgentGenerationError:
        # Сообщение остаётся в истории (уже сохранено), просто не отвечаем
        # сейчас — следующий тик воркера/следующее сообщение лида попробуют снова.
        logger.exception("[%s] Не удалось сгенерировать отложенный ответ для %s", account_name, chat_id)
        return

    try:
        entity = await client.get_entity(int(chat_id))
    except ValueError:
        entity = await client.get_entity(chat_id)

    async with client.action(entity, "typing"):
        await asyncio.sleep(min(cfg.max_reply_delay_seconds, len(reply_text) / cfg.typing_chars_per_second))

    await client.send_message(entity, reply_text)
    storage.save_message(cfg.sqlite_path, chat_id, account_name, role="manager", content=reply_text)
    logger.info("[%s] Отложенный ответ отправлен %s: %s...", account_name, chat_id, reply_text[:80])
