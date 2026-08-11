"""
Реактивный режим: агент отвечает, когда селлер САМ написал в личку
(вместо проактивной рассылки). Это основной канал, раз в группах уже
висит закреп "менеджер может написать/ответить в рабочее время".

Перед каждым ответом подтягивает профиль из общей базы знаний
(profile_store) — то, что скаут уже узнал об этом человеке в группах,
плюс короткую историю самого личного диалога (storage/SQLite).
"""

import asyncio

from telethon import events

import profile_store
import storage
from config import AppConfig
from working_hours import is_working_hours
from agent import generate_reply
from manager_pool import ManagerPool


def register_all(pool: ManagerPool, cfg: AppConfig, profiles_sheet):
    """Вешает обработчик входящих личных сообщений на КАЖДЫЙ аккаунт из пула."""
    for account_name in pool.account_names():
        client = pool.client_for_account(account_name)
        _register_one(pool, cfg, account_name, client, profiles_sheet)


def _register_one(pool: ManagerPool, cfg: AppConfig, account_name: str, client, profiles_sheet):
    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def handler(event):
        text = event.message.message
        if not text:
            return

        chat_id = str(event.chat_id)

        # Реальность Telegram уже решила: если селлер написал именно этому
        # аккаунту, он закреплён за ним — без round-robin переигровок.
        storage.ensure_assignment(cfg.sqlite_path, chat_id, account_name)
        storage.save_message(cfg.sqlite_path, chat_id, account_name, role="lead", content=text)

        loop = asyncio.get_event_loop()
        profile = await loop.run_in_executor(None, profile_store.get_profile, profiles_sheet, chat_id)
        if profile and profile.get("status") != profile_store.STATUS_IN_DIALOGUE:
            await loop.run_in_executor(
                None, profile_store.set_status, profiles_sheet, chat_id,
                profile_store.STATUS_IN_DIALOGUE, account_name,
            )

        if is_working_hours(cfg.working_hours):
            await _reply_now(pool, cfg, account_name, client, event, chat_id, text, profile)
        else:
            await _handle_off_hours(cfg, account_name, chat_id, text, event)


async def _reply_now(pool: ManagerPool, cfg: AppConfig, account_name: str, client, event,
                      chat_id: str, text: str, profile: dict | None):
    history = storage.get_history(cfg.sqlite_path, chat_id, account_name, limit=20)
    # Последняя запись в history — то же сообщение, что мы только что сохранили;
    # убираем его из "истории" и передаём отдельным аргументом incoming_text.
    history_without_last = history[:-1] if history else []

    loop = asyncio.get_event_loop()
    persona = pool.persona_for_account(account_name)
    reply_text = await loop.run_in_executor(
        None, generate_reply, persona, history_without_last, text, cfg, profile
    )

    # Имитация живого набора текста — резкий мгновенный ответ на большое
    # сообщение выглядит подозрительно и снижает доверие к "менеджеру".
    delay = len(reply_text) / cfg.typing_chars_per_second
    delay = max(cfg.min_reply_delay_seconds, min(cfg.max_reply_delay_seconds, delay))

    async with client.action(event.chat_id, "typing"):
        await asyncio.sleep(delay)

    await event.reply(reply_text)
    storage.save_message(cfg.sqlite_path, chat_id, account_name, role="manager", content=reply_text)
    print(f"[{account_name}] Ответ для {chat_id}: {reply_text[:80]}...")


async def _handle_off_hours(cfg: AppConfig, account_name: str, chat_id: str, text: str, event):
    # Короткое уведомление шлём только один раз за "простой" — если в очереди
    # уже есть неотправленный ответ для этого лида, повторно не дёргаем его.
    already_pending = storage.has_pending_queue(cfg.sqlite_path, chat_id, account_name)

    # Помечаем, что для этого лида нужен полноценный ответ при старте
    # следующего рабочего окна (queue_worker сгенерирует его из истории).
    storage.enqueue_message(cfg.sqlite_path, chat_id, account_name, content=text)

    if already_pending:
        return  # уведомление уже отправляли на предыдущее сообщение — не спамим

    wh = cfg.working_hours
    notice = cfg.off_hours_auto_reply.format(start=wh.start_hour, end=wh.end_hour, tz=wh.timezone)
    await event.reply(notice)
