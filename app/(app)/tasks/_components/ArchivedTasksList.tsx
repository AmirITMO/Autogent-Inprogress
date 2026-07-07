"use client";

import { useEffect, useState } from "react";
import { listArchivedTasks, unarchiveTask } from "@/lib/actions/tasks";
import { TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL } from "@/lib/constants";
import { TaskModal, type TaskPermFlags } from "./TaskModal";
import type { TaskCardData } from "./TaskCard";

type ArchivedTask = TaskCardData & { columnName: string; completedAt: string | null };

export function ArchivedTasksList({
  users,
  projects,
  perms,
}: {
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  perms: TaskPermFlags;
}) {
  const [tasks, setTasks] = useState<ArchivedTask[] | null>(null);
  const [active, setActive] = useState<ArchivedTask | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    listArchivedTasks().then((t) => setTasks(t as unknown as ArchivedTask[]));
  }

  useEffect(refresh, []);

  async function handleUnarchive(id: string) {
    setBusyId(id);
    await unarchiveTask(id);
    refresh();
    setBusyId(null);
  }

  if (tasks === null) {
    return <div className="p-5 text-sm text-muted">Загрузка архива…</div>;
  }

  if (tasks.length === 0) {
    return <div className="p-5 text-sm text-muted">В архиве пока пусто</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <p className="mb-3 text-xs text-muted">
        Архивные задачи не отображаются на доске у исполнителей, но всё их содержимое
        (комментарии, вложения, дедлайны) сохраняется.
      </p>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm"
          >
            <button onClick={() => setActive(t)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">{t.title}</span>
                {t.completedAt && (
                  <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    выполнено
                  </span>
                )}
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: TASK_PRIORITY_COLOR[t.priority],
                    background: `${TASK_PRIORITY_COLOR[t.priority]}1a`,
                  }}
                >
                  {TASK_PRIORITY_LABEL[t.priority]}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {t.assigneeName ?? "без исполнителя"}
                {t.projectName && ` · ${t.projectName}`} · было в «{t.columnName}»
              </div>
            </button>
            {(perms.role === "ADMIN" ||
              perms.editTasksOthers ||
              (perms.editTasksSelf && t.assigneeId === perms.userId)) && (
              <button
                onClick={() => handleUnarchive(t.id)}
                disabled={busyId === t.id}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                Восстановить
              </button>
            )}
          </div>
        ))}
      </div>

      {active && (
        <TaskModal
          task={active}
          columnName={active.columnName}
          users={users}
          projects={projects}
          perms={perms}
          onClose={() => {
            setActive(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
