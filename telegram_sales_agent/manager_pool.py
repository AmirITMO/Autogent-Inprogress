"""
Пул юзербот-аккаунтов ("менеджеров").

Каждый ManagerAccount из config.py — это отдельный Telethon-клиент на
отдельной Telegram-сессии обычного пользователя. Держим их все живыми
одновременно в одном event loop'е (не в отдельных потоках — Telethon
прекрасно работает с несколькими клиентами в одном asyncio loop).
"""

import logging

from telethon import TelegramClient

from config import AppConfig, ManagerAccount
import storage

logger = logging.getLogger(__name__)


def _build_proxy(cfg: AppConfig) -> tuple | None:
    """
    Telethon принимает proxy как кортеж для PySocks: (тип, host, port, rdns,
    username, password). Возвращает None, если TG_PROXY_HOST не задан —
    тогда TelegramClient(proxy=None) ведёт себя как раньше, без прокси.
    """
    if not cfg.tg_proxy_host or not cfg.tg_proxy_port:
        return None
    import socks
    return (socks.SOCKS5, cfg.tg_proxy_host, cfg.tg_proxy_port, True,
            cfg.tg_proxy_username, cfg.tg_proxy_password)


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
        """
        Если один из аккаунтов не смог подключиться/авторизоваться (битый
        .session, невалидные api_id/api_hash, сеть недоступна), уже
        запущенные до него клиенты раньше оставались висеть открытыми —
        исключение из client.start() пробрасывалось наверх в main.py, но
        соединения, поднятые для предыдущих аккаунтов в этом же цикле,
        никто не закрывал (утечка сокетов/файлов сессии). Явно откатываем
        частичный старт перед тем, как пробросить ошибку дальше.
        """
        # Явные connection_retries/retry_delay тут не задаём: Telethon и так
        # ретраит соединение по умолчанию (auto_reconnect=True), а видимый
        # снаружи backoff при полном исчерпании его попыток реализован на
        # уровень выше, в main.py::_run_client_forever (иначе пришлось бы
        # тянуть эти параметры через конструктор в тестовый фейк-клиент).
        proxy = _build_proxy(self.cfg)
        if proxy:
            logger.info("[Пул менеджеров] Соединение с Telegram через SOCKS5-прокси %s:%s.",
                        self.cfg.tg_proxy_host, self.cfg.tg_proxy_port)
        try:
            for acc in self.cfg.managers:
                client = TelegramClient(acc.session, acc.api_id, acc.api_hash, proxy=proxy)
                logger.info("[Пул менеджеров] Запускаю аккаунт '%s'...", acc.name)
                await client.start()
                self.clients[acc.name] = client
                me = await client.get_me()
                self.own_user_ids.add(me.id)
                logger.info("[Пул менеджеров] Аккаунт '%s' запущен (id=%s).", acc.name, me.id)
        except Exception:
            logger.exception("[Пул менеджеров] Не удалось запустить пул целиком — "
                              "откатываю уже поднятые аккаунты.")
            await self.stop_all()
            raise

    async def stop_all(self):
        for name, client in list(self.clients.items()):
            try:
                await client.disconnect()
                logger.info("[Пул менеджеров] Аккаунт '%s' отключён.", name)
            except Exception:
                logger.exception("[Пул менеджеров] Ошибка при отключении аккаунта '%s'.", name)
            finally:
                self.clients.pop(name, None)

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
