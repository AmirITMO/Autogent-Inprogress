"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function listTaskNodes(taskId: string) {
  await requireUser();
  return prisma.taskNode.findMany({ where: { taskId } });
}

export async function createTaskNode(data: {
  taskId: string;
  parentId?: string | null;
  title: string;
  x: number;
  y: number;
  dueDate?: string | null;
}) {
  await requireUser();
  const node = await prisma.taskNode.create({
    data: {
      taskId: data.taskId,
      parentId: data.parentId ?? null,
      title: data.title,
      x: data.x,
      y: data.y,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });
  revalidatePath("/tasks");
  return node;
}

export async function updateTaskNode(
  id: string,
  data: { title?: string; dueDate?: string | null; done?: boolean }
) {
  await requireUser();
  const node = await prisma.taskNode.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
    },
  });
  revalidatePath("/tasks");
  return node;
}

export async function moveTaskNode(id: string, x: number, y: number) {
  await requireUser();
  await prisma.taskNode.update({ where: { id }, data: { x, y } });
}

export async function deleteTaskNode(id: string) {
  await requireUser();
  await prisma.taskNode.delete({ where: { id } });
  revalidatePath("/tasks");
}
