import { TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL } from "@/lib/constants";

export type TaskCardData = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  isBug: boolean;
  estimateHours: number | null;
  dueDate: string | null;
  order: number;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
  commentCount: number;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function TaskCard({
  task,
  dragging,
  onOpen,
}: {
  task: TaskCardData;
  dragging?: boolean;
  onOpen: () => void;
}) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-lg border border-border bg-surface p-3 text-left shadow-sm transition hover:border-accent/50 ${
        dragging ? "shadow-xl" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{task.title}</div>
        {task.assigneeName && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
            {initials(task.assigneeName)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            color: TASK_PRIORITY_COLOR[task.priority],
            background: `${TASK_PRIORITY_COLOR[task.priority]}1a`,
          }}
        >
          {TASK_PRIORITY_LABEL[task.priority]}
        </span>
        {task.isBug && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
            Баг
          </span>
        )}
        {task.estimateHours != null && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
            {task.estimateHours}ч
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="text-[10px] text-muted">💬 {task.commentCount}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span>{task.projectName ?? ""}</span>
        {task.dueDate && (
          <span className={overdue ? "font-medium text-danger" : ""}>
            до {new Date(task.dueDate).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
    </button>
  );
}
