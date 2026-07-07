import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Роль читается заново из БД при каждом запросе, а не берётся из JWT-сессии:
// JWT выставляется один раз при логине и не обновляется автоматически, поэтому
// смена роли админом (EMPLOYEE -> ADMIN и обратно) без этого не отражалась бы
// до следующего перелогина пользователя.
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const fresh = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!fresh) throw new Error("Unauthorized");
  return { ...session.user, role: fresh.role };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

export type PermissionFlags = {
  editTasksSelf: boolean;
  viewAccounting: boolean;
  viewChannels: boolean;
  editCrm: boolean;
  editTasksOthers: boolean;
};

const ADMIN_PERMISSIONS: PermissionFlags = {
  editTasksSelf: true,
  viewAccounting: true,
  viewChannels: true,
  editCrm: true,
  editTasksOthers: true,
};

// Права читаются напрямую из БД (не из JWT-сессии), чтобы их смена админом
// отражалась сразу у сотрудника, без повторного логина.
export async function getPermissions(userId: string, role: "ADMIN" | "EMPLOYEE"): Promise<PermissionFlags> {
  if (role === "ADMIN") return ADMIN_PERMISSIONS;
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      editTasksSelf: true,
      viewAccounting: true,
      viewChannels: true,
      editCrm: true,
      editTasksOthers: true,
    },
  });
}

// Для серверных страниц (Accounting/Channels) — если доступа нет, вкладки не
// существует даже по прямой ссылке: редиректим до рендера какого-либо контента.
export async function requirePagePermission(perm: keyof PermissionFlags) {
  const user = await requireUser();
  const perms = await getPermissions(user.id, user.role);
  if (!perms[perm]) redirect("/dashboard");
  return { user, perms };
}

// Может ли пользователь редактировать/двигать/удалять/архивировать конкретную задачу
// (и её вложения). ADMIN — всегда; editTasksOthers — любую; editTasksSelf — только
// задачи, где он исполнитель. Без этих прав — только просмотр и комментирование.
export async function assertCanEditTask(
  userId: string,
  role: "ADMIN" | "EMPLOYEE",
  assigneeId: string | null
) {
  if (role === "ADMIN") return;
  const perms = await getPermissions(userId, role);
  if (perms.editTasksOthers) return;
  if (perms.editTasksSelf && assigneeId === userId) return;
  throw new Error("Forbidden");
}
