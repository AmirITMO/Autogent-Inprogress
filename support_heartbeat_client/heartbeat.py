"""
Генерик heartbeat-клиент для проектов, сданных клиенту и переведённых в CRM
на этап "Поддержка"/"Постоплата" (см. раздел "Управление поддержкой" —
app/(app)/support в основном репо).

Эта папка целиком копируется в репозиторий клиентского проекта и
подключается к его основному циклу (см. README.md рядом). Платформа сама
никогда не стучится в сервис клиента — как и остальные интеграции Autogent
Platform (instagram_scout_service/crm_client.py и соседи), heartbeat идёт
только исходящим pull/push от сервиса к платформе.

Если процесс на сервере клиента упадёт совсем, он просто перестанет слать
пинги — это ловит отдельный сторож check-stale на стороне платформы
(app/api/support/check-stale), а не что-то здесь.
"""

import asyncio
import logging
import os
from dataclasses import dataclass, field

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import httpx

logger = logging.getLogger(__name__)


@dataclass
class HeartbeatConfig:
    url: str = field(default_factory=lambda: os.environ.get("SUPPORT_HEARTBEAT_URL", ""))
    interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("SUPPORT_HEARTBEAT_INTERVAL_SECONDS", "60") or "60")
    )


async def send_heartbeat(cfg: HeartbeatConfig, *, status: str = "OK", detail: str | None = None) -> None:
    """Разовый пинг. Best-effort: ошибка отправки только логируется — сломанная
    сеть на секунду не должна ронять основной цикл сервиса, отсутствие
    пинга дольше нескольких интервалов и так поймает check-stale."""
    if not cfg.url:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(cfg.url, json={"status": status, "detail": detail})
        resp.raise_for_status()
    except Exception:
        logger.warning("Не удалось отправить heartbeat на %s", cfg.url, exc_info=True)


async def heartbeat_loop(cfg: HeartbeatConfig) -> None:
    """Фоновая задача — запускать рядом с остальными тасками сервиса:

        asyncio.create_task(heartbeat_loop(cfg))

    Статус тут всегда OK: это подтверждение "процесс жив", а не агрегатор
    ошибок. Если у сервиса есть свой цикл с ошибками (try/except вокруг
    обработки), для DEGRADED/DOWN зовите send_heartbeat() из этого места
    напрямую — см. README.md, раздел "Репортить ошибки, а не только факт жизни"."""
    if not cfg.url:
        logger.info("SUPPORT_HEARTBEAT_URL не задан — heartbeat отключён.")
        return
    while True:
        await send_heartbeat(cfg)
        await asyncio.sleep(cfg.interval_seconds)
