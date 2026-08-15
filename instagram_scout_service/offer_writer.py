"""Черновик оффера на найденный аккаунт — один вызов LLM, контекст из
профиля поиска (criteria) и данных аккаунта. Генерит сам сервис, не CRM
(решение зафиксировано в docs/pipeline/brief.md) — сотрудник потом
отправляет черновик вручную из CRM."""

import logging

from openai import AsyncOpenAI

from config import Config
from scraper import AccountData

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты помогаешь менеджеру по продажам написать первое сообщение \
владельцу Instagram-аккаунта с деловым предложением. Пиши коротко (2-4 предложения), \
по-человечески, без канцелярита и без эмодзи-спама. Опирайся на критерии поиска \
и данные аккаунта — покажи, что сообщение не шаблонное. Не выдумывай факты об \
аккаунте, которых нет в описании."""


async def draft_offer(cfg: Config, criteria: dict, account: AccountData) -> str:
    client = AsyncOpenAI(api_key=cfg.openai_api_key)

    user_prompt = (
        f"Критерии поиска: {criteria}\n\n"
        f"Аккаунт: @{account.username}"
        f"{f' ({account.full_name})' if account.full_name else ''}\n"
        f"Bio: {account.bio or '—'}\n"
        f"Категория: {account.category or '—'}\n"
        f"Подписчики: {account.followers if account.followers is not None else '—'}"
    )

    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    return completion.choices[0].message.content or ""
