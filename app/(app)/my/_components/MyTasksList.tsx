"use client";

import { useState } from "react";
import { TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL, DONE_COLUMN_NAME } from "@/lib/constants";
import { TaskModal } from "../../tasks/_components/TaskModal";
import type { TaskCardData } from "../../tasks/_components/TaskCard";

type MyTask = TaskCardData & { columnName: string };

export function MyTasksList({
  tasks,
  users,
  projects,
}: {
  tasks: MyTask[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const [active, setActive] = useState<MyTask | null>(null);
  const open = tasks.filter((t) => t.columnName !== DONE_COLUMN_NAME);
  const done = tasks.filter((t) => t.columnName === DONE_COLUMN_NAME);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <Section title={`Активные (${open.length})`} tasks={open} onOpen={setActive} />
      <Section title={`Выполненные (${done.length})`} tasks={done} onOpen={setActive} muted />

      {active && (
        <TaskModal
          task={active}
          columnName={active.columnName}
          users={users}
          projects={projects}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  tasks,
  onOpen,
  muted,
}: {
  title: string;
  tasks: MyTask[];
  onOpen: (t: MyTask) => void;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => {
          // Выполненная задача не может считаться просроченной.
          const overdue =
            t.columnName !== DONE_COLUMN_NAME && t.dueDate && new Date(t.dueDate) < new Date();
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              className={`flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-sm transition hover:border-accent/50 ${
                muted ? "opacity-60" : ""
              }`}
            >
              <div>
                <div className="text-sm font-medium text-foreground">{t.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>{t.columnName}</span>
                  {t.projectName && <span>· {t.projectName}</span>}
                  {t.isBug && <span className="text-danger">· баг</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: TASK_PRIORITY_COLOR[t.priority],
                    background: `${TASK_PRIORITY_COLOR[t.priority]}1a`,
                  }}
                >
                  {TASK_PRIORITY_LABEL[t.priority]}
                </span>
                {t.dueDate && (
                  <span className={`text-xs ${overdue ? "font-medium text-danger" : "text-muted"}`}>
                    до {new Date(t.dueDate).toLocaleDateString("ru-RU")}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
