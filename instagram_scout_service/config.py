"""
Конфигурация Instagram-скрейпинг-сервиса. Отдельный процесс от
telegram_sales_agent — свой OpenAI-ключ (для ранжирования кандидатов и
черновиков офферов), общается с CRM только исходящими запросами (pull
заданий, push результатов) — см. crm_client.py.

Поиск идёт через Apify (см. scraper.py) — свой Instagram-аккаунт для
парсинга больше не нужен: раньше aiograpi логинился под реальным аккаунтом
в приватный API Instagram (не по ToS, риск challenge_required/бана), Apify
исполняет то же самое на своей инфраструктуре.
"""

import os
from dataclasses import dataclass, field

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


@dataclass
class Config:
    crm_api_url: str = field(default_factory=lambda: os.environ.get("CRM_API_URL", ""))
    crm_api_key: str = field(default_factory=lambda: os.environ.get("INSTAGRAM_AGENT_API_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    apify_token: str = field(default_factory=lambda: os.environ.get("APIFY_TOKEN", ""))
    poll_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("POLL_INTERVAL_SECONDS", "30") or "30")
    )
    # Юзернеймы, уже обработанные хоть раз (найдены и отправлены в CRM ИЛИ
    # отсеяны при обогащении/ранжировании) — не тратим повторно платный
    # enrichment-вызов на того же кандидата при повторном запуске поиска по
    # тому же каналу. Один файл на канал, см. seen_store.py.
    seen_store_path: str = field(
        default_factory=lambda: os.environ.get("SEEN_STORE_PATH", "data/seen_usernames.json")
    )


def require_complete(cfg: Config) -> None:
    """Падаем сразу с понятным сообщением, если чего-то не хватает —
    вместо невнятной ошибки на первом реальном запросе."""
    missing = [
        name
        for name, value in [
            ("CRM_API_URL", cfg.crm_api_url),
            ("INSTAGRAM_AGENT_API_KEY", cfg.crm_api_key),
            ("OPENAI_API_KEY", cfg.openai_api_key),
            ("APIFY_TOKEN", cfg.apify_token),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(f"Не заданы обязательные переменные окружения: {', '.join(missing)}")
