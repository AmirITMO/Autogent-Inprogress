"""
Тесты profile_store.py поверх LocalSheet (fake sheet, без реального gspread).

Ключевая бизнес-логика: upsert_profile обновляет профиль накопительно —
поля со значением None НЕ затирают то, что уже было записано раньше.
"""

import pytest

import profile_store
from local_sheet import LocalSheet
from profile_store import (
    HEADER,
    STATUS_CONTACTED,
    STATUS_NEW,
    get_profile,
    new_leads,
    set_status,
    upsert_profile,
)


@pytest.fixture(autouse=True)
def _reset_module_cache():
    """
    profile_store держит process-глобальный кэш user_id -> row_idx,
    keyed по id(sheet). Раз id() объектов CPython может переиспользоваться
    после сборки мусора, сбрасываем кэш перед каждым тестом, чтобы тесты
    были независимы друг от друга.
    """
    profile_store._row_cache.clear()
    profile_store._cache_loaded_for = None
    yield
    profile_store._row_cache.clear()
    profile_store._cache_loaded_for = None


@pytest.fixture
def sheet(tmp_path):
    return LocalSheet(str(tmp_path / "profiles.json"), header=HEADER)


def test_upsert_creates_new_profile(sheet):
    profile = upsert_profile(
        sheet, 111, username="john", display_name="John Doe",
        source_group="group1", problem="Нужна автоматизация",
    )
    assert profile["user_id"] == "111"
    assert profile["username"] == "john"
    assert profile["display_name"] == "John Doe"
    assert profile["source_group"] == "group1"
    assert profile["problem"] == "Нужна автоматизация"
    assert profile["status"] == STATUS_NEW
    assert profile["assigned_account"] == ""
    # ровно одна строка данных добавлена
    assert len(sheet.get_all_values()) == 2


def test_upsert_second_call_updates_not_duplicates(sheet):
    upsert_profile(sheet, 111, problem="A")
    upsert_profile(sheet, 111, problem=None)

    assert len(sheet.get_all_values()) == 2  # header + 1 строка, не 2
    profile = get_profile(sheet, 111)
    assert profile["problem"] == "A"  # None не затёр значение


def test_upsert_none_fields_do_not_overwrite_existing_values(sheet):
    upsert_profile(sheet, 111, problem="A", niche_info="Ниша X", budget_time="50000")
    upsert_profile(sheet, 111, problem=None, niche_info=None, budget_time=None)

    profile = get_profile(sheet, 111)
    assert profile["problem"] == "A"
    assert profile["niche_info"] == "Ниша X"
    assert profile["budget_time"] == "50000"


def test_upsert_third_call_overwrites_with_new_value(sheet):
    upsert_profile(sheet, 111, problem="A")
    upsert_profile(sheet, 111, problem=None)
    upsert_profile(sheet, 111, problem="B")

    profile = get_profile(sheet, 111)
    assert profile["problem"] == "B"
    assert len(sheet.get_all_values()) == 2


def test_upsert_empty_username_does_not_clear_existing(sheet):
    upsert_profile(sheet, 111, username="john")
    upsert_profile(sheet, 111, username="")

    profile = get_profile(sheet, 111)
    assert profile["username"] == "john"


def test_upsert_username_updates_when_truthy(sheet):
    upsert_profile(sheet, 111, username="john")
    upsert_profile(sheet, 111, username="john_new")

    profile = get_profile(sheet, 111)
    assert profile["username"] == "john_new"


def test_upsert_last_updated_changes_on_every_call(sheet):
    p1 = upsert_profile(sheet, 111, problem="A")
    p2 = upsert_profile(sheet, 111, problem="B")
    assert p1["first_seen"] == p2["first_seen"]
    assert p2["last_updated"] != ""


def test_get_profile_returns_none_for_unknown_user(sheet):
    assert get_profile(sheet, 999) is None


def test_set_status_changes_status(sheet):
    upsert_profile(sheet, 111, problem="A")
    set_status(sheet, 111, STATUS_CONTACTED)
    profile = get_profile(sheet, 111)
    assert profile["status"] == STATUS_CONTACTED


def test_set_status_with_assigned_account(sheet):
    upsert_profile(sheet, 111, problem="A")
    set_status(sheet, 111, STATUS_CONTACTED, assigned_account="Амир")
    profile = get_profile(sheet, 111)
    assert profile["status"] == STATUS_CONTACTED
    assert profile["assigned_account"] == "Амир"


def test_set_status_unknown_user_is_noop(sheet):
    set_status(sheet, 999, STATUS_CONTACTED)  # не должно падать
    assert get_profile(sheet, 999) is None


def test_new_leads_returns_only_new_status(sheet):
    upsert_profile(sheet, 111, problem="A")
    upsert_profile(sheet, 222, problem="B")
    set_status(sheet, 222, STATUS_CONTACTED)

    leads = new_leads(sheet)
    ids = {lead["user_id"] for lead in leads}
    assert ids == {"111"}


def test_new_leads_respects_limit(sheet):
    for uid in range(5):
        upsert_profile(sheet, uid, problem="A")

    leads = new_leads(sheet, limit=2)
    assert len(leads) == 2
