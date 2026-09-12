"use client";

import { useMemo, useState } from "react";
import { TASK_PRIORITIES, DONE_COLUMN_NAME } from "@/lib/constants";
import { TaskCard, type TaskCardData } from "./TaskCard";

type SortMode = "" | "priority" | "newest" | "oldest" | "dueDate";

const SORT_LABEL: Record<SortMode, string> = {
  "": "Без сортировки",
  priority: "По важности",
  newest: "Сначала новые",
  oldest: "Сначала старые",
  dueDate: "По дедлайну",
};

export function ColumnExpandModal({
  column,
  users,
  viewerId,
  viewerIsAdmin,
  onToggleReaction,
  onOpenTask,
  onClose,
}: {
  column: { id: string; title: string; tasks: TaskCardData[] };
  users: { id: string; name: string }[];
  viewerId: string;
  viewerIsAdmin: boolean;
  onToggleReaction: (taskId: string) => void;
  onOpenTask: (task: TaskCardData) => void;
  onClose: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("");
  const [onlyBugs, setOnlyBugs] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const done = column.title === DONE_COLUMN_NAME;
  // Снимок "сейчас" на момент открытия модалки — не пересчитываем на каждый
  // рендер (иначе impure-вызов Date.now() прямо в теле useMemo).
  const [now] = useState(() => Date.now());

  const tasks = useMemo(() => {
    let list = column.tasks.filter((t) => {
      if (assigneeId && t.assigneeId !== assigneeId) return false;
      if (onlyBugs && !t.isBug) return false;
      if (onlyOverdue && !(t.dueDate && !done && new Date(t.dueDate).getTime() < now)) return false;
      return true;
    });

    if (sortMode === "priority") {
      list = [...list].sort(
        (a, b) => TASK_PRIORITIES.indexOf(a.priority as (typeof TASK_PRIORITIES)[number]) -
          TASK_PRIORITIES.indexOf(b.priority as (typeof TASK_PRIORITIES)[number])
      );
    } else if (sortMode === "newest") {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortMode === "oldest") {
      list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortMode === "dueDate") {
      // Ближайшие дедлайны сначала, просроченные — в конец (среди них тоже
      // по дате), без дедлайна — совсем в конец.
      list = [...list].sort((a, b) => {
        const aOverdue = !!a.dueDate && new Date(a.dueDate).getTime() < now;
        const bOverdue = !!b.dueDate && new Date(b.dueDate).getTime() < now;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        if (aOverdue !== bOverdue) return aOverdue ? 1 : -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    }

    return list;
  }, [column.tasks, assigneeId, sortMode, onlyBugs, onlyOverdue, done, now]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 sm:p-8">
      <div className="flex h-full w-full max-w-[1600px] flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{column.title}</h2>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
              {tasks.length}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">Все исполнители</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          >
            {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
              <option key={m} value={m}>
                {SORT_LABEL[m]}
              </option>
            ))}
          </select>
          <button
            onClick={() => setOnlyBugs((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              onlyBugs
                ? "border-danger bg-danger/10 text-danger"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            Баги
          </button>
          {!done && (
            <button
              onClick={() => setOnlyOverdue((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                onlyOverdue
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              Просрочено
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tasks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Нет задач по выбранным фильтрам
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  done={done}
                  onOpen={() => onOpenTask(task)}
                  viewerId={viewerId}
                  viewerIsAdmin={viewerIsAdmin}
                  onToggleReaction={onToggleReaction}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
