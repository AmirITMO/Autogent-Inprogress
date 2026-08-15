"""
Чтение публичных данных Instagram-аккаунтов через aiograpi (см.
docs/pipeline/spikes/FINDINGS.md — официальный Graph API не даёт поиска по
чужим аккаунтам в принципе, только аутентифицированный приватный API даёт
нужную функциональность). Один настоящий аккаунт, без прокси-ферм, с паузой
между запросами — намеренно медленно и в рамках ToS-риска, который уже
обсуждён и принят в этом проекте, не инженерия обхода детекции.
"""

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

from aiograpi import Client
from aiograpi.exceptions import ClientError, LoginRequired

from config import Config

logger = logging.getLogger(__name__)

_client: Client | None = None


@dataclass
class AccountData:
    external_id: str
    username: str
    full_name: str | None
    bio: str | None
    category: str | None
    followers: int | None
    contact_info: str | None


async def _get_client(cfg: Config) -> Client:
    global _client
    if _client is not None:
        return _client

    client = Client()
    session_path = Path(cfg.ig_session_path)

    if session_path.exists():
        client.load_settings(session_path)
        try:
            await client.login(cfg.ig_username, cfg.ig_password)
        except LoginRequired:
            # Сессия протухла — логинимся заново с нуля, как будто её и не было.
            client = Client()
            await client.login(cfg.ig_username, cfg.ig_password)
    else:
        await client.login(cfg.ig_username, cfg.ig_password)

    session_path.parent.mkdir(parents=True, exist_ok=True)
    client.dump_settings(session_path)

    _client = client
    return client


async def search_accounts(cfg: Config, criteria: dict, limit: int) -> list[AccountData]:
    """criteria — произвольная структура из диалога настройки поиска (см.
    lib/actions/instagramSearch.ts): ожидаем как минимум criteria["keywords"]
    (список хэштегов/ключевых слов) — по ним ищем через hashtag-поиск."""
    client = await _get_client(cfg)
    keywords: list[str] = criteria.get("keywords") or []
    if not keywords:
        logger.warning("В профиле поиска нет keywords — искать нечем")
        return []

    seen: set[str] = set()
    results: list[AccountData] = []

    for keyword in keywords:
        if len(results) >= limit:
            break
        try:
            medias = await client.hashtag_medias_recent(keyword.lstrip("#"), amount=limit)
        except ClientError as e:
            logger.warning("Поиск по '%s' не удался: %s", keyword, e)
            continue

        for media in medias:
            if len(results) >= limit:
                break
            username = media.user.username
            if username in seen:
                continue
            seen.add(username)

            await asyncio.sleep(cfg.request_pause_seconds)
            try:
                info = await client.user_info_by_username(username)
            except ClientError as e:
                logger.warning("Не удалось получить профиль '%s': %s", username, e)
                continue

            results.append(
                AccountData(
                    external_id=str(info.pk),
                    username=info.username,
                    full_name=info.full_name or None,
                    bio=info.biography or None,
                    category=info.category or None,
                    followers=info.follower_count,
                    contact_info=info.public_email or info.public_phone_number or None,
                )
            )

    return results
