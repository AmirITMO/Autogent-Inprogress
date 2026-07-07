"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { DONE_COLUMN_NAME, TASK_PRIORITY_LABEL } from "@/lib/constants";

export async function createTask(data: {
  columnId: string;
  title: string;
  projectId?: string;
  assigneeId?: string;
}) {
  await requireUser();
  const last = await prisma.task.findFirst({
    where: { columnId: data.columnId },
    orderBy: { order: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      columnId: data.columnId,
      title: data.title,
      projectId: data.projectId,
      assigneeId: data.assigneeId,
      order: (last?.order ?? 0) + 1,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/my");
  return task;
}

export async function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  await requireUser();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
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

  // Факт выполнения фиксируется один раз и навсегда: перекладывание туда-сюда
  // между "Выполнено" и другими колонками больше не плодит повторных зачётов.
  if (toColumn.name === DONE_COLUMN_NAME && !task.completedAt) {
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

  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

const MAX_ESTIMATE_HOURS = 2400;

export async function updateTask(
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
): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

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

  // Уведомляем нового исполнителя, если его назначили именно сейчас (и не сам себе).
  if (
    data.assigneeId &&
    data.assigneeId !== before.assigneeId &&
    data.assigneeId !== user.id
  ) {
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

  revalidatePath("/tasks");
  revalidatePath("/my");
  return {};
}

export async function deleteTask(taskId: string) {
  await requireUser();
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

export async function archiveTask(taskId: string) {
  await requireUser();
  await prisma.task.update({ where: { id: taskId }, data: { archived: true } });
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

export async function unarchiveTask(taskId: string) {
  await requireUser();
  await prisma.task.update({ where: { id: taskId }, data: { archived: false } });
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

export async function listArchivedTasks() {
  await requireUser();
  const tasks = await prisma.task.findMany({
    where: { archived: true },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      column: true,
      project: true,
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    isBug: t.isBug,
    estimateHours: t.estimateHours ? Number(t.estimateHours) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    order: t.order,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    assigneeAvatarUrl: t.assignee?.avatarUrl ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    commentCount: t._count.comments,
    attachmentCount: t._count.attachments,
    columnName: t.column.name,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  }));
}

const COMMENT_AUTHOR_SELECT = { select: { id: true, name: true, avatarUrl: true } };
const COMMENT_ATTACHMENTS_SELECT = {
  select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
  orderBy: { createdAt: "asc" as const },
};

export async function addTaskComment(
  taskId: string,
  text: string,
  attachmentUrl?: string,
  attachmentIds?: string[]
) {
  const user = await requireUser();
  const comment = await prisma.taskComment.create({
    data: { taskId, userId: user.id, text, attachmentUrl },
  });

  if (attachmentIds?.length) {
    await prisma.taskAttachment.updateMany({
      where: { id: { in: attachmentIds }, taskId },
      data: { commentId: comment.id },
    });
  }

  const full = await prisma.taskComment.findUniqueOrThrow({
    where: { id: comment.id },
    include: { user: COMMENT_AUTHOR_SELECT, attachments: COMMENT_ATTACHMENTS_SELECT },
  });

  revalidatePath("/tasks");
  return full;
}

export async function getTaskComments(taskId: string) {
  await requireUser();
  return prisma.taskComment.findMany({
    where: { taskId },
    include: { user: COMMENT_AUTHOR_SELECT, attachments: COMMENT_ATTACHMENTS_SELECT },
    orderBy: { createdAt: "asc" },
  });
}
