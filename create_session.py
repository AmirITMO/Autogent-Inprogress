"""
Разовый интерактивный скрипт: авторизует ОДИН новый Telegram-аккаунт
(номер телефона + код из SMS/Telegram + пароль 2FA, если включён) и
сохраняет .session файл — его потом прописываете в config.py -> managers.

Запускать локально (не на сервере без интерактивного терминала) один раз
на каждый новый аккаунт-менеджер:

    python create_session.py

Требует api_id и api_hash с https://my.telegram.org (API development tools,
créate application — один api_id/api_hash можно переиспользовать для всех
аккаунтов пула, это не привязано к конкретному номеру).
"""

import asyncio
import os

from telethon import TelegramClient


async def main():
    print("=== Авторизация нового аккаунта-менеджера ===\n")

    api_id = input("api_id (с my.telegram.org): ").strip()
    api_hash = input("api_hash (с my.telegram.org): ").strip()
    name = input("Имя аккаунта для config.py (например 'Анна'): ").strip() or "manager"
    session_dir = "sessions"
    os.makedirs(session_dir, exist_ok=True)
    session_path = os.path.join(session_dir, name.lower().replace(" ", "_"))

    client = TelegramClient(session_path, int(api_id), api_hash)

    # start() сам спросит номер телефона, код подтверждения и пароль 2FA
    # (если включён) прямо в консоли — стандартный интерактивный флоу Telethon.
    await client.start()

    me = await client.get_me()
    print(f"\n✅ Готово! Авторизован аккаунт: {me.first_name} (@{me.username}, id={me.id})")
    print(f"Файл сессии: {session_path}.session")
    print("\nДобавьте в config.py в список managers:\n")
    print(f"""        ManagerAccount(
            name="{name}",
            session="{session_path}",
            api_id={api_id},
            api_hash="{api_hash}",
        ),""")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
