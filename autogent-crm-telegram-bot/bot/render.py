from datetime import datetime
from typing import Any

from . import config
from .keyboards import PRIORITY_LABELS


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def task_link(task_id: str, title: str) -> str:
    safe_title = _escape(title)
    if not config.APP_URL:
        return safe_title
    return f'<a href="{config.APP_URL}/tasks?task={task_id}">{safe_title}</a>'


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def task_detail_text(task: dict[str, Any]) -> str:
    lines = [f"<b>{task_link(task['id'], task['title'])}</b>"]
    if task.get("isBug"):
        lines.append("🐞 Баг")
    lines.append(f"Приоритет: {PRIORITY_LABELS.get(task['priority'], task['priority'])}")
    lines.append(f"Дедлайн: {_fmt_date(task.get('dueDate'))}")
    if task.get("projectName"):
        lines.append(f"Проект: {_escape(task['projectName'])}")
    if task.get("description"):
        lines.append(f"\n{_escape(task['description'])}")
    return "\n".join(lines)


def task_list_title(status: str, scope_label: str | None = None) -> str:
    base = "Активные задачи" if status == "open" else "Выполненные задачи"
    return f"{base} — {scope_label}" if scope_label else base


def report_text(employee: dict[str, Any], report: dict[str, Any]) -> str:
    return (
        f"<b>{_escape(employee['name'])}</b>\n"
        f"{_escape(employee['email'])}\n"
        f"Роль: {employee['role']}\n\n"
        f"✅ Выполнено всего: {report['completedCount']}\n"
        f"📋 Открытых задач: {report['openCount']}\n"
        f"🔥 Просрочено: {report['overdueCount']}"
    )
