"""seen_store.py — файловый I/O в tmp_path, без моков."""

import seen_store


def test_load_seen_returns_empty_set_for_missing_file(tmp_path):
    path = str(tmp_path / "seen.json")
    assert seen_store.load_seen(path, "chan1") == set()


def test_save_then_load_roundtrips_and_lowercases(tmp_path):
    path = str(tmp_path / "seen.json")
    seen_store.save_seen(path, "chan1", {"Furniture_Spb", "another_acc"})
    assert seen_store.load_seen(path, "chan1") == {"furniture_spb", "another_acc"}


def test_save_seen_merges_with_existing_entries(tmp_path):
    path = str(tmp_path / "seen.json")
    seen_store.save_seen(path, "chan1", {"acc1"})
    seen_store.save_seen(path, "chan1", {"acc2"})
    assert seen_store.load_seen(path, "chan1") == {"acc1", "acc2"}


def test_save_seen_keeps_other_channels_untouched(tmp_path):
    path = str(tmp_path / "seen.json")
    seen_store.save_seen(path, "chan1", {"acc1"})
    seen_store.save_seen(path, "chan2", {"acc2"})
    assert seen_store.load_seen(path, "chan1") == {"acc1"}
    assert seen_store.load_seen(path, "chan2") == {"acc2"}


def test_save_seen_with_empty_set_does_not_create_file(tmp_path):
    path = str(tmp_path / "seen.json")
    seen_store.save_seen(path, "chan1", set())
    assert seen_store.load_seen(path, "chan1") == set()


def test_load_seen_returns_empty_on_corrupt_json(tmp_path):
    path = tmp_path / "seen.json"
    path.write_text("not valid json{{", encoding="utf-8")
    assert seen_store.load_seen(str(path), "chan1") == set()
