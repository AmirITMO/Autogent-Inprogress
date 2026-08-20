"""
Конфигурация B2B email-агента. Отдельный процесс от instagram_scout_service
и telegram_sales_agent — свой OpenAI-ключ (поисковые запросы, извлечение
данных с сайтов, черновики писем), общается с CRM только исходящими
запросами (pull заданий/базы знаний, push результата).

Отправка писем — НЕ здесь: агент только парсит сайты и составляет черновик,
реальная отправка через SMTP происходит на стороне CRM после ручного
одобрения сотрудником (см. lib/actions/b2bEmailSend.ts в основном репо).
Раньше (см. комментарий в prisma/schema.prisma до этого изменения)
предполагалась полностью автоматическая отправка — сознательно отказались
в пользу контроля сотрудника над каждым письмом.
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
    crm_api_key: str = field(default_factory=lambda: os.environ.get("B2B_EMAIL_AGENT_API_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    apify_token: str = field(default_factory=lambda: os.environ.get("APIFY_TOKEN", ""))
    # Дефолты — официальные акторы Apify Store; сверяй input schema с Input
    # tab актора при смене (см. APIFY_INSTAGRAM_ACTOR в instagram_scout_service).
    apify_search_actor: str = field(
        default_factory=lambda: os.environ.get("APIFY_SEARCH_ACTOR", "apify/google-search-scraper")
    )
    apify_crawler_actor: str = field(
        default_factory=lambda: os.environ.get("APIFY_CRAWLER_ACTOR", "apify/website-content-crawler")
    )
    poll_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("POLL_INTERVAL_SECONDS", "30") or "30")
    )
    max_domains_per_job: int = field(
        default_factory=lambda: int(os.environ.get("MAX_DOMAINS_PER_JOB", "40") or "40")
    )


def require_complete(cfg: Config) -> None:
    """Падаем сразу с понятным сообщением, если чего-то не хватает —
    вместо невнятной ошибки на первом реальном запросе."""
    missing = [
        name
        for name, value in [
            ("CRM_API_URL", cfg.crm_api_url),
            ("B2B_EMAIL_AGENT_API_KEY", cfg.crm_api_key),
            ("OPENAI_API_KEY", cfg.openai_api_key),
            ("APIFY_TOKEN", cfg.apify_token),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError(f"Не заданы обязательные переменные окружения: {', '.join(missing)}")
