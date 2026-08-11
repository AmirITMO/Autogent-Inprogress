"""
Агент-скаут: слушает сообщения в рабочих группах (те же аккаунты пула,
что потом пишут в личку) и ведёт "базу знаний" — профиль по каждому
продавцу в Google Sheet (profile_store.py), а не разовую запись лида.

Работает параллельно с reactive_handler.py (личка) на одних и тех же
клиентах — это просто ещё один event-обработчик, повешенный на каждый
клиент пула.
"""

import asyncio

from telethon import events, utils

import profile_store
from agent import analyze_group_message
from config import AppConfig
from manager_pool import ManagerPool


def _chat_matches_targets(chat, target_groups: list[str]) -> bool:
    """
    chat.id у Telethon для супергрупп/каналов — "сырой" id (без -100), а в
    диалогах/конфиге используется "маркированный" id (с минусом и префиксом
    -100). utils.get_peer_id нормализует это несоответствие — без него
    сравнение по id никогда не совпадает для супергрупп.
    """
    username = (getattr(chat, "username", None) or "").lower()
    chat_id = str(utils.get_peer_id(chat))
    targets = {t.lower().lstrip("@") for t in target_groups}
    return username in targets or chat_id in targets


def register_all(pool: ManagerPool, cfg: AppConfig, profiles_sheet):
    for account_name in pool.account_names():
        client = pool.client_for_account(account_name)
        _register_one(pool, cfg, account_name, client, profiles_sheet)


def _register_one(pool: ManagerPool, cfg: AppConfig, account_name: str, client, profiles_sheet):
    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_group or e.is_channel))
    async def handler(event):
        text = event.message.message
        if not text or len(text.strip()) < cfg.scout_min_message_length:
            return  # дешёвый предфильтр — короткие сообщения не гоняем через ИИ

        sender_id = event.sender_id
        if sender_id in pool.own_user_ids:
            return  # не анализируем сообщения "своих" же аккаунтов-менеджеров

        chat = await event.get_chat()
        if not _chat_matches_targets(chat, cfg.target_groups):
            return  # сообщение из группы, которая не в списке мониторинга

        sender = await event.get_sender()
        username = getattr(sender, "username", "") or ""
        display_name = " ".join(
            filter(None, [getattr(sender, "first_name", ""), getattr(sender, "last_name", "")])
        ).strip()
        source_group = getattr(chat, "username", None) or getattr(chat, "title", "") or str(chat.id)

        loop = asyncio.get_event_loop()

        existing_profile = await loop.run_in_executor(
            None, profile_store.get_profile, profiles_sheet, sender_id
        )

        analysis = await loop.run_in_executor(
            None, analyze_group_message, text, existing_profile, cfg
        )

        if not analysis["is_relevant"]:
            return

        await loop.run_in_executor(
            None,
            lambda: profile_store.upsert_profile(
                profiles_sheet,
                sender_id,
                username=username,
                display_name=display_name,
                source_group=source_group,
                problem=analysis["problem"],
                niche_info=analysis["niche_info"],
                budget_time=analysis["budget_time"],
                raw_last_message=text[:300],
            ),
        )
        print(f"[Скаут:{account_name}] Обновлён профиль {sender_id} ({username or display_name}) "
              f"из группы '{source_group}'.")
