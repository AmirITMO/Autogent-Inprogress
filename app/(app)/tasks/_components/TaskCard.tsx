import Image from "next/image";
import { TASK_PRIORITY_COLOR, TASK_PRIORITY_LABEL, TASK_COLOR_STYLE, type TaskColorId } from "@/lib/constants";
import { IconBug, IconComment, IconPaperclip, IconHeart } from "@/components/icons";
import { toMoscowParts } from "@/lib/moscowTime";

export type TaskReactionData = { userId: string; name: string; avatarUrl: string | null };

export type TaskCardData = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  color: TaskColorId | null;
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
  createdAt: string;
  updatedAt: string;
  hasUnreadComment?: boolean;
  reactions: TaskReactionData[];
};

export function blankTaskCard(id: string): TaskCardData {
  return {
    id,
    title: "",
    description: null,
    priority: "P2",
    color: null,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reactions: [],
  };
}

// Время последнего изменения задачи (переезд между колонками, редактирование
// полей и т.п.) — Prisma сама обновляет Task.updatedAt на каждый update(),
// так что это уже фактически "время последнего движения" без отдельного поля.
function formatUpdatedAt(iso: string) {
  const { dateKey, timeLabel } = toMoscowParts(iso);
  const [y, m, d] = dateKey.split("-");
  return `${timeLabel} ${d}.${m}.${y}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({
  name,
  avatarUrl,
  size = 22,
  ring,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const ringClass = ring ? "ring-2 ring-surface" : "";
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        unoptimized
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${ringClass}`}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${ringClass}`}
    >
      {initials(name)}
    </span>
  );
}

// "Домино"-стек аватарок оценивших админов: каждая следующая перекрывает
// предыдущую на четверть своей ширины (и только предыдущую — следующие за
// ней аватарки её уже не задевают), так что видно минимум 75% каждой.
// Последняя (самая новая реакция) — на переднем плане.
const REACTION_AVATAR_SIZE = 18;
function ReactionAvatars({ reactions }: { reactions: TaskReactionData[] }) {
  return (
    <div className="flex items-center">
      {reactions.map((r, i) => (
        <span
          key={r.userId}
          style={{ marginLeft: i === 0 ? 0 : -REACTION_AVATAR_SIZE * 0.25, zIndex: i }}
          className="relative"
          title={r.name}
        >
          <Avatar name={r.name} avatarUrl={r.avatarUrl} size={REACTION_AVATAR_SIZE} ring />
        </span>
      ))}
    </div>
  );
}

export function TaskCard({
  task,
  dragging,
  done,
  onOpen,
  viewerId,
  viewerIsAdmin,
  onToggleReaction,
}: {
  task: TaskCardData;
  dragging?: boolean;
  done?: boolean;
  onOpen: () => void;
  viewerId: string;
  viewerIsAdmin: boolean;
  onToggleReaction?: (taskId: string) => void;
}) {
  // Выполненная задача не может считаться просроченной, даже если дедлайн уже прошёл.
  const overdue = !done && task.dueDate && new Date(task.dueDate) < new Date();
  const colorStyle = task.color ? TASK_COLOR_STYLE[task.color] : null;
  const liked = task.reactions.some((r) => r.userId === viewerId);
  const showReactionRow = viewerIsAdmin || task.reactions.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={colorStyle ? { backgroundColor: colorStyle.bg, borderColor: colorStyle.border } : undefined}
      className={`w-full cursor-pointer rounded-xl border p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        colorStyle ? "" : "border-border bg-surface hover:border-accent/50"
      } ${dragging ? "shadow-xl" : ""
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
          <span className="flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
            <IconBug className="h-3 w-3" /> Баг
          </span>
        )}
        {task.estimateHours != null && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
            {task.estimateHours}ч
          </span>
        )}
        {task.commentCount > 0 && (
          <span
            className={`relative flex items-center gap-1 text-[10px] ${
              task.hasUnreadComment ? "font-medium text-accent" : "text-muted"
            }`}
          >
            <IconComment className="h-3 w-3" /> {task.commentCount}
            {task.hasUnreadComment && (
              <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-danger" title="Новый комментарий" />
            )}
          </span>
        )}
        {!!task.attachmentCount && (
          <span className="flex items-center gap-1 text-[10px] text-muted">
            <IconPaperclip className="h-3 w-3" /> {task.attachmentCount}
          </span>
        )}
      </div>

      {showReactionRow && (
        <div className="mt-2 flex items-center gap-1.5">
          {viewerIsAdmin ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleReaction?.(task.id);
              }}
              title={liked ? "Убрать оценку" : "Оценить задачу"}
              aria-label={liked ? "Убрать оценку" : "Оценить задачу"}
              className="flex h-5 w-5 shrink-0 items-center justify-center"
            >
              <IconHeart filled={liked} className={`h-4 w-4 ${liked ? "text-danger" : "text-foreground"}`} />
            </button>
          ) : (
            <IconHeart filled className="h-4 w-4 shrink-0 text-danger" />
          )}
          {task.reactions.length > 0 && <ReactionAvatars reactions={task.reactions} />}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">{task.projectName ?? ""}</span>
        {task.dueDate && (
          <span className={overdue ? "font-medium text-danger" : ""}>
            до {new Date(task.dueDate).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-muted/70">Изменено: {formatUpdatedAt(task.updatedAt)}</div>
    </div>
  );
}
