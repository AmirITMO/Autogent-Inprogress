"""Общие fixtures для всего пакета тестов."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    """
    Ни один тест не должен писать в реальные файлы проекта
    (sales_agent.db, kb_index.json, profiles_local.json и т.д.) —
    по умолчанию тесты работают в изолированном tmp_path.
    Тесты, которым нужен конкретный путь, передают его явно.
    """
    monkeypatch.chdir(tmp_path)
    yield
