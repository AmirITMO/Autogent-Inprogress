"""
Тесты manager_pool.py. telethon.TelegramClient замокан — никаких реальных
подключений к Telegram.
"""

from types import SimpleNamespace

import pytest

import manager_pool
import storage
from config import AppConfig, ManagerAccount
from manager_pool import ManagerPool


class _FakeTelegramClient:
    """Достаточно, чтобы удовлетворить start_all()/stop_all()."""
    instances = []

    def __init__(self, session, api_id, api_hash, proxy=None):
        self.session = session
        self.api_id = api_id
        self.api_hash = api_hash
        self.proxy = proxy
        self.disconnected = False
        _FakeTelegramClient.instances.append(self)

    async def start(self):
        pass

    async def get_me(self):
        # id зависит от сессии, чтобы own_user_ids были разными по аккаунтам
        return SimpleNamespace(id=hash(self.session) % 100000)

    async def disconnect(self):
        self.disconnected = True


@pytest.fixture(autouse=True)
def _reset_fake_client_instances():
    _FakeTelegramClient.instances.clear()
    yield
    _FakeTelegramClient.instances.clear()


@pytest.fixture
def cfg(tmp_path):
    return AppConfig(
        managers=[
            ManagerAccount(name="acc1", session="sessions/acc1", api_id=1, api_hash="h1"),
            ManagerAccount(name="acc2", session="sessions/acc2", api_id=2, api_hash="h2"),
        ],
        sqlite_path=str(tmp_path / "pool.db"),
    )


@pytest.fixture
def pool(cfg):
    return ManagerPool(cfg)


def test_init_creates_sqlite_db(cfg):
    ManagerPool(cfg)
    import sqlite3
    conn = sqlite3.connect(cfg.sqlite_path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert "lead_manager_map" in tables


def test_account_names_matches_config_order(pool, cfg):
    assert pool.account_names() == ["acc1", "acc2"]


def test_persona_for_account(pool, cfg):
    assert pool.persona_for_account("acc1") == cfg.managers[0].persona


@pytest.mark.asyncio
async def test_start_all_populates_clients_and_own_ids(monkeypatch, pool):
    monkeypatch.setattr(manager_pool, "TelegramClient", _FakeTelegramClient)

    await pool.start_all()

    assert set(pool.clients.keys()) == {"acc1", "acc2"}
    assert len(pool.own_user_ids) == 2
    assert isinstance(pool.client_for_account("acc1"), _FakeTelegramClient)


@pytest.mark.asyncio
async def test_stop_all_disconnects_every_client(monkeypatch, pool):
    monkeypatch.setattr(manager_pool, "TelegramClient", _FakeTelegramClient)
    await pool.start_all()

    await pool.stop_all()

    assert all(c.disconnected for c in _FakeTelegramClient.instances)


def test_build_proxy_none_when_host_not_set(cfg):
    assert manager_pool._build_proxy(cfg) is None


def test_build_proxy_none_when_port_not_set(tmp_path):
    cfg = AppConfig(managers=[], sqlite_path=str(tmp_path / "p.db"), tg_proxy_host="1.2.3.4")
    assert manager_pool._build_proxy(cfg) is None


def test_build_proxy_returns_socks5_tuple(tmp_path):
    import socks
    cfg = AppConfig(
        managers=[], sqlite_path=str(tmp_path / "p.db"),
        tg_proxy_host="1.2.3.4", tg_proxy_port=1080,
        tg_proxy_username="u", tg_proxy_password="p",
    )
    assert manager_pool._build_proxy(cfg) == (socks.SOCKS5, "1.2.3.4", 1080, True, "u", "p")


@pytest.mark.asyncio
async def test_start_all_passes_proxy_to_telegram_client(monkeypatch, tmp_path):
    monkeypatch.setattr(manager_pool, "TelegramClient", _FakeTelegramClient)
    cfg = AppConfig(
        managers=[ManagerAccount(name="acc1", session="sessions/acc1", api_id=1, api_hash="h1")],
        sqlite_path=str(tmp_path / "pool.db"),
        tg_proxy_host="1.2.3.4", tg_proxy_port=1080,
    )
    pool = ManagerPool(cfg)

    await pool.start_all()

    import socks
    assert pool.client_for_account("acc1").proxy == (socks.SOCKS5, "1.2.3.4", 1080, True, None, None)


def test_assign_lead_is_stable_across_calls(pool):
    first = pool.assign_lead("chat1")
    second = pool.assign_lead("chat1")
    assert first == second
    assert first in pool.account_names()


def test_client_for_lead_returns_assigned_account_and_matching_client(monkeypatch, pool):
    monkeypatch.setattr(manager_pool, "TelegramClient", _FakeTelegramClient)
    pool.clients = {
        "acc1": _FakeTelegramClient("sessions/acc1", 1, "h1"),
        "acc2": _FakeTelegramClient("sessions/acc2", 2, "h2"),
    }

    account_name, client = pool.client_for_lead("chat1")
    assert account_name in ("acc1", "acc2")
    assert client is pool.clients[account_name]


def test_has_daily_capacity_true_when_under_limit(pool, cfg):
    assert pool.has_daily_capacity("acc1") is True


def test_has_daily_capacity_false_when_limit_reached(pool, cfg):
    for _ in range(cfg.max_outbound_per_account_per_day):
        storage.increment_outbound(cfg.sqlite_path, "acc1")
    assert pool.has_daily_capacity("acc1") is False


def test_account_with_capacity_returns_first_available(pool, cfg):
    for _ in range(cfg.max_outbound_per_account_per_day):
        storage.increment_outbound(cfg.sqlite_path, "acc1")
    assert pool.account_with_capacity() == "acc2"


def test_account_with_capacity_none_when_all_exhausted(pool, cfg):
    for name in pool.account_names():
        for _ in range(cfg.max_outbound_per_account_per_day):
            storage.increment_outbound(cfg.sqlite_path, name)
    assert pool.account_with_capacity() is None


# scout_only-аккаунт продолжает слушать группы (account_names()), но
# никогда не должен попадать в пул для исходящих — это единственная
# гарантия "скаут никогда не пишет сам" на уровне кода.
def test_outbound_account_names_excludes_scout_only(tmp_path):
    cfg = AppConfig(
        managers=[
            ManagerAccount(name="scout", session="sessions/scout", api_id=1, api_hash="h1", scout_only=True),
            ManagerAccount(name="outreach", session="sessions/outreach", api_id=2, api_hash="h2"),
        ],
        sqlite_path=str(tmp_path / "pool.db"),
    )
    pool = ManagerPool(cfg)

    assert pool.account_names() == ["scout", "outreach"]
    assert pool.outbound_account_names() == ["outreach"]


def test_assign_lead_never_picks_scout_only_account(tmp_path):
    cfg = AppConfig(
        managers=[
            ManagerAccount(name="scout", session="sessions/scout", api_id=1, api_hash="h1", scout_only=True),
            ManagerAccount(name="outreach", session="sessions/outreach", api_id=2, api_hash="h2"),
        ],
        sqlite_path=str(tmp_path / "pool.db"),
    )
    pool = ManagerPool(cfg)

    for _ in range(20):
        assert pool.assign_lead(f"chat-{_}") == "outreach"


def test_account_with_capacity_skips_scout_only_even_with_capacity(tmp_path):
    cfg = AppConfig(
        managers=[ManagerAccount(name="scout", session="sessions/scout", api_id=1, api_hash="h1", scout_only=True)],
        sqlite_path=str(tmp_path / "pool.db"),
    )
    pool = ManagerPool(cfg)

    assert pool.account_with_capacity() is None
