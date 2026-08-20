"""throttle.py — реальный sqlite во временном файле, без сети/моков."""

import throttle
from config import Config


def _cfg(tmp_path, **overrides) -> Config:
    defaults = dict(
        crm_api_url="https://crm.example.com",
        crm_api_key="test-key",
        crm_channel_id="chan1",
        openai_api_key="sk-test",
        tg_api_id=1,
        tg_api_hash="hash",
        sqlite_path=str(tmp_path / "throttle.db"),
        max_comments_per_day=2,
        min_delay_between_comments_seconds=100,
    )
    defaults.update(overrides)
    return Config(**defaults)


def test_can_send_now_true_when_empty(tmp_path):
    cfg = _cfg(tmp_path)
    throttle.init_db(cfg.sqlite_path)
    assert throttle.can_send_now(cfg) is True


def test_can_send_now_false_after_daily_limit_reached(tmp_path):
    cfg = _cfg(tmp_path, min_delay_between_comments_seconds=0)
    throttle.init_db(cfg.sqlite_path)
    throttle.record_comment_sent(cfg.sqlite_path)
    throttle.record_comment_sent(cfg.sqlite_path)
    assert throttle.comments_sent_today(cfg.sqlite_path) == 2
    assert throttle.can_send_now(cfg) is False


def test_can_send_now_false_within_min_delay(tmp_path):
    cfg = _cfg(tmp_path, max_comments_per_day=100)
    throttle.init_db(cfg.sqlite_path)
    throttle.record_comment_sent(cfg.sqlite_path)
    assert throttle.can_send_now(cfg) is False


def test_can_send_now_true_after_min_delay_elapsed(tmp_path):
    cfg = _cfg(tmp_path, max_comments_per_day=100, min_delay_between_comments_seconds=0)
    throttle.init_db(cfg.sqlite_path)
    throttle.record_comment_sent(cfg.sqlite_path)
    assert throttle.can_send_now(cfg) is True


def test_seconds_since_last_comment_none_when_never_sent(tmp_path):
    cfg = _cfg(tmp_path)
    throttle.init_db(cfg.sqlite_path)
    assert throttle.seconds_since_last_comment(cfg.sqlite_path) is None
