"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function listNotifications() {
  const user = await requireUser();
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return { items, unreadCount };
}

export async function getUnreadNotificationCount() {
  const user = await requireUser();
  return prisma.notification.count({ where: { userId: user.id, read: false } });
}

// Id задач с непрочитанными уведомлениями о комментариях — для точки "новый
// комментарий" на карточке задачи (доска/"Мои задачи"). Ссылка хранится как
// "/tasks?task=<id>", отдельного taskId в модели Notification нет.
export async function getUnreadCommentTaskIds(): Promise<Set<string>> {
  const user = await requireUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, type: "TASK_COMMENT", read: false },
    select: { link: true },
  });
  const ids = new Set<string>();
  for (const { link } of rows) {
    const taskId = link?.match(/[?&]task=([^&]+)/)?.[1];
    if (taskId) ids.add(taskId);
  }
  return ids;
}

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { read: true },
  });
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/dashboard");
}

// Открыли задачу на доске — гасим непрочитанные уведомления о комментариях
// именно к ней (не через колокольчик, а прямым переходом с карточки).
export async function markTaskCommentNotificationsRead(taskId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, type: "TASK_COMMENT", read: false, link: `/tasks?task=${taskId}` },
    data: { read: true },
  });
  revalidatePath("/tasks");
  revalidatePath("/my");
}
