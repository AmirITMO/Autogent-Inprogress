from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

PRIORITY_LABELS = {
    "P0": "P0 — critical",
    "P1": "P1 — high",
    "P2": "P2 — normal",
    "P3": "P3 — low",
}

DONE_COLUMN_NAME = "Выполнено"

CANCEL_BUTTON = InlineKeyboardButton(text="✖️ Отмена", callback_data="cancel")


def cancel_only_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[CANCEL_BUTTON]])


def main_menu(can_manage: bool) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text="📋 Мои задачи", callback_data="menu:mine")],
        [InlineKeyboardButton(text="✅ Выполненные", callback_data="menu:done")],
        [InlineKeyboardButton(text="➕ Добавить задачу", callback_data="menu:add")],
        [InlineKeyboardButton(text="📅 Созвоны", callback_data="menu:calendar")],
        [InlineKeyboardButton(text="💼 Сделки", callback_data="menu:crm")],
    ]
    if can_manage:
        rows.append([InlineKeyboardButton(text="👥 Сотрудники", callback_data="menu:employees")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_to_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:main")]])


def task_list_keyboard(tasks: list[dict], page: int, total_pages: int) -> InlineKeyboardMarkup:
    rows = []
    for t in tasks:
        icon = "🐞 " if t.get("isBug") else ""
        status = f" [{t['columnName']}]" if t.get("columnName") else ""
        label = f"{icon}{t['title']}{status}"
        rows.append([InlineKeyboardButton(text=label[:60], callback_data=f"open:{t['id']}")])

    nav = []
    if page > 1:
        nav.append(InlineKeyboardButton(text="◀️", callback_data="page:prev"))
    if total_pages > 1:
        nav.append(InlineKeyboardButton(text=f"{page}/{total_pages}", callback_data="noop"))
    if page < total_pages:
        nav.append(InlineKeyboardButton(text="▶️", callback_data="page:next"))
    if nav:
        rows.append(nav)

    rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:main")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def task_detail_keyboard(task_id: str, column_name: str, can_edit: bool) -> InlineKeyboardMarkup:
    rows = []
    if can_edit:
        rows.append([InlineKeyboardButton(text="🔀 Изменить статус", callback_data="status:menu")])
        if column_name == DONE_COLUMN_NAME:
            rows.append([InlineKeyboardButton(text="📦 В архив", callback_data=f"archive:{task_id}")])
    rows.append([InlineKeyboardButton(text="⬅️ Назад к списку", callback_data="back:list")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def status_picker_keyboard(columns: list[dict], current_id: str) -> InlineKeyboardMarkup:
    rows = []
    for c in columns:
        mark = "✅ " if c["id"] == current_id else ""
        rows.append([InlineKeyboardButton(text=f"{mark}{c['name']}", callback_data=f"status:set:{c['id']}")])
    rows.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="status:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def employees_keyboard(employees: list[dict], page: int, total_pages: int) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=f"{e['name']}", callback_data=f"emp:open:{e['id']}")] for e in employees]
    nav = []
    if page > 1:
        nav.append(InlineKeyboardButton(text="◀️", callback_data="emp:page:prev"))
    if total_pages > 1:
        nav.append(InlineKeyboardButton(text=f"{page}/{total_pages}", callback_data="noop"))
    if page < total_pages:
        nav.append(InlineKeyboardButton(text="▶️", callback_data="emp:page:next"))
    if nav:
        rows.append(nav)
    rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:main")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def employee_card_keyboard(employee_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📋 Активные задачи", callback_data=f"emp:mine:{employee_id}")],
            [InlineKeyboardButton(text="✅ Выполненные задачи", callback_data=f"emp:done:{employee_id}")],
            [InlineKeyboardButton(text="➕ Добавить задачу", callback_data=f"emp:add:{employee_id}")],
            [InlineKeyboardButton(text="⬅️ К сотрудникам", callback_data="menu:employees")],
        ]
    )


def priority_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            *[[InlineKeyboardButton(text=label, callback_data=f"prio:{key}")] for key, label in PRIORITY_LABELS.items()],
            [CANCEL_BUTTON],
        ]
    )


def yes_no_keyboard(prefix: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Да", callback_data=f"{prefix}:yes"),
                InlineKeyboardButton(text="Нет", callback_data=f"{prefix}:no"),
            ],
            [CANCEL_BUTTON],
        ]
    )


def skip_keyboard(action: str = "skip") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Пропустить", callback_data=action)], [CANCEL_BUTTON]])


def projects_keyboard(projects: list[dict]) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=p["name"], callback_data=f"proj:{p['id']}")] for p in projects]
    rows.append([InlineKeyboardButton(text="Без проекта", callback_data="proj:none")])
    rows.append([CANCEL_BUTTON])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def assignee_keyboard(employees: list[dict]) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text="Себе", callback_data="assignee:self")]]
    rows += [[InlineKeyboardButton(text=e["name"], callback_data=f"assignee:{e['id']}")] for e in employees]
    rows.append([CANCEL_BUTTON])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Создать", callback_data="confirm")],
            [CANCEL_BUTTON],
        ]
    )


CALENDAR_DURATIONS = [30, 60, 90, 120]


def calendar_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="➕ Добавить созвон", callback_data="calendar:add")],
            [InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:main")],
        ]
    )


def duration_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=f"{m} мин", callback_data=f"duration:{m}") for m in CALENDAR_DURATIONS],
            [CANCEL_BUTTON],
        ]
    )


def attendees_keyboard(users: list[dict], selected_ids: set[str]) -> InlineKeyboardMarkup:
    rows = []
    for u in users:
        mark = "✅ " if u["id"] in selected_ids else ""
        rows.append([InlineKeyboardButton(text=f"{mark}{u['name']}", callback_data=f"att:{u['id']}")])
    rows.append([InlineKeyboardButton(text="Готово", callback_data="att:done")])
    rows.append([CANCEL_BUTTON])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def crm_menu_keyboard(stages: list[dict], can_edit: bool) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=s["title"], callback_data=f"crm:stage:{s['id']}")] for s in stages]
    if can_edit:
        rows.append([InlineKeyboardButton(text="➕ Добавить сделку", callback_data="crm:add")])
    rows.append([InlineKeyboardButton(text="⬅️ В меню", callback_data="menu:main")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def leads_list_keyboard(leads: list[dict], page: int, total_pages: int) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=f"{l['title']}" + (f" — {l['company']}" if l.get("company") else ""), callback_data=f"crm:open:{l['id']}")]
        for l in leads
    ]
    nav = []
    if page > 1:
        nav.append(InlineKeyboardButton(text="◀️", callback_data="crm:page:prev"))
    if total_pages > 1:
        nav.append(InlineKeyboardButton(text=f"{page}/{total_pages}", callback_data="noop"))
    if page < total_pages:
        nav.append(InlineKeyboardButton(text="▶️", callback_data="crm:page:next"))
    if nav:
        rows.append(nav)
    rows.append([InlineKeyboardButton(text="⬅️ К этапам", callback_data="menu:crm")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def lead_card_keyboard(lead: dict, can_edit: bool) -> InlineKeyboardMarkup:
    rows = []
    if can_edit:
        nav = []
        nav.append(InlineKeyboardButton(text="⬅️ Этап назад", callback_data="crm:move:prev"))
        nav.append(InlineKeyboardButton(text="Этап вперёд ➡️", callback_data="crm:move:next"))
        rows.append(nav)
        rows.append([InlineKeyboardButton(text="✏️ Изменить суммы/заметки", callback_data="crm:edit")])
        if lead.get("lost"):
            rows.append([InlineKeyboardButton(text="↩️ Вернуть в работу", callback_data="crm:lost:no")])
        else:
            rows.append([InlineKeyboardButton(text="❌ Отметить отказом", callback_data="crm:lost:yes")])
    rows.append([InlineKeyboardButton(text="⬅️ К списку", callback_data="crm:back:list")])
    return InlineKeyboardMarkup(inline_keyboard=rows)
