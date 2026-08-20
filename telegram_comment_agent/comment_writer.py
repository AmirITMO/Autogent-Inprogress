"""
LLM-часть агента автокомментинга:
1. extract_target_channels — из свободного описания в базе знаний канала
   (топик "В каких каналах комментировать", заполняется через чат
   «Управление») достаёт список @юзернеймов целевых каналов.
2. should_comment — решает, стоит ли пост поводом для комментария (не любой
   пост в целевом канале годится — часть КБ описывает, что пропускать).
3. draft_comment — пишет сам текст комментария.
"""

import json
import logging

from openai import AsyncOpenAI

from config import Config

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"


async def extract_target_channels(cfg: Config, kb_text: str) -> list[str]:
    if not kb_text.strip():
        return []
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    try:
        completion = await client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Ты достаёшь список Telegram-каналов из описания задачи агента автокомментинга.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Описание из базы знаний агента:\n---\n{kb_text}\n---\n\n"
                        'Верни JSON {"channels": [...]} — юзернеймы каналов без @, в которых нужно '
                        "комментировать посты. Если явных юзернеймов нет, а есть только тема/ниша — "
                        "верни пустой список, не выдумывай юзернеймы."
                    ),
                },
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        return [c.lstrip("@") for c in (data.get("channels") or [])]
    except Exception as e:
        logger.warning("Не удалось извлечь список целевых каналов: %s", e)
        return []


async def should_comment(cfg: Config, kb_text: str, post_text: str) -> bool:
    if not post_text.strip():
        return False
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    try:
        completion = await client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Ты решаешь, стоит ли конкретный пост в Telegram-канале поводом для комментария от имени бренда.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Критерии из базы знаний (что комментировать, чего избегать):\n---\n{kb_text}\n---\n\n"
                        f"Пост:\n---\n{post_text[:2000]}\n---\n\n"
                        'Верни JSON {"relevant": true|false}.'
                    ),
                },
            ],
        )
        data = json.loads(completion.choices[0].message.content or "{}")
        return bool(data.get("relevant"))
    except Exception as e:
        logger.warning("Не удалось оценить релевантность поста: %s", e)
        return False


SYSTEM_PROMPT = """Ты пишешь комментарий под постом в чужом Telegram-канале от имени бренда/продукта. \
Комментарий короткий (1-3 предложения), звучит как живая реплика человека, а не реклама: экспертное \
замечание, уточняющий вопрос или личный опыт по теме поста. НЕ используй рекламные штампы, ссылки, \
прямые призывы купить — это выглядит как спам и провоцирует бан/удаление. Упоминание продукта — только \
если оно органично вписывается в контекст поста, без нажима."""


async def draft_comment(cfg: Config, kb_text: str, post_text: str) -> str:
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    completion = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Контекст агента (продукт, тон, что писать):\n---\n{kb_text}\n---\n\nПост:\n---\n{post_text[:2000]}\n---",
            },
        ],
    )
    return completion.choices[0].message.content or ""
