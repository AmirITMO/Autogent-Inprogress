"""Тесты local_sheet.py — JSON-файловая замена gspread Worksheet."""

import json

from local_sheet import LocalSheet


def test_creates_new_file_with_header(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b", "c"])
    assert path.exists()
    assert sheet.get_all_values() == [["a", "b", "c"]]
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert on_disk == [["a", "b", "c"]]


def test_persistence_across_instances(tmp_path):
    path = tmp_path / "sheet.json"
    sheet1 = LocalSheet(str(path), header=["h1", "h2"])
    sheet1.append_row(["x", "y"])

    sheet2 = LocalSheet(str(path))
    assert sheet2.get_all_values() == [["h1", "h2"], ["x", "y"]]


def test_append_row_adds_row(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    sheet.append_row(["1", "2"])
    sheet.append_row(["3", "4"])
    assert sheet.get_all_values() == [["a", "b"], ["1", "2"], ["3", "4"]]


def test_append_row_stringifies_values(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    sheet.append_row([1, None])
    assert sheet.get_all_values()[1] == ["1", "None"]


def test_row_values_returns_1_indexed_row(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    sheet.append_row(["1", "2"])
    assert sheet.row_values(1) == ["a", "b"]
    assert sheet.row_values(2) == ["1", "2"]


def test_row_values_returns_copy_not_reference(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    row = sheet.row_values(1)
    row.append("mutated")
    assert sheet.get_all_values()[0] == ["a", "b"]


def test_update_cell_extends_short_row(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b", "c"])
    sheet.append_row(["only-one"])
    sheet.update_cell(2, 3, "value")
    assert sheet.row_values(2) == ["only-one", "", "value"]


def test_update_cell_overwrites_existing_value(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    sheet.append_row(["1", "2"])
    sheet.update_cell(2, 1, "changed")
    assert sheet.row_values(2) == ["changed", "2"]


def test_update_cell_persists_to_disk(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path), header=["a", "b"])
    sheet.append_row(["1", "2"])
    sheet.update_cell(2, 2, "new-value")

    reloaded = LocalSheet(str(path))
    assert reloaded.row_values(2) == ["1", "new-value"]


def test_no_header_defaults_to_empty_row(tmp_path):
    path = tmp_path / "sheet.json"
    sheet = LocalSheet(str(path))
    assert sheet.get_all_values() == [[]]
