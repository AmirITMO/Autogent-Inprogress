from datetime import datetime
from typing import Any

from .keyboards import PRIORITY_LABELS


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def task_detail_text(task: dict[str, Any]) -> str:
    lines = [f"<b>{task['title']}</b>"]
    if task.get("isBug"):
        lines.append("🐞 Баг")
    lines.append(f"Приоритет: {PRIORITY_LABELS.get(task['priority'], task['priority'])}")
    lines.append(f"Дедлайн: {_fmt_date(task.get('dueDate'))}")
    if task.get("projectName"):
        lines.append(f"Проект: {task['projectName']}")
    if task.get("description"):
        lines.append(f"\n{task['description']}")
    return "\n".join(lines)


def task_list_title(status: str, scope_label: str | None = None) -> str:
    base = "Активные задачи" if status == "open" else "Выполненные задачи"
    return f"{base} — {scope_label}" if scope_label else base


def report_text(employee: dict[str, Any], report: dict[str, Any]) -> str:
    return (
        f"<b>{employee['name']}</b>\n"
        f"{employee['email']}\n"
        f"Роль: {employee['role']}\n\n"
        f"✅ Выполнено всего: {report['completedCount']}\n"
        f"📋 Открытых задач: {report['openCount']}\n"
        f"🔥 Просрочено: {report['overdueCount']}"
    )
