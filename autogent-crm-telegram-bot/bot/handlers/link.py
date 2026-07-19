from aiogram import Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import main_menu

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    token = command.args

    if token:
        try:
            result = await api.link(
                token,
                message.chat.id,
                message.from_user.username if message.from_user else None,
            )
        except ApiError:
            await message.answer(
                "Ссылка недействительна или уже истекла. Получите новую в Настройках на сайте."
            )
            return

        await message.answer(
            f"Готово, {result['name']}! Аккаунт привязан.\n\n"
            "Отвязать Telegram можно в любой момент командой /unlink."
        )
        await show_menu(message)
        return

    profile = await require_linked(message)
    if not profile:
        return
    await message.answer(f"С возвращением, {profile['name']}!")
    await show_menu(message, profile)


@router.message(Command("unlink"))
async def cmd_unlink(message: Message) -> None:
    profile = await require_linked(message)
    if not profile:
        return
    await api.unlink(message.chat.id)
    await message.answer("Telegram отвязан от аккаунта autogent-crm.")


@router.message(Command("menu"))
async def cmd_menu(message: Message) -> None:
    await show_menu(message)


async def show_menu(message: Message, profile: dict | None = None) -> None:
    if profile is None:
        profile = await require_linked(message)
        if not profile:
            return
    can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
    await message.answer("Главное меню:", reply_markup=main_menu(can_manage))
