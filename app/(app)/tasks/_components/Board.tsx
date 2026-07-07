"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { KanbanBoard, type KanbanColumnData } from "@/components/kanban/KanbanBoard";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, DONE_COLUMN_NAME } from "@/lib/constants";
import { createTask, moveTask } from "@/lib/actions/tasks";
import { TaskCard, blankTaskCard, type TaskCardData } from "./TaskCard";
import { TaskModal, type TaskPermFlags } from "./TaskModal";

type ColumnData = { id: string; title: string; tasks: TaskCardData[] };

export function TasksBoard({
  columns,
  users,
  projects,
  perms,
}: {
  columns: ColumnData[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  perms: TaskPermFlags;
}) {
  const canCreate = perms.role === "ADMIN" || perms.editTasksSelf || perms.editTasksOthers;
  function canEditTask(task: TaskCardData) {
    return (
      perms.role === "ADMIN" ||
      perms.editTasksOthers ||
      (perms.editTasksSelf && task.assigneeId === perms.userId)
    );
  }
  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null);
  const [activeColumnName, setActiveColumnName] = useState("");
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSetSearch = useDebouncedCallback((v: string) => setSearch(v), 250);

  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("");
  const [onlyBugs, setOnlyBugs] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  function openTask(task: TaskCardData, columnName: string) {
    setActiveTask(task);
    setActiveColumnName(columnName);
  }

  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId) return;
    for (const c of columns) {
      const found = c.tasks.find((t) => t.id === taskId);
      if (found) {
        openTask(found, c.title);
        break;
      }
    }
    router.replace("/tasks");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return columns.map((c) => ({
      ...c,
      tasks: c.tasks.filter((t) => {
        if (q && !t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q))
          return false;
        if (projectId && (t as unknown as { projectId?: string }).projectId !== projectId)
          return false;
        if (assigneeId && t.assigneeId !== assigneeId) return false;
        if (priority && t.priority !== priority) return false;
        if (onlyBugs && !t.isBug) return false;
        if (
          onlyOverdue &&
          !(t.dueDate && c.title !== DONE_COLUMN_NAME && new Date(t.dueDate) < new Date())
        )
          return false;
        return true;
      }),
    }));
  }, [columns, search, projectId, assigneeId, priority, onlyBugs, onlyOverdue]);

  function handleMove(taskId: string, toColumnId: string, toIndex: number) {
    startTransition(() => {
      moveTask(taskId, toColumnId, toIndex);
    });
  }

  async function handleCreate(columnId: string) {
    setCreatingIn(columnId);
    const created = await createTask({ columnId, title: "" });
    setCreatingIn(null);
    const col = columns.find((c) => c.id === columnId);
    openTask(blankTaskCard(created.id), col?.title ?? "");
  }

  const kanbanColumns: KanbanColumnData<TaskCardData>[] = filteredColumns.map((c) => ({
    id: c.id,
    title: c.title,
    items: c.tasks,
    headerExtra: canCreate ? (
      <button
        onClick={() => handleCreate(c.id)}
        disabled={creatingIn === c.id}
        title="Добавить задачу"
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
      >
        +
      </button>
    ) : undefined,
  }));

  return (
    <div className="min-h-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSetSearch(e.target.value);
          }}
          placeholder="Поиск по названию и описанию…"
          className="w-64 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        >
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        >
          <option value="">Все приоритеты</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABEL[p]}
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
      </div>

      <KanbanBoard
        columns={kanbanColumns}
        onMove={handleMove}
        canDrag={canEditTask}
        renderCard={(task, dragging) => {
          const col = columns.find((c) => c.tasks.some((t) => t.id === task.id));
          return (
            <TaskCard
              task={task}
              dragging={dragging}
              done={col?.title === DONE_COLUMN_NAME}
              onOpen={() => openTask(task, col?.title ?? "")}
            />
          );
        }}
      />

      {activeTask && (
        <TaskModal
          task={activeTask}
          columnName={activeColumnName}
          users={users}
          projects={projects}
          perms={perms}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}
