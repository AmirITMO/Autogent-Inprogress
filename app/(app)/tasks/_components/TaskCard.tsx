import Image from "next/image";
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
  assigneeAvatarUrl?: string | null;
  projectId: string | null;
  projectName: string | null;
  commentCount: number;
  attachmentCount?: number;
};

export function blankTaskCard(id: string): TaskCardData {
  return {
    id,
    title: "",
    description: null,
    priority: "P2",
    isBug: false,
    estimateHours: null,
    dueDate: null,
    order: 0,
    assigneeId: null,
    assigneeName: null,
    assigneeAvatarUrl: null,
    projectId: null,
    projectName: null,
    commentCount: 0,
    attachmentCount: 0,
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={22}
        height={22}
        unoptimized
        className="h-[22px] w-[22px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
      {initials(name)}
    </span>
  );
}

export function TaskCard({
  task,
  dragging,
  done,
  onOpen,
}: {
  task: TaskCardData;
  dragging?: boolean;
  done?: boolean;
  onOpen: () => void;
}) {
  // Выполненная задача не может считаться просроченной, даже если дедлайн уже прошёл.
  const overdue = !done && task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md ${
        dragging ? "shadow-xl" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug text-foreground">{task.title}</div>
        {task.assigneeName && <Avatar name={task.assigneeName} avatarUrl={task.assigneeAvatarUrl} />}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
            🐞 Баг
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
        {!!task.attachmentCount && (
          <span className="text-[10px] text-muted">📎 {task.attachmentCount}</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">{task.projectName ?? ""}</span>
        {task.dueDate && (
          <span className={overdue ? "font-medium text-danger" : ""}>
            до {new Date(task.dueDate).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
    </button>
  );
}
