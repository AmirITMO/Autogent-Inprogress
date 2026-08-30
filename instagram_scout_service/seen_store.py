"""
Юзернеймы, уже обработанные при поиске по каналу — прочитаны и
проэнриченные один раз, повторный запуск того же/похожего поиска не должен
снова тратить платный enrichment-вызов Apify на уже известного кандидата.
Один плоский JSON-файл, ключ — channelId (не userId — сервис однопользовательский,
в отличие от референса, откуда перенесена сама идея дедупа между запусками).
"""

import json
import os


def _load_all(path: str) -> dict[str, list[str]]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def load_seen(path: str, channel_id: str) -> set[str]:
    data = _load_all(path)
    return set(data.get(channel_id, []))


def save_seen(path: str, channel_id: str, usernames: set[str]) -> None:
    if not usernames:
        return
    data = _load_all(path)
    existing = set(data.get(channel_id, []))
    existing.update(u.lower() for u in usernames)
    data[channel_id] = sorted(existing)

    dir_path = os.path.dirname(path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
