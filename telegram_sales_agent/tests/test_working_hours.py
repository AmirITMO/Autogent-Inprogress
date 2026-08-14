"""Тесты working_hours.py — рабочие часы с учётом timezone, граничные случаи."""

from datetime import datetime
from zoneinfo import ZoneInfo

from config import WorkingHours
from working_hours import is_working_hours, next_working_start, seconds_until_working

TZ = ZoneInfo("Europe/Moscow")


def _dt(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=TZ)


def test_working_hours_true_on_weekday_within_range():
    wh = WorkingHours()
    monday_noon = _dt(2026, 8, 10, 12)  # 2026-08-10 — понедельник
    assert is_working_hours(wh, monday_noon) is True


def test_working_hours_false_on_weekend():
    wh = WorkingHours()
    saturday = _dt(2026, 8, 15, 12)  # суббота
    assert is_working_hours(wh, saturday) is False


def test_start_hour_is_inclusive():
    wh = WorkingHours()
    exactly_start = _dt(2026, 8, 10, wh.start_hour, 0)
    assert is_working_hours(wh, exactly_start) is True


def test_end_hour_is_exclusive():
    wh = WorkingHours()
    exactly_end = _dt(2026, 8, 10, wh.end_hour, 0)
    assert is_working_hours(wh, exactly_end) is False


def test_one_minute_before_end_is_working():
    wh = WorkingHours()
    almost_end = _dt(2026, 8, 10, wh.end_hour - 1, 59)
    assert is_working_hours(wh, almost_end) is True


def test_one_hour_before_start_is_not_working():
    wh = WorkingHours()
    before_start = _dt(2026, 8, 10, wh.start_hour - 1, 0)
    assert is_working_hours(wh, before_start) is False


def test_seconds_until_working_zero_when_already_working():
    wh = WorkingHours()
    now = _dt(2026, 8, 10, 12)
    assert seconds_until_working(wh, now) == 0.0


def test_seconds_until_working_positive_on_weekend():
    wh = WorkingHours()
    saturday_noon = _dt(2026, 8, 15, 12)
    seconds = seconds_until_working(wh, saturday_noon)
    assert seconds > 0


def test_next_working_start_same_day_before_hours():
    wh = WorkingHours()
    early_monday = _dt(2026, 8, 10, 6)
    result = next_working_start(wh, early_monday)
    assert result == _dt(2026, 8, 10, wh.start_hour)


def test_next_working_start_returns_now_when_already_working():
    wh = WorkingHours()
    now = _dt(2026, 8, 10, 12)
    result = next_working_start(wh, now)
    assert result == now


def test_next_working_start_after_hours_rolls_to_next_workday():
    wh = WorkingHours()
    late_monday = _dt(2026, 8, 10, 21)
    result = next_working_start(wh, late_monday)
    assert result == _dt(2026, 8, 11, wh.start_hour)


def test_next_working_start_friday_evening_rolls_to_monday():
    wh = WorkingHours()
    friday_evening = _dt(2026, 8, 14, 21)  # пятница вечером
    result = next_working_start(wh, friday_evening)
    assert result.weekday() == 0  # понедельник
    assert result.hour == wh.start_hour
