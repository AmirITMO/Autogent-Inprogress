from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import main_menu, status_picker_keyboard, task_detail_keyboard, task_list_keyboard
from ..render import task_detail_text, task_list_title

router = Router()


async def _render_list(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    scope = data.get("scope", "self")
    status = data.get("status", "open")
    page = data.get("page", 1)

    profile = await require_linked(cb)
    if not profile:
        return

    assignee_id = None if scope == "self" else scope
    try:
        result = await api.list_tasks(cb.message.chat.id, status, page, assignee_id)
    except ApiError:
        await cb.answer("Не удалось загрузить задачи", show_alert=True)
        return

    await state.update_data(tasks=result["tasks"])
    scope_label = data.get("scope_label")
    title = task_list_title(status, scope_label)
    if not result["tasks"]:
        title += "\n\nПусто."
    await cb.message.edit_text(
        title, reply_markup=task_list_keyboard(result["tasks"], result["page"], result["totalPages"])
    )
    await cb.answer()


@router.callback_query(F.data.in_({"menu:mine", "menu:done"}))
async def open_own_list(cb: CallbackQuery, state: FSMContext) -> None:
    status = "open" if cb.data == "menu:mine" else "done"
    await state.update_data(scope="self", scope_label=None, status=status, page=1)
    await _render_list(cb, state)


@router.callback_query(F.data.startswith("emp:mine:") | F.data.startswith("emp:done:"))
async def open_employee_list(cb: CallbackQuery, state: FSMContext) -> None:
    action, employee_id = cb.data.rsplit(":", 1)
    status = "open" if action == "emp:mine" else "done"

    profile = await require_linked(cb)
    if not profile:
        return
    if profile["role"] != "ADMIN" and not profile["permissions"]["editTasksOthers"]:
        await cb.answer("Недостаточно прав", show_alert=True)
        return

    try:
        emp = await api.employee_report(cb.message.chat.id, employee_id)
    except ApiError:
        await cb.answer("Сотрудник не найден", show_alert=True)
        return

    await state.update_data(scope=employee_id, scope_label=emp["employee"]["name"], status=status, page=1)
    await _render_list(cb, state)


@router.callback_query(F.data == "page:prev")
async def page_prev(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(page=max(1, data.get("page", 1) - 1))
    await _render_list(cb, state)


@router.callback_query(F.data == "page:next")
async def page_next(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(page=data.get("page", 1) + 1)
    await _render_list(cb, state)


@router.callback_query(F.data == "back:list")
async def back_to_list(cb: CallbackQuery, state: FSMContext) -> None:
    await _render_list(cb, state)


@router.callback_query(F.data == "noop")
async def noop(cb: CallbackQuery) -> None:
    await cb.answer()


def _can_edit_task(profile: dict, scope: str) -> bool:
    return scope == "self" or profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]


@router.callback_query(F.data.startswith("open:"))
async def open_task(cb: CallbackQuery, state: FSMContext) -> None:
    task_id = cb.data.split(":", 1)[1]
    data = await state.get_data()
    tasks = data.get("tasks", [])
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        await cb.answer("Задача не найдена, список обновился", show_alert=True)
        return

    profile = await require_linked(cb)
    if not profile:
        return
    can_edit = _can_edit_task(profile, data.get("scope", "self"))

    await state.update_data(current_task_id=task_id)
    await cb.message.edit_text(
        task_detail_text(task),
        reply_markup=task_detail_keyboard(task_id, task["columnName"], can_edit),
    )
    await cb.answer()


async def _reopen_task(cb: CallbackQuery, state: FSMContext, task_id: str) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    try:
        result = await api.get_task(cb.message.chat.id, task_id)
    except ApiError:
        await cb.answer("Задача не найдена", show_alert=True)
        return

    data = await state.get_data()
    can_edit = _can_edit_task(profile, data.get("scope", "self"))
    task = result["task"]
    await cb.message.edit_text(
        task_detail_text(task),
        reply_markup=task_detail_keyboard(task_id, task["columnName"], can_edit),
    )
    await cb.answer()


@router.callback_query(F.data == "status:menu")
async def open_status_menu(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    task_id = data.get("current_task_id")
    if not task_id:
        await cb.answer()
        return
    try:
        result = await api.get_task_columns(cb.message.chat.id, task_id)
    except ApiError:
        await cb.answer("Не удалось загрузить статусы", show_alert=True)
        return
    await cb.message.edit_text(
        "Выберите статус:", reply_markup=status_picker_keyboard(result["columns"], result["currentColumnId"])
    )
    await cb.answer()


@router.callback_query(F.data == "status:back")
async def status_back(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    task_id = data.get("current_task_id")
    if not task_id:
        await cb.answer()
        return
    await _reopen_task(cb, state, task_id)


@router.callback_query(F.data.startswith("status:set:"))
async def set_status(cb: CallbackQuery, state: FSMContext) -> None:
    column_id = cb.data.split(":", 2)[2]
    data = await state.get_data()
    task_id = data.get("current_task_id")
    if not task_id:
        await cb.answer()
        return
    try:
        await api.set_task_status(cb.message.chat.id, task_id, column_id)
    except ApiError as err:
        message = "Недостаточно прав" if err.code == "forbidden" else "Не удалось изменить статус"
        await cb.answer(message, show_alert=True)
        return
    await cb.answer("Статус обновлён ✅")
    await _reopen_task(cb, state, task_id)


@router.callback_query(F.data.startswith("archive:"))
async def archive_task(cb: CallbackQuery, state: FSMContext) -> None:
    task_id = cb.data.split(":", 1)[1]
    try:
        await api.archive_task(cb.message.chat.id, task_id)
    except ApiError:
        await cb.answer("Не удалось отправить задачу в архив", show_alert=True)
        return
    await cb.answer("В архиве 📦")
    await _render_list(cb, state)


@router.callback_query(F.data == "menu:main")
async def back_to_menu(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    profile = await require_linked(cb)
    if not profile:
        return
    can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
    await cb.message.edit_text("Главное меню:", reply_markup=main_menu(can_manage))
    await cb.answer()
