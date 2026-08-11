"""Проверка рабочих часов и расчёт следующего рабочего окна."""

from datetime import datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo

from config import WorkingHours


def _now(wh: WorkingHours) -> datetime:
    return datetime.now(ZoneInfo(wh.timezone))


def is_working_hours(wh: WorkingHours, now: datetime | None = None) -> bool:
    now = now or _now(wh)
    if now.weekday() not in wh.workdays:
        return False
    return wh.start_hour <= now.hour < wh.end_hour


def next_working_start(wh: WorkingHours, now: datetime | None = None) -> datetime:
    """Ближайший момент времени, когда начнётся рабочее окно (для постановки в очередь)."""
    now = now or _now(wh)
    candidate = now

    for _ in range(14):  # запас на случай длинных выходных/праздников
        if candidate.weekday() in wh.workdays:
            start = candidate.replace(hour=wh.start_hour, minute=0, second=0, microsecond=0)
            if candidate < start:
                return start
            end = candidate.replace(hour=wh.end_hour, minute=0, second=0, microsecond=0)
            if candidate < end:
                # уже внутри рабочего окна
                return candidate
        # переходим на начало следующего дня и пробуем снова
        candidate = (candidate + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    # fallback, не должно случиться
    return now + timedelta(days=1)


def seconds_until_working(wh: WorkingHours, now: datetime | None = None) -> float:
    now = now or _now(wh)
    if is_working_hours(wh, now):
        return 0.0
    target = next_working_start(wh, now)
    return max(0.0, (target - now).total_seconds())
