"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import { DONE_COLUMN_NAME } from "@/lib/constants";

export type EmployeePermissions = {
  editTasksSelf: boolean;
  viewAccounting: boolean;
  viewChannels: boolean;
  editCrm: boolean;
  editTasksOthers: boolean;
};

export async function createEmployee(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "EMPLOYEE";
  permissions: EmployeePermissions;
}): Promise<{ error: string } | { error?: undefined }> {
  await requireAdmin();
  const passwordError = validatePasswordStrength(data.password);
  if (passwordError) return { error: passwordError };

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { error: "Сотрудник с таким email уже существует" };

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hash(data.password, 10),
      role: data.role,
      ...data.permissions,
    },
  });
  revalidatePath("/settings");
  return {};
}

export async function deleteEmployee(userId: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/settings");
}

export async function setProjectAccess(userId: string, projectIds: string[]) {
  await requireAdmin();
  await prisma.projectMember.deleteMany({ where: { userId } });
  if (projectIds.length > 0) {
    await prisma.projectMember.createMany({
      data: projectIds.map((projectId) => ({ userId, projectId })),
    });
  }
  revalidatePath("/settings");
}

export async function setEmployeePermissions(userId: string, permissions: Partial<EmployeePermissions>) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: permissions });
  revalidatePath("/settings");
}

export async function getEmployeeReport(userId: string) {
  await requireAdmin();
  const [completedCount, tasks] = await Promise.all([
    prisma.taskCompletion.count({ where: { userId } }),
    prisma.task.findMany({
      where: { assigneeId: userId, archived: false },
      include: { column: true },
    }),
  ]);
  const openTasks = tasks.filter((t) => t.column.name !== DONE_COLUMN_NAME);
  const overdueCount = openTasks.filter((t) => t.dueDate && t.dueDate < new Date()).length;
  return {
    completedCount,
    openCount: openTasks.length,
    overdueCount,
  };
}
