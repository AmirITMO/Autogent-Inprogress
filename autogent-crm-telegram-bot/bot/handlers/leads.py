from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api_client import ApiError, api
from ..common import require_linked
from ..keyboards import cancel_only_keyboard, confirm_keyboard, crm_menu_keyboard, lead_card_keyboard, leads_list_keyboard, main_menu, skip_keyboard
from ..render import _escape

router = Router()


class CreateLead(StatesGroup):
    title = State()
    company = State()
    contact = State()
    description = State()
    confirm = State()


class EditLead(StatesGroup):
    prepay = State()
    postpay = State()
    notes = State()


def _lead_text(lead: dict) -> str:
    lines = [f"<b>{_escape(lead['title'])}</b>"]
    if lead.get("company"):
        lines.append(f"Компания: {_escape(lead['company'])}")
    if lead.get("contactName") or lead.get("contact"):
        lines.append(f"Контакт: {_escape(lead.get('contactName') or '')} {_escape(lead.get('contact') or '')}".strip())
    lines.append(f"Этап: {_escape(lead['stageTitle'])}")
    lines.append(f"Предоплата: {lead['prepayLabel']}")
    lines.append(f"Постоплата: {lead['postpayLabel']}")
    if lead.get("notes"):
        lines.append(f"Заметки: {_escape(lead['notes'])}")
    if lead.get("lost"):
        lines.append(f"❌ Отказ{': ' + _escape(lead['lostReason']) if lead.get('lostReason') else ''}")
    return "\n".join(lines)


@router.callback_query(F.data == "menu:crm")
async def open_crm_menu(cb: CallbackQuery) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    can_edit = profile["role"] == "ADMIN" or profile["permissions"]["editCrm"]
    try:
        result = await api.list_lead_stages(cb.message.chat.id)
    except ApiError:
        await cb.answer("Не удалось загрузить этапы", show_alert=True)
        return
    await cb.message.edit_text("Сделки — выберите этап:", reply_markup=crm_menu_keyboard(result["stages"], can_edit))
    await cb.answer()


async def _render_leads_list(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    stage = data.get("crm_stage")
    page = data.get("crm_page", 1)
    try:
        result = await api.list_leads(cb.message.chat.id, stage, page)
    except ApiError:
        await cb.answer("Не удалось загрузить сделки", show_alert=True)
        return

    title = "Сделки на этапе" + ("\n\nПусто." if not result["leads"] else "")
    await cb.message.edit_text(title, reply_markup=leads_list_keyboard(result["leads"], result["page"], result["totalPages"]))
    await cb.answer()


@router.callback_query(F.data.startswith("crm:stage:"))
async def open_stage(cb: CallbackQuery, state: FSMContext) -> None:
    stage = cb.data.split(":", 2)[2]
    await state.update_data(crm_stage=stage, crm_page=1)
    await _render_leads_list(cb, state)


@router.callback_query(F.data == "crm:page:prev")
async def leads_prev(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(crm_page=max(1, data.get("crm_page", 1) - 1))
    await _render_leads_list(cb, state)


@router.callback_query(F.data == "crm:page:next")
async def leads_next(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    await state.update_data(crm_page=data.get("crm_page", 1) + 1)
    await _render_leads_list(cb, state)


@router.callback_query(F.data == "crm:back:list")
async def back_to_leads_list(cb: CallbackQuery, state: FSMContext) -> None:
    await _render_leads_list(cb, state)


async def _render_lead_card(cb: CallbackQuery, state: FSMContext, lead_id: str) -> None:
    profile = await require_linked(cb)
    if not profile:
        return
    try:
        result = await api.get_lead(cb.message.chat.id, lead_id)
    except ApiError:
        await cb.answer("Сделка не найдена", show_alert=True)
        return

    can_edit = profile["role"] == "ADMIN" or profile["permissions"]["editCrm"]
    await state.update_data(crm_lead_id=lead_id)
    await cb.message.edit_text(_lead_text(result["lead"]), reply_markup=lead_card_keyboard(result["lead"], can_edit))
    await cb.answer()


@router.callback_query(F.data.startswith("crm:open:"))
async def open_lead(cb: CallbackQuery, state: FSMContext) -> None:
    lead_id = cb.data.split(":", 2)[2]
    await _render_lead_card(cb, state, lead_id)


@router.callback_query(F.data.startswith("crm:move:"))
async def move_lead(cb: CallbackQuery, state: FSMContext) -> None:
    direction = cb.data.split(":", 2)[2]
    data = await state.get_data()
    lead_id = data.get("crm_lead_id")
    if not lead_id:
        await cb.answer()
        return
    try:
        await api.move_lead(cb.message.chat.id, lead_id, direction)
    except ApiError as err:
        message = "Недостаточно прав" if err.code == "forbidden" else "Дальше двигать некуда"
        await cb.answer(message, show_alert=True)
        return
    await _render_lead_card(cb, state, lead_id)


@router.callback_query(F.data.startswith("crm:lost:"))
async def toggle_lost(cb: CallbackQuery, state: FSMContext) -> None:
    lost = cb.data.split(":", 2)[2] == "yes"
    data = await state.get_data()
    lead_id = data.get("crm_lead_id")
    if not lead_id:
        await cb.answer()
        return
    try:
        await api.set_lead_lost(cb.message.chat.id, lead_id, lost)
    except ApiError:
        await cb.answer("Недостаточно прав", show_alert=True)
        return
    await _render_lead_card(cb, state, lead_id)


@router.callback_query(F.data == "crm:edit")
async def start_edit_lead(cb: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(edit_draft={})
    await state.set_state(EditLead.prepay)
    await cb.message.edit_text("Сумма предоплаты? Введите число или нажмите «Пропустить»:", reply_markup=skip_keyboard())
    await cb.answer()


@router.message(EditLead.prepay)
async def set_edit_prepay(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data.get("edit_draft", {})
    text = (message.text or "").strip()
    if text.replace(".", "", 1).isdigit():
        draft["prepay"] = float(text)
    await state.update_data(edit_draft=draft)
    await _ask_postpay(message, state)


@router.callback_query(EditLead.prepay, F.data == "skip")
async def skip_edit_prepay(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_postpay(cb.message, state)
    await cb.answer()


async def _ask_postpay(message: Message, state: FSMContext) -> None:
    await state.set_state(EditLead.postpay)
    await message.answer("Сумма постоплаты? Введите число или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(EditLead.postpay)
async def set_edit_postpay(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data.get("edit_draft", {})
    text = (message.text or "").strip()
    if text.replace(".", "", 1).isdigit():
        draft["postpay"] = float(text)
    await state.update_data(edit_draft=draft)
    await _ask_notes(message, state)


@router.callback_query(EditLead.postpay, F.data == "skip")
async def skip_edit_postpay(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_notes(cb.message, state)
    await cb.answer()


async def _ask_notes(message: Message, state: FSMContext) -> None:
    await state.set_state(EditLead.notes)
    await message.answer("Заметки? Введите текст или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(EditLead.notes)
async def set_edit_notes(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data.get("edit_draft", {})
    draft["notes"] = (message.text or "").strip()
    await state.update_data(edit_draft=draft)
    await _apply_edit(message, state)


@router.callback_query(EditLead.notes, F.data == "skip")
async def skip_edit_notes(cb: CallbackQuery, state: FSMContext) -> None:
    await _apply_edit(cb.message, state)
    await cb.answer()


async def _apply_edit(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data.get("edit_draft", {})
    lead_id = data.get("crm_lead_id")
    await state.set_state(None)
    if not lead_id:
        return
    try:
        await api.update_lead(message.chat.id, lead_id, **draft)
    except ApiError:
        await message.answer("Не удалось сохранить изменения")
        return

    try:
        result = await api.get_lead(message.chat.id, lead_id)
        profile = await api.whoami(message.chat.id)
    except ApiError:
        await message.answer("Сохранено ✅")
        return
    can_edit = profile["role"] == "ADMIN" or profile["permissions"]["editCrm"]
    await message.answer(_lead_text(result["lead"]), reply_markup=lead_card_keyboard(result["lead"], can_edit))


@router.callback_query(F.data == "crm:add")
async def start_create_lead(cb: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(lead_draft={})
    await state.set_state(CreateLead.title)
    await cb.message.edit_text("Название сделки?", reply_markup=cancel_only_keyboard())
    await cb.answer()


@router.message(CreateLead.title)
async def set_lead_title(message: Message, state: FSMContext) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("Название не может быть пустым. Введите название сделки:", reply_markup=cancel_only_keyboard())
        return
    data = await state.get_data()
    draft = data["lead_draft"]
    draft["title"] = title
    await state.update_data(lead_draft=draft)
    await state.set_state(CreateLead.company)
    await message.answer("Компания? Введите текст или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(CreateLead.company)
async def set_lead_company(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["lead_draft"]
    draft["company"] = (message.text or "").strip()
    await state.update_data(lead_draft=draft)
    await _ask_lead_contact(message, state)


@router.callback_query(CreateLead.company, F.data == "skip")
async def skip_lead_company(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_lead_contact(cb.message, state)
    await cb.answer()


async def _ask_lead_contact(message: Message, state: FSMContext) -> None:
    await state.set_state(CreateLead.contact)
    await message.answer("Контакт (телефон/telegram)? Введите текст или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(CreateLead.contact)
async def set_lead_contact(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["lead_draft"]
    draft["contact"] = (message.text or "").strip()
    await state.update_data(lead_draft=draft)
    await _ask_lead_description(message, state)


@router.callback_query(CreateLead.contact, F.data == "skip")
async def skip_lead_contact(cb: CallbackQuery, state: FSMContext) -> None:
    await _ask_lead_description(cb.message, state)
    await cb.answer()


async def _ask_lead_description(message: Message, state: FSMContext) -> None:
    await state.set_state(CreateLead.description)
    await message.answer("Описание? Введите текст или нажмите «Пропустить»:", reply_markup=skip_keyboard())


@router.message(CreateLead.description)
async def set_lead_description(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["lead_draft"]
    draft["description"] = (message.text or "").strip()
    await state.update_data(lead_draft=draft)
    await _show_lead_confirmation(message, state)


@router.callback_query(CreateLead.description, F.data == "skip")
async def skip_lead_description(cb: CallbackQuery, state: FSMContext) -> None:
    await _show_lead_confirmation(cb.message, state)
    await cb.answer()


async def _show_lead_confirmation(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["lead_draft"]
    await state.set_state(CreateLead.confirm)
    lines = [f"<b>{draft['title']}</b>"]
    if draft.get("company"):
        lines.append(draft["company"])
    lines.append("\nСоздать сделку?")
    await message.answer("\n".join(lines), reply_markup=confirm_keyboard())


@router.callback_query(CreateLead.confirm, F.data == "confirm")
async def confirm_create_lead(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    draft = data["lead_draft"]
    try:
        await api.create_lead(cb.message.chat.id, **draft)
    except ApiError as err:
        message = "Недостаточно прав" if err.code == "forbidden" else "Не удалось создать сделку"
        await cb.message.edit_text(message)
        await state.clear()
        await cb.answer()
        return

    await cb.message.edit_text("Сделка создана ✅")
    await state.clear()
    profile = await require_linked(cb)
    if profile:
        can_manage = profile["role"] == "ADMIN" or profile["permissions"]["editTasksOthers"]
        await cb.message.answer("Главное меню:", reply_markup=main_menu(can_manage))
    await cb.answer()
