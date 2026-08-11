"""
Тесты scout_agent.py::_chat_matches_targets — самая важная функция,
именно тут был реальный баг сравнения "сырого" chat.id (Telethon) с
"маркированным" id (-100...) из конфига для супергрупп/каналов.

Используем настоящие telethon.tl.types (Channel/Chat), а не голые
Mock/SimpleNamespace, потому что utils.get_peer_id() полагается на
внутренние TL-атрибуты (SUBCLASS_OF_ID и т.п.), которых у "поддельных"
объектов нет.
"""

from telethon.tl.types import Channel, Chat

from scout_agent import _chat_matches_targets


def _make_channel(id_: int, username: str | None = None, megagroup: bool = True) -> Channel:
    return Channel(
        id=id_, title="Test Group", photo=None, date=None,
        megagroup=megagroup, username=username,
    )


def _make_chat(id_: int) -> Chat:
    return Chat(
        id=id_, title="Basic Group", photo=None, participants_count=2,
        date=None, version=0,
    )


def test_supergroup_raw_id_matches_marked_target():
    """
    chat.id для супергруппы у Telethon = сырой id (без -100), а в конфиге
    target_groups хранится маркированный вид "-100<id>". Без нормализации
    через utils.get_peer_id сравнение никогда бы не совпало — это и был баг.
    """
    chat = _make_channel(4294205798)
    assert _chat_matches_targets(chat, ["-1004294205798"]) is True


def test_supergroup_different_id_does_not_match():
    chat = _make_channel(4294205798)
    assert _chat_matches_targets(chat, ["-1009999999999"]) is False


def test_matches_by_username_without_at_in_target():
    chat = _make_channel(111, username="TestGroup")
    assert _chat_matches_targets(chat, ["testgroup"]) is True


def test_matches_by_username_with_at_in_target():
    chat = _make_channel(111, username="testgroup")
    assert _chat_matches_targets(chat, ["@testgroup"]) is True


def test_matches_by_username_case_insensitive_both_sides():
    chat = _make_channel(111, username="TeStGroup")
    assert _chat_matches_targets(chat, ["@TESTGROUP"]) is True


def test_username_mismatch_does_not_match():
    chat = _make_channel(111, username="othergroup")
    assert _chat_matches_targets(chat, ["testgroup"]) is False


def test_no_username_falls_back_to_id_only():
    chat = _make_channel(4294205798, username=None)
    assert _chat_matches_targets(chat, ["-1004294205798"]) is True
    assert _chat_matches_targets(chat, ["somegroup"]) is False


def test_basic_group_chat_id_matches_negated_id():
    """Для обычных (не супергрупп) chat.id маркируется просто знаком минус, без -100."""
    chat = _make_chat(555)
    assert _chat_matches_targets(chat, ["-555"]) is True


def test_empty_target_groups_never_matches():
    chat = _make_channel(4294205798, username="testgroup")
    assert _chat_matches_targets(chat, []) is False
