"""
Пул юзербот-аккаунтов ("менеджеров").

Каждый ManagerAccount из config.py — это отдельный Telethon-клиент на
отдельной Telegram-сессии обычного пользователя. Держим их все живыми
одновременно в одном event loop'е (не в отдельных потоках — Telethon
прекрасно работает с несколькими клиентами в одном asyncio loop).
"""

from telethon import TelegramClient

from config import AppConfig, ManagerAccount
import storage


class ManagerPool:
    def __init__(self, cfg: AppConfig):
        self.cfg = cfg
        self.clients: dict[str, TelegramClient] = {}
        self.accounts_by_name: dict[str, ManagerAccount] = {
            acc.name: acc for acc in cfg.managers
        }
        self.own_user_ids: set[int] = set()  # чтобы скаут не анализировал сообщения "своих" аккаунтов
        storage.init_db(cfg.sqlite_path)

    async def start_all(self):
        for acc in self.cfg.managers:
            client = TelegramClient(acc.session, acc.api_id, acc.api_hash)
            await client.start()
            self.clients[acc.name] = client
            me = await client.get_me()
            self.own_user_ids.add(me.id)
            print(f"[Пул менеджеров] Аккаунт '{acc.name}' запущен (id={me.id}).")

    async def stop_all(self):
        for name, client in self.clients.items():
            await client.disconnect()
            print(f"[Пул менеджеров] Аккаунт '{name}' отключён.")

    def account_names(self) -> list[str]:
        return list(self.accounts_by_name.keys())

    def client_for_account(self, account_name: str) -> TelegramClient:
        return self.clients[account_name]

    def persona_for_account(self, account_name: str) -> str:
        return self.accounts_by_name[account_name].persona

    def assign_lead(self, chat_id: str) -> str:
        """Закрепляет лида за наименее загруженным аккаунтом (стабильно, один раз)."""
        return storage.assign_account(self.cfg.sqlite_path, chat_id, self.account_names())

    def client_for_lead(self, chat_id: str) -> tuple[str, TelegramClient]:
        account_name = self.assign_lead(chat_id)
        return account_name, self.clients[account_name]

    def has_daily_capacity(self, account_name: str) -> bool:
        used = storage.outbound_count_today(self.cfg.sqlite_path, account_name)
        return used < self.cfg.max_outbound_per_account_per_day

    def account_with_capacity(self) -> str | None:
        """Первый аккаунт, у которого ещё есть дневная квота на исходящие."""
        for name in self.account_names():
            if self.has_daily_capacity(name):
                return name
        return None
