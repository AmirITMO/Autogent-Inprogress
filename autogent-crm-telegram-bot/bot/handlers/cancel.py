from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from ..common import require_linked
from ..keyboards import main_menu

router = Router()


# Единая точка отмены для любого шага любого FSM-сценария (задача/созвон/сделка) —
# кнопка "✖️ Отмена" везде ведёт сюда, независимо от текущего состояния.
@router.callback_query(F.data == "cancel")
async def cancel_any_flow(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    profile = await require_linked(cb)
    if not profile:
        return
    can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
    await cb.message.edit_text("Отменено.", reply_markup=main_menu(can_manage))
    await cb.answer()
