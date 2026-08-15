"""
Конфигурация Instagram-скрейпинг-сервиса. Отдельный процесс от
telegram_sales_agent — свой Instagram-аккаунт, свой OpenAI-ключ (для
черновиков офферов), общается с CRM только исходящими запросами (pull
заданий, push результатов) — см. crm_client.py.
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
    ig_username: str = field(default_factory=lambda: os.environ.get("IG_USERNAME", ""))
    ig_password: str = field(default_factory=lambda: os.environ.get("IG_PASSWORD", ""))
    ig_session_path: str = field(default_factory=lambda: os.environ.get("IG_SESSION_PATH", "sessions/ig_session.json"))
    poll_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("POLL_INTERVAL_SECONDS", "30") or "30")
    )
    # Пауза между запросами внутри одного задания — не бьём по Instagram
    # заливом N запросов подряд (см. docs/pipeline/spikes/FINDINGS.md).
    request_pause_seconds: float = field(
        default_factory=lambda: float(os.environ.get("REQUEST_PAUSE_SECONDS", "3") or "3")
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
            ("IG_USERNAME", cfg.ig_username),
            ("IG_PASSWORD", cfg.ig_password),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(f"Не заданы обязательные переменные окружения: {', '.join(missing)}")
