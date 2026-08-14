"""
Реактивный режим: агент отвечает, когда селлер САМ написал в личку
(вместо проактивной рассылки). Это основной канал, раз в группах уже
висит закреп "менеджер может написать/ответить в рабочее время".

Перед каждым ответом подтягивает профиль из общей базы знаний
(profile_store) — то, что скаут уже узнал об этом человеке в группах,
плюс короткую историю самого личного диалога (storage/SQLite).
"""

import asyncio
import logging

from telethon import events

import profile_store
import storage
from config import AppConfig
from crm_integration import push_contact, push_lead, STATUS_REPLIED
from working_hours import is_working_hours
from agent import AgentGenerationError, generate_reply
from manager_pool import ManagerPool

logger = logging.getLogger(__name__)

# Идемпотентность на случай, если Telegram (обрыв связи, ретрай, повторная
# доставка апдейта после reconnect) пришлёт одно и то же входящее сообщение
# дважды. id сообщения в рамках чата монотонно растёт — храним последний
# обработанный id на (account_name, chat_id) в памяти процесса и молча
# пропускаем повтор. Без этого дубль-апдейт означал бы два вызова LLM и два
# ответа лиду на одно и то же сообщение.
_last_seen_message_id: dict[tuple[str, str], int] = {}


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
        msg_id = event.message.id
        dedup_key = (account_name, chat_id)
        if msg_id is not None and _last_seen_message_id.get(dedup_key, 0) >= msg_id:
            logger.info("[%s] Дубликат входящего сообщения id=%s в чате %s — пропускаю.",
                        account_name, msg_id, chat_id)
            return
        _last_seen_message_id[dedup_key] = msg_id

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

        storage.increment_counter(cfg.sqlite_path, "responses_received")

        if is_working_hours(cfg.working_hours):
            await _reply_now(pool, cfg, account_name, client, event, chat_id, text, profile)
        else:
            await _handle_off_hours(cfg, account_name, chat_id, text, event)

        # CRM: контакт обновляем на КАЖДОЕ новое сообщение в диалоге (полная
        # история целиком — так проще и надёжнее, чем гонять дельты). Лида
        # передаём в отдел продаж только ОДИН раз на контакт — здесь это
        # первый реальный ответ человека, а не сам факт детекта в группе
        # (то происходит намного раньше, ещё в scout_agent.py, и ничего в
        # CRM не отправляет: детект — это гипотеза, ответ человека — сигнал).
        sender = await event.get_sender()
        full_history = await loop.run_in_executor(
            None, storage.get_full_history, cfg.sqlite_path, chat_id, account_name
        )
        await push_contact(
            cfg,
            external_id=chat_id,
            status=STATUS_REPLIED,
            dialogue=full_history,
            name=(profile.get("display_name") if profile else None)
            or " ".join(filter(None, [getattr(sender, "first_name", ""), getattr(sender, "last_name", "")])).strip()
            or None,
            telegram_username=(profile.get("username") if profile else None) or getattr(sender, "username", None),
            source_chat_name=profile.get("source_group") if profile else None,
            trigger_message=profile.get("raw_last_message") if profile else None,
            trigger_reason=(profile.get("problem") or profile.get("niche_info")) if profile else None,
            outreach_account=account_name,
        )

        is_first_reply = await loop.run_in_executor(
            None, storage.mark_lead_pushed_if_new, cfg.sqlite_path, chat_id
        )
        if is_first_reply:
            title = (profile.get("problem") or profile.get("niche_info") if profile else None) or "Ответил в личных сообщениях"
            await push_lead(
                cfg,
                contact_external_id=chat_id,
                title=title,
                contact_name=(profile.get("display_name") if profile else None) or getattr(sender, "first_name", None),
                contact=f"@{sender.username}" if getattr(sender, "username", None) else None,
            )


async def _reply_now(pool: ManagerPool, cfg: AppConfig, account_name: str, client, event,
                      chat_id: str, text: str, profile: dict | None):
    history = storage.get_history(cfg.sqlite_path, chat_id, account_name, limit=20)
    # Последняя запись в history — то же сообщение, что мы только что сохранили;
    # убираем его из "истории" и передаём отдельным аргументом incoming_text.
    history_without_last = history[:-1] if history else []

    loop = asyncio.get_event_loop()
    persona = pool.persona_for_account(account_name)
    try:
        reply_text = await loop.run_in_executor(
            None, generate_reply, persona, history_without_last, text, cfg, profile
        )
    except AgentGenerationError:
        # LLM недоступен (таймаут/429/сеть/пустой ответ) после ретраев —
        # не отправляем лиду ничего сломанного, явно логируем сбой и выходим.
        # История лида уже сохранена, он не потерян: следующее сообщение или
        # ручная проверка логов подхватят диалог.
        logger.exception("[%s] Не удалось сгенерировать ответ для %s", account_name, chat_id)
        return

    # Имитация живого набора текста — резкий мгновенный ответ на большое
    # сообщение выглядит подозрительно и снижает доверие к "менеджеру".
    delay = len(reply_text) / cfg.typing_chars_per_second
    delay = max(cfg.min_reply_delay_seconds, min(cfg.max_reply_delay_seconds, delay))

    async with client.action(event.chat_id, "typing"):
        await asyncio.sleep(delay)

    await event.reply(reply_text)
    storage.save_message(cfg.sqlite_path, chat_id, account_name, role="manager", content=reply_text)
    storage.increment_counter(cfg.sqlite_path, "outbound_sent")
    logger.info("[%s] Ответ для %s: %s...", account_name, chat_id, reply_text[:80])


async def _handle_off_hours(cfg: AppConfig, account_name: str, chat_id: str, text: str, event):
    # Короткое уведомление шлём только один раз за "простой" — если в очереди
    # уже есть неотправленный ответ для этого лида, повторно не дёргаем его.
    # check+insert выполняются атомарно одним вызовом (см. storage.py) —
    # раздельные has_pending_queue()+enqueue_message() гонялись бы при двух
    # почти одновременных сообщениях от одного лида (дубль уведомления).
    already_pending = storage.enqueue_message_and_check_pending(
        cfg.sqlite_path, chat_id, account_name, content=text
    )

    if already_pending:
        return  # уведомление уже отправляли на предыдущее сообщение — не спамим

    wh = cfg.working_hours
    notice = cfg.off_hours_auto_reply.format(start=wh.start_hour, end=wh.end_hour, tz=wh.timezone)
    await event.reply(notice)
