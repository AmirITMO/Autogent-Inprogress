"""
SQLite-хранилище состояния:
- lead_manager_map — какой юзербот-аккаунт "закреплён" за каким лидом
  (чтобы селлер всегда общался как будто с одним и тем же человеком);
- conversations — полная история переписки (нужна агенту, чтобы отвечать
  в контексте диалога, а не одной репликой без памяти);
- queued_messages — ответы, которые сгенерированы вне рабочих часов
  и ждут начала следующего рабочего окна;
- outbound_counters — счётчик исходящих на аккаунт за день (лимит от бана).

Google-таблица (см. lead_outreach.py) остаётся источником списка лидов и
их "проблем" — сюда её дублировать не нужно, тут только служебное состояние.
"""

import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date, datetime

logger = logging.getLogger(__name__)

# Один процесс-агент = много Telethon-клиентов пула, все дёргают storage.py
# параллельно через loop.run_in_executor (разные потоки executor'а). SQLite
# в WAL-режиме умеет параллельные читатели, но конкурентная запись из
# нескольких соединений всё равно может словить "database is locked".
# _LOCK на уровне процесса сериализует ВСЕ обращения к БД из этого процесса
# (включая "прочитать-потом-записать" последовательности внутри одной
# функции — см. assign_account/enqueue_message_if_absent), чего достаточно,
# пока с базой работает один процесс; busy_timeout — подстраховка на случай
# внешнего инструмента (например ручной sqlite3 CLI), открывшего файл параллельно.
_LOCK = threading.RLock()


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


def init_db(db_path: str) -> None:
    with _connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS lead_manager_map (
                chat_id TEXT PRIMARY KEY,
                account_name TEXT NOT NULL,
                assigned_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                account_name TEXT NOT NULL,
                role TEXT NOT NULL,        -- 'lead' | 'manager'
                content TEXT NOT NULL,
                ts TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS queued_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                account_name TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                sent INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS outbound_counters (
                account_name TEXT NOT NULL,
                day TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (account_name, day)
            );
            """
        )


@contextmanager
def _cursor(db_path: str):
    with _LOCK:
        conn = _connect(db_path)
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()


# --- Закрепление лида за аккаунтом-"менеджером" -----------------------------

def get_assigned_account(db_path: str, chat_id: str) -> str | None:
    with _cursor(db_path) as cur:
        row = cur.execute(
            "SELECT account_name FROM lead_manager_map WHERE chat_id = ?", (chat_id,)
        ).fetchone()
        return row[0] if row else None


def assign_account(db_path: str, chat_id: str, account_names: list[str]) -> str:
    """
    Идемпотентно закрепляет лида за наименее загруженным аккаунтом
    (по числу уже закреплённых лидов) — простой round-robin по нагрузке.
    Если лид уже закреплён — возвращает существующее назначение.

    Проверка "уже закреплён?" и сама вставка выполняются в ОДНОМ cursor-блоке
    (под одним удержанием _LOCK), иначе при двух параллельных вызовах для
    одного и того же chat_id (два потока executor'а) оба видят "не закреплён"
    и оба пытаются вставить — вторая вставка падает с IntegrityError
    (chat_id — PRIMARY KEY). INSERT OR IGNORE + повторный SELECT делает
    операцию идемпотентной даже без общего лока.
    """
    with _cursor(db_path) as cur:
        row = cur.execute(
            "SELECT account_name FROM lead_manager_map WHERE chat_id = ?", (chat_id,)
        ).fetchone()
        if row:
            return row[0]

        counts = {name: 0 for name in account_names}
        for r in cur.execute(
            "SELECT account_name, COUNT(*) FROM lead_manager_map GROUP BY account_name"
        ).fetchall():
            if r[0] in counts:
                counts[r[0]] = r[1]

        chosen = min(account_names, key=lambda n: counts[n])
        cur.execute(
            "INSERT OR IGNORE INTO lead_manager_map (chat_id, account_name, assigned_at) VALUES (?, ?, ?)",
            (chat_id, chosen, datetime.now().isoformat()),
        )
        row2 = cur.execute(
            "SELECT account_name FROM lead_manager_map WHERE chat_id = ?", (chat_id,)
        ).fetchone()
        return row2[0] if row2 else chosen


def ensure_assignment(db_path: str, chat_id: str, account_name: str) -> None:
    """
    Для входящих сообщений: если лид пишет напрямую конкретному аккаунту,
    закрепление фиксируется за ЭТИМ аккаунтом (реальность Telegram уже
    определила, кто "менеджер" для этого лида) — без round-robin логики.
    """
    with _cursor(db_path) as cur:
        cur.execute(
            "INSERT OR IGNORE INTO lead_manager_map (chat_id, account_name, assigned_at) VALUES (?, ?, ?)",
            (chat_id, account_name, datetime.now().isoformat()),
        )


# --- История переписки -------------------------------------------------------

def save_message(db_path: str, chat_id: str, account_name: str, role: str, content: str) -> None:
    with _cursor(db_path) as cur:
        cur.execute(
            "INSERT INTO conversations (chat_id, account_name, role, content, ts) VALUES (?, ?, ?, ?, ?)",
            (chat_id, account_name, role, content, datetime.now().isoformat()),
        )


def get_history(db_path: str, chat_id: str, account_name: str, limit: int = 20) -> list[dict]:
    with _cursor(db_path) as cur:
        rows = cur.execute(
            """SELECT role, content FROM conversations
               WHERE chat_id = ? AND account_name = ?
               ORDER BY id DESC LIMIT ?""",
            (chat_id, account_name, limit),
        ).fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


# --- Очередь ответов вне рабочих часов --------------------------------------

def enqueue_message(db_path: str, chat_id: str, account_name: str, content: str) -> None:
    with _cursor(db_path) as cur:
        cur.execute(
            "INSERT INTO queued_messages (chat_id, account_name, content, created_at, sent) VALUES (?, ?, ?, ?, 0)",
            (chat_id, account_name, content, datetime.now().isoformat()),
        )


def has_pending_queue(db_path: str, chat_id: str, account_name: str) -> bool:
    """Есть ли уже неотправленное сообщение в очереди для этого лида (чтобы не дублировать)."""
    with _cursor(db_path) as cur:
        row = cur.execute(
            "SELECT 1 FROM queued_messages WHERE chat_id = ? AND account_name = ? AND sent = 0 LIMIT 1",
            (chat_id, account_name),
        ).fetchone()
        return row is not None


def enqueue_message_and_check_pending(db_path: str, chat_id: str, account_name: str, content: str) -> bool:
    """
    То же самое, что has_pending_queue() + enqueue_message(), но атомарно за
    одно удержание лока. Раздельные вызовы (сначала has_pending_queue, потом
    enqueue_message) дают гонку: если лид присылает два сообщения подряд вне
    рабочих часов, два обработчика NewMessage могут выполняться параллельно
    (asyncio не сериализует их сам по себе) — оба успевают увидеть
    "очередь пуста" ДО того, как любой из них вставит свою запись, и оба
    отправляют лиду уведомление "я на связи в рабочее время" — дубль,
    который выглядит как баг для селлера.

    Возвращает True, если на момент вставки уже была неотправленная запись
    для этого (chat_id, account_name) — тогда уведомление слать не нужно.
    """
    with _cursor(db_path) as cur:
        row = cur.execute(
            "SELECT 1 FROM queued_messages WHERE chat_id = ? AND account_name = ? AND sent = 0 LIMIT 1",
            (chat_id, account_name),
        ).fetchone()
        already_pending = row is not None
        cur.execute(
            "INSERT INTO queued_messages (chat_id, account_name, content, created_at, sent) VALUES (?, ?, ?, ?, 0)",
            (chat_id, account_name, content, datetime.now().isoformat()),
        )
        return already_pending


def pop_due_queue(db_path: str) -> list[dict]:
    """Возвращает все неотправленные сообщения и сразу помечает их отправленными."""
    with _cursor(db_path) as cur:
        rows = cur.execute(
            "SELECT id, chat_id, account_name, content FROM queued_messages WHERE sent = 0"
        ).fetchall()
        ids = [r[0] for r in rows]
        if ids:
            cur.executemany("UPDATE queued_messages SET sent = 1 WHERE id = ?", [(i,) for i in ids])
    return [{"id": r[0], "chat_id": r[1], "account_name": r[2], "content": r[3]} for r in rows]


# --- Дневной лимит исходящих на аккаунт (защита от флуд-бана) ---------------

def outbound_count_today(db_path: str, account_name: str) -> int:
    today = date.today().isoformat()
    with _cursor(db_path) as cur:
        row = cur.execute(
            "SELECT count FROM outbound_counters WHERE account_name = ? AND day = ?",
            (account_name, today),
        ).fetchone()
        return row[0] if row else 0


def increment_outbound(db_path: str, account_name: str) -> None:
    today = date.today().isoformat()
    with _cursor(db_path) as cur:
        cur.execute(
            """INSERT INTO outbound_counters (account_name, day, count) VALUES (?, ?, 1)
               ON CONFLICT(account_name, day) DO UPDATE SET count = count + 1""",
            (account_name, today),
        )
