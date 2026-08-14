"""
Тесты agent.py. openai.OpenAI и knowledge_base.retrieve замоканы —
никаких реальных сетевых вызовов.
"""

import json
from types import SimpleNamespace

import pytest

import agent
import knowledge_base
from config import AppConfig


class _FakeCompletions:
    def __init__(self, content: str):
        self._content = content
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content=self._content)
        choice = SimpleNamespace(message=message)
        return SimpleNamespace(choices=[choice])


class _FakeChat:
    def __init__(self, content: str):
        self.completions = _FakeCompletions(content)


def _install_fake_openai(monkeypatch, content: str = "ok") -> SimpleNamespace:
    fake_instance = SimpleNamespace(chat=_FakeChat(content))

    def fake_openai_ctor(*args, **kwargs):
        return fake_instance

    monkeypatch.setattr(agent, "OpenAI", fake_openai_ctor)
    return fake_instance


@pytest.fixture
def cfg():
    return AppConfig(openai_key="test-key")


def test_build_system_prompt_contains_persona_and_kb_rule(cfg):
    prompt = agent.build_system_prompt("Ты — Анна.", cfg)
    assert "Ты — Анна." in prompt
    assert cfg.kb_uncertainty_rule in prompt


def test_profile_context_block_none_returns_empty():
    assert agent._profile_context_block(None) == ""


def test_profile_context_block_empty_dict_returns_empty():
    assert agent._profile_context_block({}) == ""


def test_profile_context_block_with_fields():
    block = agent._profile_context_block({
        "problem": "Не работает интеграция",
        "niche_info": "Продаёт одежду на Wildberries",
        "budget_time": "50000 руб, срочно",
    })
    assert "Не работает интеграция" in block
    assert "Продаёт одежду на Wildberries" in block
    assert "50000 руб, срочно" in block


def test_profile_context_block_partial_fields_only_present_ones():
    block = agent._profile_context_block({"problem": "X"})
    assert "Проблема/запрос: X" in block
    assert "О бизнесе/нише" not in block
    assert "Бюджет/сроки" not in block


def test_kb_context_block_empty_query_returns_empty(cfg):
    assert agent._kb_context_block("", cfg) == ""


def test_kb_context_block_calls_knowledge_base_retrieve(monkeypatch, cfg):
    captured = {}

    def fake_retrieve(query, kb_dir, cache_path, openai_key, top_k=4, base_url=None):
        captured["query"] = query
        return "SOME KB TEXT"

    monkeypatch.setattr(knowledge_base, "retrieve", fake_retrieve)
    result = agent._kb_context_block("проблема с оплатой", cfg)
    assert result == "SOME KB TEXT"
    assert captured["query"] == "проблема с оплатой"


def test_kb_context_block_swallows_exceptions(monkeypatch, cfg):
    def fake_retrieve(*args, **kwargs):
        raise RuntimeError("embeddings API down")

    monkeypatch.setattr(knowledge_base, "retrieve", fake_retrieve)
    assert agent._kb_context_block("что угодно", cfg) == ""


def test_generate_reply_translates_history_roles(monkeypatch, cfg):
    fake = _install_fake_openai(monkeypatch, content="Ответ менеджера")
    monkeypatch.setattr(knowledge_base, "retrieve", lambda *a, **k: "")

    history = [
        {"role": "lead", "content": "Привет, у меня проблема"},
        {"role": "manager", "content": "Расскажите подробнее"},
    ]
    result = agent.generate_reply("Ты — Анна.", history, "Вот подробности", cfg)

    assert result == "Ответ менеджера"
    call = fake.chat.completions.calls[0]
    messages = call["messages"]
    assert messages[0]["role"] == "system"
    assert messages[1] == {"role": "user", "content": "Привет, у меня проблема"}
    assert messages[2] == {"role": "assistant", "content": "Расскажите подробнее"}
    assert messages[3] == {"role": "user", "content": "Вот подробности"}


def test_generate_reply_includes_profile_and_kb_context(monkeypatch, cfg):
    fake = _install_fake_openai(monkeypatch, content="ok")
    monkeypatch.setattr(knowledge_base, "retrieve", lambda *a, **k: "KB BLOCK")

    agent.generate_reply(
        "Ты — Анна.", [], "вопрос", cfg,
        profile={"problem": "Проблема из профиля"},
    )
    system_msg = fake.chat.completions.calls[0]["messages"][0]["content"]
    assert "Проблема из профиля" in system_msg
    assert "KB BLOCK" in system_msg


def test_generate_opening_message_returns_stripped_content(monkeypatch, cfg):
    _install_fake_openai(monkeypatch, content="  Привет, видел ваше сообщение.  ")
    monkeypatch.setattr(knowledge_base, "retrieve", lambda *a, **k: "")

    result = agent.generate_opening_message(
        "Ты — Анна.", {"problem": "Не могу настроить рекламу"}, cfg,
    )
    assert result == "Привет, видел ваше сообщение."


def test_analyze_group_message_valid_json(monkeypatch, cfg):
    payload = {
        "is_relevant": True,
        "problem": "Проблема с логистикой",
        "niche_info": None,
        "budget_time": "30000",
    }
    _install_fake_openai(monkeypatch, content=json.dumps(payload))

    result = agent.analyze_group_message("текст сообщения из группы", None, cfg)
    assert result == {
        "is_relevant": True,
        "problem": "Проблема с логистикой",
        "niche_info": None,
        "budget_time": "30000",
    }


def test_analyze_group_message_invalid_json_falls_back_to_not_relevant(monkeypatch, cfg):
    _install_fake_openai(monkeypatch, content="это не json вообще")

    result = agent.analyze_group_message("сообщение", None, cfg)
    assert result == {
        "is_relevant": False,
        "problem": None,
        "niche_info": None,
        "budget_time": None,
    }
