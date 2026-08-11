"""
Разовый тестовый скрипт: поднимает ОТЛАДОЧНУЮ версию скаут-обработчика (та же
логика, что в scout_agent.py, но с print на КАЖДОМ шаге фильтра), чтобы вживую
увидеть, на каком именно этапе отсеивается тестовое сообщение.

Запуск:  python -u scout_test.py
Остановка: Ctrl+C (или просто убить процесс).
"""

import asyncio

from telethon import TelegramClient, events

from config import CONFIG
from agent import analyze_group_message
import profile_store
from local_sheet import LocalSheet
from scout_agent import _chat_matches_targets


async def main():
    acc = CONFIG.managers[0]
    client = TelegramClient(acc.session, acc.api_id, acc.api_hash)
    await client.start()

    profiles_sheet = LocalSheet("profiles_local_test.json", header=profile_store.HEADER)
    me = await client.get_me()
    own_ids = {me.id}

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_group or e.is_channel))
    async def handler(event):
        chat = await event.get_chat()
        sender = await event.get_sender()
        text = event.message.message or ""
        print(f"\n[DEBUG] Входящее сообщение: chat_id={chat.id} chat='{getattr(chat, 'title', '')}' "
              f"sender_id={event.sender_id} sender='{getattr(sender, 'first_name', '')}' text='{text}'")

        if not text or len(text.strip()) < CONFIG.scout_min_message_length:
            print(f"[DEBUG] -> ОТСЕЯНО: длина текста {len(text.strip())} < {CONFIG.scout_min_message_length}")
            return

        if event.sender_id in own_ids:
            print(f"[DEBUG] -> ОТСЕЯНО: отправитель {event.sender_id} — это сам юзербот ({own_ids})")
            return

        if not _chat_matches_targets(chat, CONFIG.target_groups):
            print(f"[DEBUG] -> ОТСЕЯНО: chat_id={chat.id} не входит в target_groups={CONFIG.target_groups}")
            return

        print("[DEBUG] -> прошло все локальные фильтры, зову ИИ-анализ (analyze_group_message)...")

        existing_profile = await asyncio.get_event_loop().run_in_executor(
            None, profile_store.get_profile, profiles_sheet, event.sender_id
        )
        analysis = await asyncio.get_event_loop().run_in_executor(
            None, analyze_group_message, text, existing_profile, CONFIG
        )
        print(f"[DEBUG] -> ответ ИИ: {analysis}")

        if not analysis["is_relevant"]:
            print("[DEBUG] -> ОТСЕЯНО: ИИ решил, что сообщение не несёт полезной информации (is_relevant=false)")
            return

        username = getattr(sender, "username", "") or ""
        display_name = " ".join(
            filter(None, [getattr(sender, "first_name", ""), getattr(sender, "last_name", "")])
        ).strip()
        source_group = getattr(chat, "username", None) or getattr(chat, "title", "") or str(chat.id)

        profile_store.upsert_profile(
            profiles_sheet, event.sender_id, username=username, display_name=display_name,
            source_group=source_group, problem=analysis["problem"], niche_info=analysis["niche_info"],
            budget_time=analysis["budget_time"], raw_last_message=text[:300],
        )
        print(f"[Скаут:{acc.name}] Обновлён профиль {event.sender_id} ({username or display_name}) "
              f"из группы '{source_group}'.")

    print(f"[Тест скаута] Слушаю ТОЛЬКО group id={CONFIG.target_groups} от имени {acc.name}. Ctrl+C для остановки.")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
