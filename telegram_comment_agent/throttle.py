"""
Дневной лимит и минимальная пауза между публикациями — единственная защита
кода от того, чтобы одобренная сотрудником очередь не улетела в Telegram
пачкой. sqlite, не in-memory — переживает рестарт процесса в середине дня.
"""

import sqlite3
import time
from datetime import date

from config import Config


def init_db(sqlite_path: str) -> None:
    conn = sqlite3.connect(sqlite_path)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS comments_sent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_date TEXT NOT NULL,
            sent_at REAL NOT NULL
        )"""
    )
    conn.commit()
    conn.close()


def _today() -> str:
    return date.today().isoformat()


def comments_sent_today(sqlite_path: str) -> int:
    conn = sqlite3.connect(sqlite_path)
    row = conn.execute(
        "SELECT COUNT(*) FROM comments_sent WHERE sent_date = ?", (_today(),)
    ).fetchone()
    conn.close()
    return row[0] if row else 0


def seconds_since_last_comment(sqlite_path: str) -> float | None:
    conn = sqlite3.connect(sqlite_path)
    row = conn.execute("SELECT MAX(sent_at) FROM comments_sent").fetchone()
    conn.close()
    if not row or row[0] is None:
        return None
    return time.time() - row[0]


def record_comment_sent(sqlite_path: str) -> None:
    conn = sqlite3.connect(sqlite_path)
    conn.execute(
        "INSERT INTO comments_sent (sent_date, sent_at) VALUES (?, ?)", (_today(), time.time())
    )
    conn.commit()
    conn.close()


def can_send_now(cfg: Config) -> bool:
    if comments_sent_today(cfg.sqlite_path) >= cfg.max_comments_per_day:
        return False
    since_last = seconds_since_last_comment(cfg.sqlite_path)
    if since_last is not None and since_last < cfg.min_delay_between_comments_seconds:
        return False
    return True
