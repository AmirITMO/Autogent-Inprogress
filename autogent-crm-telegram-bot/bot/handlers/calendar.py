import re
from datetime import date, datetime, timedelta, timezone

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import attendees_keyboard, calendar_menu_keyboard, confirm_keyboard, duration_keyboard, main_menu

router = Router()

MSK = timezone(timedelta(hours=3))
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class CreateEvent(StatesGroup):
    title = State()
    date = State()
    time = State()
    attendees = State()
    confirm = State()


@router.callback_query(F.data == "menu:calendar")
async def open_calendar_menu(cb: CallbackQuery) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    await cb.message.edit_text("Календарь:", reply_markup=calendar_menu_keyboard())
    await cb.answer()


@router.callback_query(F.data == "calendar:add")
async def start_create_event(cb: CallbackQuery, state: FSMContext) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    await state.set_state(CreateEvent.title)
    await state.update_data(draft={})
    await cb.message.edit_text("Название созвона?")
    await cb.answer()


@router.message(CreateEvent.title)
async def set_event_title(message: Message, state: FSMContext) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("Название не может быть пустым. Введите название созвона:")
        return
    data = await state.get_data()
    draft = data["draft"]
    draft["title"] = title
    await state.update_data(draft=draft)
    await state.set_state(CreateEvent.date)
    await message.answer("Дата созвона? Формат ДД.ММ.ГГГГ:")


@router.message(CreateEvent.date)
async def set_event_date(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    try:
        parsed = datetime.strptime(text, "%d.%m.%Y").date()
    except ValueError:
        await message.answer("Не понял дату. Формат ДД.ММ.ГГГГ, например 25.12.2026:")
        return
    if parsed < date.today():
        await message.answer("Дата не может быть в прошлом. Введите дату ещё раз:")
        return

    data = await state.get_data()
    draft = data["draft"]
    draft["date"] = text
    await state.update_data(draft=draft)
    await state.set_state(CreateEvent.time)
    await message.answer("Время начала? Формат ЧЧ:ММ (24-часовой), например 14:30:")


@router.message(CreateEvent.time)
async def set_event_time(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    if not TIME_RE.match(text):
        await message.answer("Не понял время. Формат ЧЧ:ММ, от 00:00 до 23:59, например 09:00:")
        return

    data = await state.get_data()
    draft = data["draft"]
    draft["time"] = text
    await state.update_data(draft=draft)
    await message.answer("На сколько минут созвон?", reply_markup=duration_keyboard())


@router.callback_query(F.data.startswith("duration:"))
async def set_duration(cb: CallbackQuery, state: FSMContext) -> None:
    minutes = int(cb.data.split(":", 1)[1])
    data = await state.get_data()
    draft = data["draft"]

    day, month, year = (int(x) for x in draft["date"].split("."))
    hour, minute = (int(x) for x in draft["time"].split(":"))
    start = datetime(year, month, day, hour, minute, tzinfo=MSK)
    end = start + timedelta(minutes=minutes)
    draft["startAt"] = start.isoformat()
    draft["endAt"] = end.isoformat()
    await state.update_data(draft=draft, selected_attendees=set())

    try:
        result = await api.list_users(cb.message.chat.id)
        users = result["users"]
    except ApiError:
        users = []

    await state.set_state(CreateEvent.attendees)
    await cb.message.edit_text("Кто участвует? Отметьте и нажмите «Готово»:", reply_markup=attendees_keyboard(users, set()))
    await cb.answer()


@router.callback_query(CreateEvent.attendees, F.data.startswith("att:"))
async def toggle_attendee(cb: CallbackQuery, state: FSMContext) -> None:
    value = cb.data.split(":", 1)[1]
    data = await state.get_data()

    if value == "done":
        await _show_event_confirmation(cb.message, state)
        await cb.answer()
        return

    selected: set = data.get("selected_attendees", set())
    selected = set(selected)
    if value in selected:
        selected.discard(value)
    else:
        selected.add(value)
    await state.update_data(selected_attendees=selected)

    try:
        result = await api.list_users(cb.message.chat.id)
        users = result["users"]
    except ApiError:
        users = []
    await cb.message.edit_reply_markup(reply_markup=attendees_keyboard(users, selected))
    await cb.answer()


async def _show_event_confirmation(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    draft["attendeeIds"] = list(data.get("selected_attendees", set()))
    await state.update_data(draft=draft)
    await state.set_state(CreateEvent.confirm)

    text = (
        f"<b>{draft['title']}</b>\n"
        f"{draft['date']} в {draft['time']} (МСК)\n"
        f"Участников: {len(draft['attendeeIds'])}\n\n"
        "Создать созвон?"
    )
    await message.answer(text, reply_markup=confirm_keyboard())


@router.callback_query(CreateEvent.confirm, F.data == "confirm")
async def confirm_create_event(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["draft"]
    try:
        await api.create_calendar_event(
            cb.message.chat.id,
            title=draft["title"],
            startAt=draft["startAt"],
            endAt=draft["endAt"],
            attendeeIds=draft.get("attendeeIds") or None,
        )
    except ApiError as err:
        await cb.message.edit_text(err.payload.get("error", "Не удалось создать созвон"))
        await state.clear()
        await cb.answer()
        return

    await cb.message.edit_text("Созвон добавлен в календарь ✅")
    await state.clear()
    profile = await require_linked(cb)
    if profile:
        can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
        await cb.message.answer("Главное меню:", reply_markup=main_menu(can_manage))
    await cb.answer()


@router.callback_query(CreateEvent.confirm, F.data == "cancel")
async def cancel_create_event(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    profile = await require_linked(cb)
    if not profile:
        return
    can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
    await cb.message.edit_text("Отменено.", reply_markup=main_menu(can_manage))
    await cb.answer()
