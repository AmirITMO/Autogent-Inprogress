from datetime import datetime

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import (
    PRIORITY_LABELS,
    assignee_keyboard,
    confirm_keyboard,
    main_menu,
    priority_keyboard,
    projects_keyboard,
    skip_keyboard,
    yes_no_keyboard,
)

router = Router()


class CreateTask(StatesGroup):
    title = State()
    description = State()
    priority = State()
    is_bug = State()
    estimate = State()
    due_date = State()
    project = State()
    assignee = State()
    confirm = State()


async def _start_flow(cb: CallbackQuery, state: FSMContext, preset_assignee: str | None) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    await state.set_state(CreateTask.title)
    await state.update_data(draft={}, preset_assignee=preset_assignee, can_manage=profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"])
    await cb.message.edit_text("Название задачи?")
    await cb.answer()


@router.callback_query(F.data == "menu:add")
async def start_own_task(cb: CallbackQuery, state: FSMContext) -> None:
    await _start_flow(cb, state, preset_assignee=None)


@router.callback_query(F.data.startswith("emp:add:"))
async def start_task_for_employee(cb: CallbackQuery, state: FSMContext) -> None:
    employee_id = cb.data.split(":", 2)[2]
    await _start_flow(cb, state, preset_assignee=employee_id)


@router.message(CreateTask.title)
async def set_title(message: Message, state: FSMContext) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("Название не может быть пустым. Введите название задачи:")
        return
    data = await state.get_data()
    draft = data["draft"]
    draft["title"] = title
    await state.update_data(draft=draft)
    await state.set_state(CreateTask.description)
    await message.answer("Описание (или нажмите «Пропустить»):", reply_markup=skip_keyboard())


@router.message(CreateTask.description)
async def set_description(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    draft["description"] = (message.text or "").strip()
    await state.update_data(draft=draft)
    await _ask_priority(message, state)


@router.callback_query(CreateTask.description, F.data == "skip")
async def skip_description(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_priority(cb.message, state)
    await cb.answer()


async def _ask_priority(message: Message, state: FSMContext) -> None:
    await state.set_state(CreateTask.priority)
    await message.answer("Приоритет?", reply_markup=priority_keyboard())


@router.callback_query(CreateTask.priority, F.data.startswith("prio:"))
async def set_priority(cb: CallbackQuery, state: FSMContext) -> None:
    priority = cb.data.split(":", 1)[1]
    data = await state.get_data()
    draft = data["draft"]
    draft["priority"] = priority
    await state.update_data(draft=draft)
    await state.set_state(CreateTask.is_bug)
    await cb.message.edit_text("Это баг?", reply_markup=yes_no_keyboard("bug"))
    await cb.answer()


@router.callback_query(CreateTask.is_bug, F.data.startswith("bug:"))
async def set_is_bug(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    draft["isBug"] = cb.data == "bug:yes"
    await state.update_data(draft=draft)
    await state.set_state(CreateTask.estimate)
    await cb.message.edit_text("Оценка в часах? Введите число или нажмите «Пропустить»:", reply_markup=skip_keyboard())
    await cb.answer()


@router.message(CreateTask.estimate)
async def set_estimate(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    data = await state.get_data()
    draft = data["draft"]
    if text.isdigit():
        draft["estimateHours"] = int(text)
    await state.update_data(draft=draft)
    await _ask_due_date(message, state)


@router.callback_query(CreateTask.estimate, F.data == "skip")
async def skip_estimate(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_due_date(cb.message, state)
    await cb.answer()


async def _ask_due_date(message: Message, state: FSMContext) -> None:
    await state.set_state(CreateTask.due_date)
    await message.answer("Дедлайн? Введите дату в формате ДД.ММ.ГГГГ или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(CreateTask.due_date)
async def set_due_date(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    data = await state.get_data()
    draft = data["draft"]
    try:
        due = datetime.strptime(text, "%d.%m.%Y")
        draft["dueDate"] = due.isoformat()
    except ValueError:
        await message.answer("Не понял дату. Формат ДД.ММ.ГГГГ, или нажмите «Пропустить»:", reply_markup=skip_keyboard())
        return
    await state.update_data(draft=draft)
    await _ask_project(message, state)


@router.callback_query(CreateTask.due_date, F.data == "skip")
async def skip_due_date(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_project(cb.message, state)
    await cb.answer()


async def _ask_project(message: Message, state: FSMContext) -> None:
    try:
        result = await api.list_projects(message.chat.id)
    except ApiError:
        result = {"projects": []}
    await state.set_state(CreateTask.project)
    await message.answer("Проект?", reply_markup=projects_keyboard(result["projects"]))


@router.callback_query(CreateTask.project, F.data.startswith("proj:"))
async def set_project(cb: CallbackQuery, state: FSMContext) -> None:
    project_id = cb.data.split(":", 1)[1]
    data = await state.get_data()
    draft = data["draft"]
    if project_id != "none":
        draft["projectId"] = project_id
    await state.update_data(draft=draft)
    await _ask_assignee(cb, state)


async def _ask_assignee(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    preset = data.get("preset_assignee")
    if preset:
        draft = data["draft"]
        draft["assigneeId"] = preset
        await state.update_data(draft=draft)
        await _show_confirmation(cb.message, state)
        return

    if not data.get("can_manage"):
        await _show_confirmation(cb.message, state)
        return

    try:
        result = await api.list_employees(cb.message.chat.id)
        employees = [e for e in result["employees"]]
    except ApiError:
        employees = []

    await state.set_state(CreateTask.assignee)
    await cb.message.edit_text("Кому назначить задачу?", reply_markup=assignee_keyboard(employees))
    await cb.answer()


@router.callback_query(CreateTask.assignee, F.data.startswith("assignee:"))
async def set_assignee(cb: CallbackQuery, state: FSMContext) -> None:
    value = cb.data.split(":", 1)[1]
    data = await state.get_data()
    draft = data["draft"]
    if value != "self":
        draft["assigneeId"] = value
    await state.update_data(draft=draft)
    await _show_confirmation(cb.message, state)
    await cb.answer()


async def _show_confirmation(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    await state.set_state(CreateTask.confirm)

    lines = [f"<b>{draft['title']}</b>"]
    if draft.get("description"):
        lines.append(draft["description"])
    lines.append(f"Приоритет: {PRIORITY_LABELS.get(draft.get('priority', 'P2'), draft.get('priority'))}")
    if draft.get("isBug"):
        lines.append("🐞 Баг")
    if draft.get("estimateHours"):
        lines.append(f"Оценка: {draft['estimateHours']} ч.")
    if draft.get("dueDate"):
        lines.append(f"Дедлайн: {draft['dueDate'][:10]}")
    lines.append("\nСоздать задачу?")

    await message.answer("\n".join(lines), reply_markup=confirm_keyboard())


@router.callback_query(CreateTask.confirm, F.data == "confirm")
async def confirm_create(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    try:
        await api.create_task(cb.message.chat.id, **draft)
    except ApiError as err:
        message = "Не удалось создать задачу"
        if err.code == "forbidden":
            message = "Недостаточно прав для этого действия"
        await cb.message.edit_text(message)
        await state.clear()
        await cb.answer()
        return

    await cb.message.edit_text("Задача создана ✅")
    await state.clear()
    profile = await require_linked(cb)
    if profile:
        can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
        await cb.message.answer("Главное меню:", reply_markup=main_menu(can_manage))
    await cb.answer()


@router.callback_query(CreateTask.confirm, F.data == "cancel")
async def cancel_create(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    profile = await require_linked(cb)
    if not profile:
        return
    can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
    await cb.message.edit_text("Отменено.", reply_markup=main_menu(can_manage))
    await cb.answer()
