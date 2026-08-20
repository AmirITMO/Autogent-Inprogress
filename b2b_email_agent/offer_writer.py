"""Черновик первого письма компании — контекст из базы знаний канала
(продукт, тон, оффер — см. lib/actions/agentKnowledgeBase.ts) и данных,
извлечённых с сайта компании. Генерит сам сервис; отправку делает сотрудник
вручную из CRM после одобрения (см. lib/actions/b2bEmailSend.ts)."""

import logging

from openai import AsyncOpenAI

from config import Config
from scraper import ExtractedCompany

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты помогаешь менеджеру по продажам написать первое холодное письмо компании. \
Пиши коротко (3-5 предложений), по-деловому, без канцелярита и без спам-триггеров \
("уникальное предложение", "только сегодня", капс, лишние восклицательные знаки — такие фразы \
бьют по спам-фильтрам). Опирайся на причину, по которой компания подходит, покажи, что письмо \
не шаблонное. Заверши конкретным призывом к действию. Не выдумывай факты о компании сверх данных."""


async def draft_email(cfg: Config, kb_text: str, company: ExtractedCompany) -> str:
    client = AsyncOpenAI(api_key=cfg.openai_api_key)
    user_prompt = (
        f"Контекст агента (продукт, оффер, тон):\n---\n{kb_text}\n---\n\n"
        f"Компания: {company.company_name}\n"
        f"Почему подходит: {company.reasoning}"
    )
    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    return completion.choices[0].message.content or ""
