from typing import Any, Optional, Union

from aiogram.types import CallbackQuery, Message

from .api_client import ApiError, api

Target = Union[Message, CallbackQuery]


async def require_linked(target: Target) -> Optional[dict[str, Any]]:
    """Возвращает whoami-профиль, либо шлёт подсказку и возвращает None,
    если этот chat_id ни к кому не привязан."""
    chat_id = target.message.chat.id if isinstance(target, CallbackQuery) else target.chat.id
    try:
        return await api.whoami(chat_id)
    except ApiError as err:
        text = (
            "Вы не привязаны к аккаунту autogent-crm.\n"
            "Откройте сайт → Настройки → профиль → «Подключить Telegram»."
            if err.code == "not_linked"
            else "Не удалось проверить привязку аккаунта, попробуйте позже."
        )
        if isinstance(target, CallbackQuery):
            await target.message.answer(text)
            await target.answer()
        else:
            await target.answer(text)
        return None


async def answer_or_edit(target: Target, text: str, reply_markup=None) -> None:
    if isinstance(target, CallbackQuery):
        await target.message.edit_text(text, reply_markup=reply_markup)
        await target.answer()
    else:
        await target.answer(text, reply_markup=reply_markup)
