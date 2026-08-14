"""
Локальная замена gspread-листа для тестирования без Google Sheets.

Реализует тот же минимальный интерфейс, что profile_store.py вызывает у
объекта "sheet" (get_all_values/row_values/append_row/update_cell), поэтому
profile_store.py и все агенты используют её без единой правки кода —
достаточно передать LocalSheet(...) вместо gspread.Worksheet.

Хранит данные в JSON-файле на диске (по умолчанию profiles_local.json),
формат — список строк (row 1 = HEADER), как get_all_values() у gspread.
"""

import json
import os
import threading


class LocalSheet:
    def __init__(self, path: str = "profiles_local.json", header: list[str] | None = None):
        self.path = path
        self._lock = threading.Lock()
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self._rows: list[list[str]] = json.load(f)
        else:
            self._rows = [list(header or [])]
            self._save()

    def get_all_values(self) -> list[list[str]]:
        return self._rows

    def row_values(self, row_idx: int) -> list[str]:
        return list(self._rows[row_idx - 1])

    def append_row(self, row: list) -> None:
        with self._lock:
            self._rows.append([str(v) for v in row])
            self._save()

    def update_cell(self, row_idx: int, col_idx: int, value) -> None:
        with self._lock:
            row = self._rows[row_idx - 1]
            while len(row) < col_idx:
                row.append("")
            row[col_idx - 1] = str(value)
            self._save()

    def _save(self) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._rows, f, ensure_ascii=False, indent=2)
