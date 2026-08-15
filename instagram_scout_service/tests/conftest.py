"""Общие fixtures для всего пакета тестов."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    """Тесты не должны писать в реальные файлы проекта (sessions/ и т.п.)."""
    monkeypatch.chdir(tmp_path)
    yield
