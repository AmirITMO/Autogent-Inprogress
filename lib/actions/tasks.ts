"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import {
  createTaskCore,
  moveTaskCore,
  updateTaskCore,
  deleteTaskCore,
  archiveTaskCore,
  unarchiveTaskCore,
} from "./tasksCore";

export async function createTask(data: {
  columnId: string;
  title: string;
  projectId?: string;
  assigneeId?: string;
}) {
  const user = await requireUser();
  const task = await createTaskCore(user, data);
  revalidatePath("/tasks");
  revalidatePath("/my");
  return task;
}

export async function moveTask(taskId: string, toColumnId: string, toIndex: number) {
  const user = await requireUser();
  await moveTaskCore(user, taskId, toColumnId, toIndex);
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

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
  const result = await updateTaskCore(user, taskId, data);
  if (result.error) return { error: result.error };

  revalidatePath("/tasks");
  revalidatePath("/my");
  return {};
}

export async function deleteTask(taskId: string) {
  const user = await requireUser();
  await deleteTaskCore(user, taskId);
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

export async function archiveTask(taskId: string) {
  const user = await requireUser();
  await archiveTaskCore(user, taskId);
  revalidatePath("/tasks");
  revalidatePath("/my");
  revalidatePath("/dashboard");
}

export async function unarchiveTask(taskId: string) {
  const user = await requireUser();
  await unarchiveTaskCore(user, taskId);
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
    projectName: t.project && t.project.name !== "Общий" ? t.project.name : null,
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
