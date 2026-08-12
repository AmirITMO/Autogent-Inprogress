"""Тесты storage.py — SQLite-хранилище, на временном файле (не на sales_agent.db)."""

import sqlite3

import pytest

import storage


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    storage.init_db(path)
    return path


def test_init_db_creates_all_tables(db_path):
    conn = sqlite3.connect(db_path)
    tables = {
        row[0] for row in
        conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    conn.close()
    assert {"lead_manager_map", "conversations", "queued_messages", "outbound_counters"} <= tables


def test_init_db_is_idempotent(db_path):
    storage.init_db(db_path)  # повторный вызов не должен падать
    storage.save_message(db_path, "chat1", "acc1", "lead", "hello")
    assert storage.get_history(db_path, "chat1", "acc1") == [{"role": "lead", "content": "hello"}]


def test_get_assigned_account_none_when_missing(db_path):
    assert storage.get_assigned_account(db_path, "unknown-chat") is None


def test_assign_account_is_idempotent(db_path):
    first = storage.assign_account(db_path, "chat1", ["acc1", "acc2"])
    second = storage.assign_account(db_path, "chat1", ["acc1", "acc2"])
    assert first == second


def test_assign_account_load_balances_by_count(db_path):
    accounts = ["acc1", "acc2"]
    a1 = storage.assign_account(db_path, "chat1", accounts)
    a2 = storage.assign_account(db_path, "chat2", accounts)
    a3 = storage.assign_account(db_path, "chat3", accounts)

    assert a1 == "acc1"  # оба аккаунта с нагрузкой 0 -> берём первый по порядку
    assert a2 == "acc2"  # acc1 теперь занят -> следующий лид идёт на acc2
    assert a3 == "acc1"  # снова оба по 1 лиду -> тай-брейк на первый по порядку


def test_ensure_assignment_inserts_when_missing(db_path):
    storage.ensure_assignment(db_path, "chat1", "acc1")
    assert storage.get_assigned_account(db_path, "chat1") == "acc1"


def test_ensure_assignment_does_not_override_existing(db_path):
    storage.ensure_assignment(db_path, "chat1", "acc1")
    storage.ensure_assignment(db_path, "chat1", "acc2")
    assert storage.get_assigned_account(db_path, "chat1") == "acc1"


def test_save_message_and_get_history_preserves_order(db_path):
    storage.save_message(db_path, "chat1", "acc1", "lead", "Привет")
    storage.save_message(db_path, "chat1", "acc1", "manager", "Здравствуйте")
    storage.save_message(db_path, "chat1", "acc1", "lead", "Есть вопрос")

    history = storage.get_history(db_path, "chat1", "acc1")
    assert history == [
        {"role": "lead", "content": "Привет"},
        {"role": "manager", "content": "Здравствуйте"},
        {"role": "lead", "content": "Есть вопрос"},
    ]


def test_get_history_is_scoped_by_chat_and_account(db_path):
    storage.save_message(db_path, "chat1", "acc1", "lead", "msg for chat1/acc1")
    storage.save_message(db_path, "chat1", "acc2", "lead", "msg for chat1/acc2")
    storage.save_message(db_path, "chat2", "acc1", "lead", "msg for chat2/acc1")

    history = storage.get_history(db_path, "chat1", "acc1")
    assert history == [{"role": "lead", "content": "msg for chat1/acc1"}]


def test_get_history_respects_limit_and_stays_chronological(db_path):
    for i in range(5):
        storage.save_message(db_path, "chat1", "acc1", "lead", f"msg{i}")

    history = storage.get_history(db_path, "chat1", "acc1", limit=3)
    assert [h["content"] for h in history] == ["msg2", "msg3", "msg4"]


def test_enqueue_and_pop_due_queue(db_path):
    storage.enqueue_message(db_path, "chat1", "acc1", "first")
    storage.enqueue_message(db_path, "chat1", "acc1", "second")

    assert storage.has_pending_queue(db_path, "chat1", "acc1") is True

    popped = storage.pop_due_queue(db_path)
    contents = {m["content"] for m in popped}
    assert contents == {"first", "second"}

    assert storage.has_pending_queue(db_path, "chat1", "acc1") is False
    assert storage.pop_due_queue(db_path) == []  # уже помечены sent


def test_has_pending_queue_false_when_nothing_queued(db_path):
    assert storage.has_pending_queue(db_path, "chat1", "acc1") is False


def test_outbound_counters_start_at_zero(db_path):
    assert storage.outbound_count_today(db_path, "acc1") == 0


def test_increment_outbound_accumulates(db_path):
    storage.increment_outbound(db_path, "acc1")
    storage.increment_outbound(db_path, "acc1")
    storage.increment_outbound(db_path, "acc1")
    assert storage.outbound_count_today(db_path, "acc1") == 3


def test_increment_outbound_scoped_per_account(db_path):
    storage.increment_outbound(db_path, "acc1")
    storage.increment_outbound(db_path, "acc2")
    storage.increment_outbound(db_path, "acc2")
    assert storage.outbound_count_today(db_path, "acc1") == 1
    assert storage.outbound_count_today(db_path, "acc2") == 2


def test_snapshot_and_reset_counters_starts_at_zero(db_path):
    assert storage.snapshot_and_reset_counters(db_path, ["a", "b"]) == {"a": 0, "b": 0}


def test_increment_counter_accumulates(db_path):
    storage.increment_counter(db_path, "messages_scanned")
    storage.increment_counter(db_path, "messages_scanned")
    storage.increment_counter(db_path, "messages_scanned")
    assert storage.snapshot_and_reset_counters(db_path, ["messages_scanned"]) == {"messages_scanned": 3}


def test_increment_counter_scoped_per_name(db_path):
    storage.increment_counter(db_path, "messages_scanned")
    storage.increment_counter(db_path, "triggers_found")
    storage.increment_counter(db_path, "triggers_found")
    snapshot = storage.snapshot_and_reset_counters(db_path, ["messages_scanned", "triggers_found"])
    assert snapshot == {"messages_scanned": 1, "triggers_found": 2}


def test_snapshot_and_reset_counters_resets_to_zero(db_path):
    storage.increment_counter(db_path, "messages_scanned")
    first = storage.snapshot_and_reset_counters(db_path, ["messages_scanned"])
    second = storage.snapshot_and_reset_counters(db_path, ["messages_scanned"])
    assert first == {"messages_scanned": 1}
    assert second == {"messages_scanned": 0}


def test_snapshot_and_reset_counters_ignores_unrequested_names(db_path):
    storage.increment_counter(db_path, "messages_scanned")
    storage.increment_counter(db_path, "outbound_sent")
    snapshot = storage.snapshot_and_reset_counters(db_path, ["messages_scanned"])
    assert snapshot == {"messages_scanned": 1}
    # "outbound_sent" не запрашивали — он не должен быть сброшен предыдущим вызовом
    assert storage.snapshot_and_reset_counters(db_path, ["outbound_sent"]) == {"outbound_sent": 1}
