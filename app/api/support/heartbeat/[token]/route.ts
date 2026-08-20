import { prisma } from "@/lib/prisma";
import { ensureOpenIncident, autoResolveIncidents } from "@/lib/support/incidents";

const VALID_STATUSES = ["OK", "DEGRADED", "DOWN"] as const;
type HeartbeatStatus = (typeof VALID_STATUSES)[number];

// Клиентский сервис (см. support_heartbeat_client/) сам стучится сюда раз в
// heartbeatEverySeconds — токен в пути одновременно и идентифицирует
// деплой, и служит секретом (см. комментарий у heartbeatToken в schema.prisma).
// Публичный роут без сессии: единственная защита — сам токен.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const deployment = await prisma.supportedDeployment.findUnique({
    where: { heartbeatToken: token },
    select: { id: true, assignedToId: true, lead: { select: { title: true } } },
  });
  if (!deployment) return Response.json({ error: "not_found" }, { status: 404 });

  let body: { status?: string; detail?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const status = (body.status || "").toUpperCase();
  if (!VALID_STATUSES.includes(status as HeartbeatStatus)) {
    return Response.json({ error: "invalid_status" }, { status: 400 });
  }
  const detail = typeof body.detail === "string" ? body.detail.slice(0, 2000) : undefined;

  await prisma.supportedDeployment.update({
    where: { id: deployment.id },
    data: { status: status as HeartbeatStatus, lastHeartbeatAt: new Date(), lastStatusDetail: detail ?? null },
  });

  if (status === "OK") {
    await autoResolveIncidents(deployment.id);
  } else {
    await ensureOpenIncident(deployment, {
      title: status === "DOWN" ? "Сервис недоступен" : "Деградация сервиса",
      detail,
      severity: status === "DOWN" ? "P0" : "P1",
    });
  }

  return Response.json({ ok: true });
}
