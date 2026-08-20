"""
Конфигурация агента автокомментинга. Отдельный процесс от
telegram_sales_agent/instagram_scout_service/b2b_email_agent — свой
Telegram-аккаунт (юзербот), свой OpenAI-ключ, общается с CRM только
исходящими запросами (pull одобренных черновиков, push новых черновиков).

Один юзербот-аккаунт: слушает целевые каналы и предлагает черновики
(monitor.py), публикует только то, что сотрудник явно одобрил в CRM
(sender.py) — без полного автопостинга (см. README.md, риски описаны там же).
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
    crm_api_key: str = field(default_factory=lambda: os.environ.get("TG_AUTOCOMMENT_AGENT_API_KEY", ""))
    crm_channel_id: str = field(default_factory=lambda: os.environ.get("CRM_CHANNEL_ID", ""))
    openai_api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))

    tg_api_id: int = field(default_factory=lambda: int(os.environ.get("TG_API_ID", "0") or "0"))
    tg_api_hash: str = field(default_factory=lambda: os.environ.get("TG_API_HASH", ""))
    tg_session_path: str = field(default_factory=lambda: os.environ.get("TG_SESSION_PATH", "sessions/comment_agent"))

    # Тот же приём, что в telegram_sales_agent/config.py — нужен, если
    # сервер не может напрямую достучаться до серверов Telegram.
    tg_proxy_host: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_HOST", "") or None)
    tg_proxy_port: int = field(default_factory=lambda: int(os.environ.get("TG_PROXY_PORT", "0") or "0"))
    tg_proxy_username: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_USERNAME", "") or None)
    tg_proxy_password: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_PASSWORD", "") or None)

    poll_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("POLL_INTERVAL_SECONDS", "30") or "30")
    )
    # Жёсткий потолок публикаций в день на аккаунт — массовые автокомментарии
    # детектятся Telegram агрессивнее, чем чтение (см. README.md). Держим
    # заметно ниже разумного максимума жертвуя охватом ради безопасности акка.
    max_comments_per_day: int = field(
        default_factory=lambda: int(os.environ.get("MAX_COMMENTS_PER_DAY", "15") or "15")
    )
    min_delay_between_comments_seconds: float = field(
        default_factory=lambda: float(os.environ.get("MIN_DELAY_BETWEEN_COMMENTS_SECONDS", "180") or "180")
    )
    sqlite_path: str = field(default_factory=lambda: os.environ.get("SQLITE_PATH", "comment_agent.db"))


def require_complete(cfg: Config) -> None:
    """Падаем сразу с понятным сообщением, если чего-то не хватает —
    вместо невнятной ошибки на первом реальном запросе."""
    missing = [
        name
        for name, value in [
            ("CRM_API_URL", cfg.crm_api_url),
            ("TG_AUTOCOMMENT_AGENT_API_KEY", cfg.crm_api_key),
            ("CRM_CHANNEL_ID", cfg.crm_channel_id),
            ("OPENAI_API_KEY", cfg.openai_api_key),
            ("TG_API_ID", str(cfg.tg_api_id) if cfg.tg_api_id else ""),
            ("TG_API_HASH", cfg.tg_api_hash),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(f"Не заданы обязательные переменные окружения: {', '.join(missing)}")
