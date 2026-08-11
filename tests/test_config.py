"""Тесты config.py — AppConfig читает env, дефолты разумны."""

import importlib

import config as config_module
from config import AppConfig, WorkingHours


def test_defaults_are_sane():
    cfg = AppConfig()
    assert cfg.target_groups == ["-1004294205798"]
    assert cfg.scout_min_message_length == 15
    assert cfg.kb_top_k == 4
    assert cfg.sqlite_path == "sales_agent.db"
    assert cfg.max_outbound_per_account_per_day == 40
    assert cfg.delay_between_outbound_seconds == 6.0
    assert cfg.profiles_sheet_name == "Profiles"
    assert isinstance(cfg.working_hours, WorkingHours)


def test_working_hours_defaults():
    wh = WorkingHours()
    assert wh.timezone == "Europe/Moscow"
    assert wh.start_hour == 9
    assert wh.end_hour == 20
    assert wh.workdays == (0, 1, 2, 3, 4)


def test_kb_uncertainty_rule_mentions_key_topics():
    cfg = AppConfig()
    for keyword in ["партнёрск", "настройки ИИ", "лимит кабинетов", "демо"]:
        assert keyword in cfg.kb_uncertainty_rule


def test_openai_key_from_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-123")
    assert AppConfig().openai_key == "sk-test-123"


def test_openai_key_default_empty(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert AppConfig().openai_key == ""


def test_openai_base_url_from_env(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    assert AppConfig().openai_base_url == "https://openrouter.ai/api/v1"


def test_openai_base_url_none_when_unset(monkeypatch):
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    assert AppConfig().openai_base_url is None


def test_openai_base_url_none_when_empty_string(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    assert AppConfig().openai_base_url is None


def test_chat_model_from_env(monkeypatch):
    monkeypatch.setenv("CHAT_MODEL", "openai/gpt-4o-mini")
    assert AppConfig().chat_model == "openai/gpt-4o-mini"


def test_chat_model_default(monkeypatch):
    monkeypatch.delenv("CHAT_MODEL", raising=False)
    assert AppConfig().chat_model == "gpt-4o-mini"


def test_managers_parsed_from_env(monkeypatch):
    monkeypatch.setenv("TG_API_ID_1", "123456")
    monkeypatch.setenv("TG_API_HASH_1", "deadbeefcafe")
    cfg = AppConfig()
    assert len(cfg.managers) == 1
    manager = cfg.managers[0]
    assert manager.name == "Амир"
    assert manager.api_id == 123456
    assert manager.api_hash == "deadbeefcafe"
    assert manager.session == "sessions/амир"


def test_managers_default_when_env_missing(monkeypatch):
    monkeypatch.delenv("TG_API_ID_1", raising=False)
    monkeypatch.delenv("TG_API_HASH_1", raising=False)
    cfg = AppConfig()
    assert cfg.managers[0].api_id == 0
    assert cfg.managers[0].api_hash == ""


def test_each_appconfig_instance_gets_independent_lists():
    """default_factory должен создавать новый список/объект на каждый экземпляр (без общего мутабельного дефолта)."""
    cfg1 = AppConfig()
    cfg2 = AppConfig()
    assert cfg1.target_groups is not cfg2.target_groups
    assert cfg1.managers is not cfg2.managers
    assert cfg1.working_hours is not cfg2.working_hours
