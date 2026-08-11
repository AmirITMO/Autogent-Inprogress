"""
Хранилище профилей селлеров в Google Sheet — общая "база знаний" между
агентом-скаутом (пишет/обновляет) и агентом-менеджером (читает, чтобы
персонализировать первое сообщение и дальнейшие ответы).

Один пул Telegram-аккаунтов совмещает обе роли: сидит в группах и
собирает профили (scout_agent.py), и он же потом пишет продавцам в
личку (outreach_broadcast.py / reactive_handler.py).

Колонки листа "Profiles" (1-based):
1  user_id           — telegram numeric id, ключ
2  username          — @handle (может отсутствовать)
3  display_name      — имя из Telegram
4  first_seen        — когда профиль создан
5  last_updated       — когда последний раз обновлялся
6  source_group      — где увидели пользователя впервые
7  problem           — текущая проблема/запрос (кратко, накопительно)
8  niche_info        — доп. полезная инфа: ниша, площадка, объёмы и т.п.
9  budget_time       — бюджет/сроки, если всплывали
10 raw_last_message  — последнее релевантное сообщение (для аудита)
11 status            — new | contacted | in_dialogue
12 assigned_account  — какой аккаунт-менеджер закреплён
"""

import threading
from datetime import datetime

COL_USER_ID = 1
COL_USERNAME = 2
COL_DISPLAY_NAME = 3
COL_FIRST_SEEN = 4
COL_LAST_UPDATED = 5
COL_SOURCE_GROUP = 6
COL_PROBLEM = 7
COL_NICHE_INFO = 8
COL_BUDGET_TIME = 9
COL_RAW_LAST_MESSAGE = 10
COL_STATUS = 11
COL_ASSIGNED_ACCOUNT = 12

HEADER = [
    "user_id", "username", "display_name", "first_seen", "last_updated",
    "source_group", "problem", "niche_info", "budget_time",
    "raw_last_message", "status", "assigned_account",
]

STATUS_NEW = "new"
STATUS_CONTACTED = "contacted"
STATUS_IN_DIALOGUE = "in_dialogue"

_lock = threading.Lock()
_row_cache: dict[str, int] = {}   # user_id (str) -> номер строки в листе
_cache_loaded_for = None          # id листа, для которого кэш валиден


def _ensure_cache(sheet):
    """Ленивая загрузка кэша user_id -> row_index, чтобы не делать поиск по всей таблице каждый раз."""
    global _cache_loaded_for
    with _lock:
        if _cache_loaded_for == id(sheet):
            return
        values = sheet.get_all_values()
        _row_cache.clear()
        for idx, row in enumerate(values[1:], start=2):
            if row and row[COL_USER_ID - 1]:
                _row_cache[row[COL_USER_ID - 1]] = idx
        _cache_loaded_for = id(sheet)


def get_profile(sheet, user_id) -> dict | None:
    _ensure_cache(sheet)
    uid = str(user_id)
    row_idx = _row_cache.get(uid)
    if row_idx is None:
        return None
    values = sheet.row_values(row_idx)
    values = values + [""] * (COL_ASSIGNED_ACCOUNT - len(values))
    return {
        "row_idx": row_idx,
        "user_id": values[COL_USER_ID - 1],
        "username": values[COL_USERNAME - 1],
        "display_name": values[COL_DISPLAY_NAME - 1],
        "first_seen": values[COL_FIRST_SEEN - 1],
        "last_updated": values[COL_LAST_UPDATED - 1],
        "source_group": values[COL_SOURCE_GROUP - 1],
        "problem": values[COL_PROBLEM - 1],
        "niche_info": values[COL_NICHE_INFO - 1],
        "budget_time": values[COL_BUDGET_TIME - 1],
        "raw_last_message": values[COL_RAW_LAST_MESSAGE - 1],
        "status": values[COL_STATUS - 1],
        "assigned_account": values[COL_ASSIGNED_ACCOUNT - 1],
    }


def upsert_profile(sheet, user_id, username: str = "", display_name: str = "",
                    source_group: str = "", problem: str = None, niche_info: str = None,
                    budget_time: str = None, raw_last_message: str = None) -> dict:
    """
    Создаёт профиль, если пользователя ещё нет, иначе обновляет только
    переданные (не-None) поля — остальное остаётся как было (накопительно).
    """
    _ensure_cache(sheet)
    uid = str(user_id)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    existing = get_profile(sheet, uid)

    if existing is None:
        row = [""] * len(HEADER)
        row[COL_USER_ID - 1] = uid
        row[COL_USERNAME - 1] = username
        row[COL_DISPLAY_NAME - 1] = display_name
        row[COL_FIRST_SEEN - 1] = now_str
        row[COL_LAST_UPDATED - 1] = now_str
        row[COL_SOURCE_GROUP - 1] = source_group
        row[COL_PROBLEM - 1] = problem or ""
        row[COL_NICHE_INFO - 1] = niche_info or ""
        row[COL_BUDGET_TIME - 1] = budget_time or ""
        row[COL_RAW_LAST_MESSAGE - 1] = raw_last_message or ""
        row[COL_STATUS - 1] = STATUS_NEW
        row[COL_ASSIGNED_ACCOUNT - 1] = ""

        with _lock:
            sheet.append_row(row)
            new_row_idx = len(sheet.get_all_values())
            _row_cache[uid] = new_row_idx
        row_idx = new_row_idx
    else:
        row_idx = existing["row_idx"]
        updates = {COL_LAST_UPDATED: now_str}
        if username:
            updates[COL_USERNAME] = username
        if display_name:
            updates[COL_DISPLAY_NAME] = display_name
        if problem is not None:
            updates[COL_PROBLEM] = problem
        if niche_info is not None:
            updates[COL_NICHE_INFO] = niche_info
        if budget_time is not None:
            updates[COL_BUDGET_TIME] = budget_time
        if raw_last_message is not None:
            updates[COL_RAW_LAST_MESSAGE] = raw_last_message

        with _lock:
            for col, value in updates.items():
                sheet.update_cell(row_idx, col, value)

    return get_profile(sheet, uid)


def set_status(sheet, user_id, status: str, assigned_account: str = None):
    _ensure_cache(sheet)
    uid = str(user_id)
    row_idx = _row_cache.get(uid)
    if row_idx is None:
        return
    with _lock:
        sheet.update_cell(row_idx, COL_STATUS, status)
        if assigned_account:
            sheet.update_cell(row_idx, COL_ASSIGNED_ACCOUNT, assigned_account)


def new_leads(sheet, limit: int = 100) -> list[dict]:
    """Профили со статусом 'new' — кандидаты для проактивной рассылки."""
    _ensure_cache(sheet)
    result = []
    for uid, row_idx in list(_row_cache.items()):
        profile = get_profile(sheet, uid)
        if profile and profile["status"] == STATUS_NEW:
            result.append(profile)
        if len(result) >= limit:
            break
    return result
