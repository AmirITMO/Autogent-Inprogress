import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";
import { ensureOpenIncident } from "@/lib/support/incidents";

// Ловит случай "процесс на клиентском сервере тихо умер и больше не шлёт
// heartbeat вообще" — heartbeat-роут такое не увидит сам по себе, нужен
// внешний сторож. Дергается системным cron на сервере платформы раз в
// несколько минут, например:
//   */5 * * * * curl -s -X GET -H "x-api-key: $SUPPORT_CRON_SECRET" \
//     https://<платформа>/api/support/check-stale
// Секрет — переменная окружения SUPPORT_CRON_SECRET (см. verifyIntegrationApiKey).
// Сам роут внешний по отношению к остальной платформе — намеренно не
// хранит состояние "когда проверяли в прошлый раз" в БД.
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "SUPPORT_CRON_SECRET");

    const deployments = await prisma.supportedDeployment.findMany({
      where: { status: { not: "DOWN" } },
      select: {
        id: true,
        assignedToId: true,
        lastHeartbeatAt: true,
        createdAt: true,
        heartbeatEverySeconds: true,
        lead: { select: { title: true } },
      },
    });

    const now = Date.now();
    let flagged = 0;

    for (const d of deployments) {
      // 3 пропущенных подряд пинга — не один: единичная сетевая заминка на
      // клиентском сервере не должна сразу поднимать P0-инцидент.
      const graceMs = d.heartbeatEverySeconds * 3 * 1000;
      const since = d.lastHeartbeatAt ?? d.createdAt;
      if (now - since.getTime() < graceMs) continue;

      await prisma.supportedDeployment.update({
        where: { id: d.id },
        data: { status: "DOWN", lastStatusDetail: "Нет heartbeat дольше ожидаемого интервала" },
      });
      await ensureOpenIncident(
        { id: d.id, assignedToId: d.assignedToId, lead: d.lead },
        { title: "Пропали heartbeat-пинги", severity: "P0" }
      );
      flagged++;
    }

    return Response.json({ checked: deployments.length, flagged });
  } catch (err) {
    return integrationError(err);
  }
}
