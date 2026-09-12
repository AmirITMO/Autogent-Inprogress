"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/roles";
import { getEmployeeReportCore } from "./employees";

export async function getTeamOverview() {
  await requireUser();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { customRoles: { orderBy: { createdAt: "asc" } } },
  });

  const reports = await Promise.all(users.map((u) => getEmployeeReportCore(u.id)));

  return users.map((u, i) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    customRoles: u.customRoles.map((r) => ({ id: r.id, label: r.label })),
    ...reports[i],
  }));
}

export async function addCustomRole(userId: string, label: string) {
  await requireAdmin();
  const trimmed = label.trim();
  if (!trimmed) return;
  await prisma.userCustomRole.create({ data: { userId, label: trimmed.slice(0, 40) } });
  revalidatePath("/knowledge-base");
}

export async function removeCustomRole(roleId: string) {
  await requireAdmin();
  await prisma.userCustomRole.delete({ where: { id: roleId } });
  revalidatePath("/knowledge-base");
}
