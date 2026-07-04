"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";

export async function createEmployee(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "EMPLOYEE";
}) {
  await requireAdmin();
  const passwordError = validatePasswordStrength(data.password);
  if (passwordError) throw new Error(passwordError);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hash(data.password, 10),
      role: data.role,
    },
  });
  revalidatePath("/employees");
}

export async function toggleEmployeeBlocked(userId: string, isBlocked: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { isBlocked } });
  revalidatePath("/employees");
}

export async function deleteEmployee(userId: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/employees");
}

export async function setProjectAccess(userId: string, projectIds: string[]) {
  await requireAdmin();
  await prisma.projectMember.deleteMany({ where: { userId } });
  if (projectIds.length > 0) {
    await prisma.projectMember.createMany({
      data: projectIds.map((projectId) => ({ userId, projectId })),
    });
  }
  revalidatePath("/employees");
}
