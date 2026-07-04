"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

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

  revalidatePath("/tasks");
  revalidatePath("/my");
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
) {
  await requireUser();
  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
    },
  });
  revalidatePath("/tasks");
  revalidatePath("/my");
}

export async function deleteTask(taskId: string) {
  await requireUser();
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/tasks");
  revalidatePath("/my");
}

export async function addTaskComment(taskId: string, text: string, attachmentUrl?: string) {
  const user = await requireUser();
  const comment = await prisma.taskComment.create({
    data: { taskId, userId: user.id, text, attachmentUrl },
    include: { user: true },
  });
  revalidatePath("/tasks");
  return comment;
}

export async function getTaskComments(taskId: string) {
  await requireUser();
  return prisma.taskComment.findMany({
    where: { taskId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}
