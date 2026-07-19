from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import employee_card_keyboard, employees_keyboard
from ..render import report_text

router = Router()

PAGE_SIZE = 8


async def _render_employees(cb: CallbackQuery, state: FSMContext) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    if profile["role"] != "ADMIN" and not profile["permissions"]["editTasksOthers"]:
        await cb.answer("Недостаточно прав", show_alert=True)
        return

    try:
        result = await api.list_employees(cb.message.chat.id)
    except ApiError:
        await cb.answer("Не удалось загрузить список сотрудников", show_alert=True)
        return

    data = await state.get_data()
    page = data.get("emp_page", 1)
    employees = result["employees"]
    total_pages = max(1, (len(employees) + PAGE_SIZE - 1) // PAGE_SIZE)
    page = min(page, total_pages)
    chunk = employees[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]

    await state.update_data(emp_page=page)
    await cb.message.edit_text("Сотрудники:", reply_markup=employees_keyboard(chunk, page, total_pages))
    await cb.answer()


@router.callback_query(F.data == "menu:employees")
async def open_employees(cb: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(emp_page=1)
    await _render_employees(cb, state)


@router.callback_query(F.data == "emp:page:prev")
async def employees_prev(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(emp_page=max(1, data.get("emp_page", 1) - 1))
    await _render_employees(cb, state)


@router.callback_query(F.data == "emp:page:next")
async def employees_next(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(emp_page=data.get("emp_page", 1) + 1)
    await _render_employees(cb, state)


@router.callback_query(F.data.startswith("emp:open:"))
async def open_employee_card(cb: CallbackQuery) -> None:
    employee_id = cb.data.split(":", 2)[2]
    profile = await require_linked(cb)
    if not profile:
        return
    if profile["role"] != "ADMIN" and not profile["permissions"]["editTasksOthers"]:
        await cb.answer("Недостаточно прав", show_alert=True)
        return

    try:
        result = await api.employee_report(cb.message.chat.id, employee_id)
    except ApiError:
        await cb.answer("Сотрудник не найден", show_alert=True)
        return

    await cb.message.edit_text(
        report_text(result["employee"], result["report"]),
        reply_markup=employee_card_keyboard(employee_id),
    )
    await cb.answer()
