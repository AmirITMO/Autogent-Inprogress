// Общая логика инцидентов, используемая и серверными экшенами (lib/actions/support.ts,
// авторизация через сессию), и интеграционными роутами (app/api/support/*, авторизация
// через heartbeatToken/cron-секрет) — сами роуты сессии не имеют, поэтому этот файл
// намеренно НЕ "use server" и ничего не знает про requireUser().
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import type { TaskPriority } from "@prisma/client";

type DeploymentForNotify = { id: string; assignedToId: string | null; lead: { title: string } };

// Не открывает новый инцидент поверх уже открытого — иначе каждый неудачный
// heartbeat (раз в несколько минут, пока сервис лежит) плодил бы дубликаты
// вместо одной записи с одним таймлайном.
export async function ensureOpenIncident(
  deployment: DeploymentForNotify,
  data: { title: string; detail?: string; severity: TaskPriority }
): Promise<{ created: boolean }> {
  const existing = await prisma.supportIncident.findFirst({
    where: { deploymentId: deployment.id, resolvedAt: null, autoDetected: true },
  });
  if (existing) {
    await prisma.supportIncident.update({
      where: { id: existing.id },
      data: { detail: data.detail ?? existing.detail },
    });
    return { created: false };
  }

  await prisma.supportIncident.create({
    data: {
      deploymentId: deployment.id,
      title: data.title,
      detail: data.detail,
      severity: data.severity,
      autoDetected: true,
    },
  });
  await notifyAboutIncident(deployment, data.title);
  return { created: true };
}

export async function autoResolveIncidents(deploymentId: string) {
  await prisma.supportIncident.updateMany({
    where: { deploymentId, resolvedAt: null, autoDetected: true },
    data: { resolvedAt: new Date(), rootCause: "Восстановлено автоматически (heartbeat OK)" },
  });
}

export async function notifyAboutIncident(
  deployment: DeploymentForNotify,
  title: string,
  excludeUserId?: string
) {
  const recipients = deployment.assignedToId
    ? [deployment.assignedToId]
    : (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);

  for (const userId of recipients) {
    if (userId === excludeUserId) continue;
    await notifyUser({
      userId,
      type: "INCIDENT_ALERT",
      title: `Инцидент: ${deployment.lead.title}`,
      body: title,
      link: `/support/${deployment.id}`,
    });
  }
}
