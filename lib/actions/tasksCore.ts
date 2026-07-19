import { prisma } from "@/lib/prisma";
import { getPermissions, assertCanEditTask } from "@/lib/roles";
import { DONE_COLUMN_NAME, TASK_PRIORITY_LABEL } from "@/lib/constants";

export type Actor = { id: string; role: "ADMIN" | "EMPLOYEE" };

const MAX_ESTIMATE_HOURS = 2400;

// Общая бизнес-логика задач, переиспользуемая server actions (сайт) и
// app/api/bot/* (Telegram-бот) — один и тот же код, права и побочные эффекты
// для обоих каналов, никакого дублирования.

export async function createTaskCore(
  actor: Actor,
  data: {
    columnId: string;
    title: string;
    description?: string;
    projectId?: string;
    assigneeId?: string;
    priority?: "P0" | "P1" | "P2" | "P3";
    isBug?: boolean;
    estimateHours?: number | null;
    dueDate?: string | null;
  }
) {
  const perms = await getPermissions(actor.id, actor.role);
  if (actor.role !== "ADMIN" && !perms.editTasksSelf && !perms.editTasksOthers) {
    throw new Error("Forbidden");
  }

  let assigneeId = data.assigneeId;
  if (actor.role !== "ADMIN") {
    assigneeId = perms.editTasksOthers ? data.assigneeId || actor.id : actor.id;
  }

  const last = await prisma.task.findFirst({
    where: { columnId: data.columnId },
    orderBy: { order: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      columnId: data.columnId,
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      assigneeId,
      priority: data.priority,
      isBug: data.isBug,
      estimateHours: data.estimateHours ?? undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      order: (last?.order ?? 0) + 1,
    },
  });

  return task;
}

export async function moveTaskCore(actor: Actor, taskId: string, toColumnId: string, toIndex: number) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(actor.id, actor.role, task.assigneeId);
  const toColumn = await prisma.taskColumn.findUniqueOrThrow({ where: { id: toColumnId } });

  const siblings = await prisma.task.findMany({
    where: { columnId: toColumnId, id: { not: taskId } },
    orderBy: { order: "asc" },
  });
  siblings.splice(toIndex, 0, { ...task, columnId: toColumnId });

  await prisma.$transaction(
    siblings.map((s, idx) =>
      prisma.task.update({ where: { id: s.id }, data: { order: idx, columnId: toColumnId } })
    )
  );

  await markCompletedIfNeeded(taskId, task, toColumn.name);
}

// Используется ботом: переносит задачу в колонку "Выполнено" того же борда,
// без пересчёта порядка соседей по всему борду (не нужно для бота — там нет
// drag&drop), но с тем же самым правом доступа и дедупом факта выполнения.
export async function completeTaskCore(actor: Actor, taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { column: true } });
  await assertCanEditTask(actor.id, actor.role, task.assigneeId);

  const doneColumn = await prisma.taskColumn.findFirstOrThrow({
    where: { boardId: task.column.boardId, name: DONE_COLUMN_NAME },
  });

  const last = await prisma.task.findFirst({
    where: { columnId: doneColumn.id },
    orderBy: { order: "desc" },
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { columnId: doneColumn.id, order: (last?.order ?? 0) + 1 },
  });

  await markCompletedIfNeeded(taskId, task, doneColumn.name);
}

async function markCompletedIfNeeded(
  taskId: string,
  task: { completedAt: Date | null; assigneeId: string | null; title: string },
  toColumnName: string
) {
  if (toColumnName === DONE_COLUMN_NAME && !task.completedAt) {
    const completedAt = new Date();
    await prisma.task.update({ where: { id: taskId }, data: { completedAt } });
    await prisma.taskCompletion.create({
      data: {
        taskId,
        userId: task.assigneeId,
        taskTitle: task.title,
        completedAt,
      },
    });
  }
}

export async function updateTaskCore(
  actor: Actor,
  taskId: string,
  data: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    priority?: "P0" | "P1" | "P2" | "P3";
    isBug?: boolean;
    estimateHours?: number | null;
    projectId?: string | null;
    dueDate?: string | null;
  }
): Promise<{ error: string } | { error?: undefined; task: Awaited<ReturnType<typeof prisma.task.update>> }> {
  const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(actor.id, actor.role, before.assigneeId);

  if (actor.role !== "ADMIN") {
    const perms = await getPermissions(actor.id, actor.role);
    if (data.assigneeId === null) {
      return { error: "У задачи должен быть исполнитель" };
    }
    if (data.assigneeId && !perms.editTasksOthers && data.assigneeId !== actor.id) {
      return { error: "Вы можете назначать задачи только на себя" };
    }
  }

  if (data.dueDate) {
    const due = new Date(data.dueDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (Number.isNaN(due.getTime()) || due < startOfToday) {
      return { error: "Дедлайн не может быть в прошлом" };
    }
  }

  if (data.estimateHours != null) {
    if (
      !Number.isInteger(data.estimateHours) ||
      data.estimateHours < 0 ||
      data.estimateHours > MAX_ESTIMATE_HOURS
    ) {
      return { error: `Оценка в часах должна быть целым числом от 0 до ${MAX_ESTIMATE_HOURS}` };
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
    },
  });

  if (data.assigneeId && data.assigneeId !== before.assigneeId && data.assigneeId !== actor.id) {
    const deadlineText = updated.dueDate
      ? `, срок до ${updated.dueDate.toLocaleDateString("ru-RU")}`
      : "";
    await prisma.notification.create({
      data: {
        userId: data.assigneeId,
        type: "TASK_ASSIGNED",
        title: `Вам поставили задачу «${updated.title}»`,
        body: `Приоритет: ${TASK_PRIORITY_LABEL[updated.priority]}${deadlineText}`,
        link: `/tasks?task=${taskId}`,
      },
    });
  }

  return { task: updated };
}

export async function deleteTaskCore(actor: Actor, taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(actor.id, actor.role, task.assigneeId);
  await prisma.task.delete({ where: { id: taskId } });
}

export async function archiveTaskCore(actor: Actor, taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(actor.id, actor.role, task.assigneeId);
  await prisma.task.update({ where: { id: taskId }, data: { archived: true } });
}

export async function unarchiveTaskCore(actor: Actor, taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(actor.id, actor.role, task.assigneeId);
  await prisma.task.update({ where: { id: taskId }, data: { archived: false } });
}
