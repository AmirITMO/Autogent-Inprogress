"""
Общая конфигурация системы "ИИ-менеджеры вместо отдела продаж".

Ничего не хардкодьте прямо тут в проде — читайте реальные секреты
(api_id/api_hash/session/OpENAI_KEY) из переменных окружения или
Streamlit secrets. Здесь только структура конфига.
"""

import os
from dataclasses import dataclass, field
from typing import List

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


@dataclass
class ManagerAccount:
    """Один юзербот-аккаунт = один "менеджер" в глазах селлера."""
    name: str            # человекочитаемое имя, например "Анна" — для промпта и логов
    session: str         # путь/имя .session файла Telethon
    api_id: int
    api_hash: str
    persona: str = (
        "Ты — Анна, менеджер по работе с продавцами (селлерами) в нашей команде. "
        "Общаешься в Telegram лично с продавцом, который состоит в наших рабочих группах. "
        "Пишешь как живой человек: коротко, по-деловому, но дружелюбно, без канцелярита и без эмодзи-спама."
    )
    # Аккаунт только слушает группы (scout_agent) — никогда не пишет в личку
    # сам: не участвует в reactive_handler/outreach_broadcast/queue_worker.
    # Снижает риск бана: аккаунт, который никогда не отправляет сообщения,
    # не попадает под антиспам-эвристики за исходящую активность. Первый
    # контакт с найденным лидом сотрудник делает вручную с ДРУГОГО аккаунта,
    # вне этого кода — см. AGENTS.md / docs/pipeline/decisions.md.
    scout_only: bool = False


@dataclass
class WorkingHours:
    timezone: str = "Europe/Moscow"
    start_hour: int = 9      # включительно
    end_hour: int = 20       # не включительно
    workdays: tuple = (0, 1, 2, 3, 4)  # Пн-Пт (datetime.weekday(): 0=Пн)


@dataclass
class AppConfig:
    openai_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    # Если задан (например, для OpenRouter: https://openrouter.ai/api/v1) — SDK openai
    # ходит на этот адрес вместо api.openai.com. Пусто = обычный OpenAI.
    openai_base_url: str | None = field(default_factory=lambda: os.environ.get("OPENAI_BASE_URL", "") or None)
    # Для OpenRouter модели указываются с префиксом провайдера, напр. "openai/gpt-4o-mini".
    chat_model: str = field(default_factory=lambda: os.environ.get("CHAT_MODEL", "gpt-4o-mini"))

    # Push-интеграция с внешним CRM (см. crm_integration.py): найденные лиды
    # и периодический снимок метрик отправляются туда сами (push), а не
    # наоборот — CRM не сможет достучаться до локально запущенного агента
    # без публичного адреса, а агенту исходящий интернет и так нужен для
    # Telegram/OpenAI. Полностью опционально: пустой crm_api_url отключает
    # интеграцию целиком, без fail-fast — это не критичная для работы
    # агента зависимость.
    crm_api_url: str | None = field(default_factory=lambda: os.environ.get("CRM_API_URL", "") or None)
    crm_api_key: str = field(default_factory=lambda: os.environ.get("CRM_API_KEY", ""))
    crm_channel_id: str = field(default_factory=lambda: os.environ.get("CRM_CHANNEL_ID", ""))
    crm_metrics_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("CRM_METRICS_INTERVAL_SECONDS", "300") or "300")
    )

    # SOCKS5-прокси для соединения с Telegram (Telethon) — нужен, если сервер,
    # где крутится агент, не может напрямую достучаться до серверов Telegram
    # (DPI-блокировка на уровне провайдера/датацентра — наблюдали это вживую
    # на VPS: ping до Telegram проходит, TCP:443 до него глохнет, при этом
    # остальной интернет работает нормально). Пусто = без прокси, прямое
    # соединение (как раньше). ManagerAccount.proxy формируется из этих
    # значений в manager_pool.py.
    tg_proxy_host: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_HOST", "") or None)
    tg_proxy_port: int = field(default_factory=lambda: int(os.environ.get("TG_PROXY_PORT", "0") or "0"))
    tg_proxy_username: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_USERNAME", "") or None)
    tg_proxy_password: str | None = field(default_factory=lambda: os.environ.get("TG_PROXY_PASSWORD", "") or None)

    # Единая таблица "база знаний": скаут пишет/обновляет профили,
    # менеджер читает их перед первым и каждым следующим сообщением.
    profiles_sheet_name: str = "Profiles"

    # Группы, в которых аккаунты пула сидят как участники и слушают сообщения
    # (username без @, либо numeric chat id группы).
    target_groups: List[str] = field(default_factory=lambda: [
        "-1004294205798",  # Город 1
    ])

    # Дешёвый предфильтр ДО вызова ИИ: сообщения короче этого — точно шум
    # (стикеры/эмодзи/однословные реплики), их не имеет смысла анализировать.
    scout_min_message_length: int = 15

    # База знаний менеджера (ваши файлы 00-08 на рабочем столе) — RAG-поиск
    # см. knowledge_base.py. cache_path — куда сложить посчитанные эмбеддинги,
    # чтобы не пересчитывать их при каждом перезапуске.
    kb_dir: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "База знаний менеджера")
    kb_cache_path: str = "kb_index.json"
    kb_top_k: int = 4

    # В базе знаний прямо помечено, что часть цифр (проценты партнёрки, цена
    # настройки ИИ, лимит кабинетов, требование карты на демо) расходится
    # между разными звонками. Это правило добавляется в промпт каждого
    # менеджера, чтобы агент не выдумывал точную цифру там, где команда сама
    # её не знает наверняка.
    kb_uncertainty_rule: str = (
        "Если в справочной информации разные цифры по одному вопросу помечены как расходящиеся "
        "(партнёрская программа, цена настройки ИИ, лимит кабинетов, условия демо-доступа) — "
        "НЕ называй клиенту точное число как факт. Назови официальные цифры, если они явно даны "
        "(подписка 5000₽/мес или 50000₽/год), а по спорным пунктам скажи, что уточнишь актуальные "
        "условия, и не придумывай на ходу."
    )

    # Пул юзербот-аккаунтов ("менеджеров"). Добавляйте сюда реальные аккаунты —
    # чем их больше, тем меньше исходящих сообщений в день падает на каждый
    # отдельный аккаунт при массовой рассылке (ниже риск флуд-бана от Telegram).
    managers: List[ManagerAccount] = field(default_factory=lambda: [
        ManagerAccount(
            name="Амир",
            session="sessions/амир",
            api_id=int(os.environ.get("TG_API_ID_1", "0") or "0"),
            api_hash=os.environ.get("TG_API_HASH_1", ""),
        ),
    ])

    working_hours: WorkingHours = field(default_factory=WorkingHours)

    # Ограничения, чтобы не поймать флуд-бан на юзербот-аккаунте
    max_outbound_per_account_per_day: int = 40
    delay_between_outbound_seconds: float = 6.0

    # "Человечность" ответов в реактивном режиме
    typing_chars_per_second: float = 12.0   # скорость "печати" для имитации живого набора
    min_reply_delay_seconds: float = 2.0
    max_reply_delay_seconds: float = 25.0

    # Что писать, если сообщение пришло вне рабочих часов
    off_hours_auto_reply: str = (
        "Привет! Я на связи в рабочее время ({start}:00–{end}:00, {tz}). "
        "Отвечу вам, как только начнём работу — уже вижу ваш вопрос."
    )

    sqlite_path: str = "sales_agent.db"


CONFIG = AppConfig()


class ConfigError(RuntimeError):
    """
    Обязательная переменная окружения отсутствует/пуста. Поднимается один
    раз, явно, при старте процесса (см. validate() ниже) — специально
    ЧТОБЫ НЕ упасть намного позже неявным образом: пустой OPENAI_API_KEY
    иначе проявился бы только при первом входящем сообщении лида (ошибка
    авторизации из недр openai SDK), а api_id=0/api_hash="" — только при
    попытке TelegramClient.start() (невнятная ошибка Telethon про
    api_id/hash combination). Если .env вообще отсутствует, все три поля
    тихо становятся "0"/"" (см. os.environ.get(..., "") выше) и без этой
    проверки процесс просто падает где-то в середине рантайма.
    """


def validate(cfg: AppConfig) -> None:
    """Fail-fast проверка обязательных настроек. Вызывается из main.py до
    старта пула аккаунтов и до первого обращения к LLM."""
    problems: list[str] = []

    if not cfg.openai_key:
        problems.append("OPENAI_API_KEY не задан (переменная окружения или .env).")

    if not cfg.managers:
        problems.append("В config.py не задано ни одного аккаунта (managers пуст).")
    for acc in cfg.managers:
        if not acc.api_id:
            problems.append(f"Аккаунт '{acc.name}': api_id не задан или равен 0 "
                             f"(проверьте соответствующую TG_API_ID_* в .env).")
        if not acc.api_hash:
            problems.append(f"Аккаунт '{acc.name}': api_hash не задан "
                             f"(проверьте соответствующую TG_API_HASH_* в .env).")

    if problems:
        details = "\n  - ".join(problems)
        raise ConfigError(
            "Конфигурация не прошла проверку при старте:\n  - " + details +
            "\n\nСкопируйте .env.example в .env и заполните реальными значениями "
            "(секреты нигде не логируются)."
        )
