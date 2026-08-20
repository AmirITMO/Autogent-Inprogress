import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "FAILED"] as const;
type JobStatus = (typeof VALID_STATUSES)[number];

// Зеркало /api/integrations/instagram-agent/jobs — сервис сам опрашивает CRM
// за новыми заданиями (pull), CRM только кладёт задание в очередь по кнопке
// «Спарсить N компаний». Критерии поиска здесь не передаются в задании —
// агент сам читает их из GET .../knowledge-base по channelId.
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "B2B_EMAIL_AGENT_API_KEY");

    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status");
    if (!rawStatus?.trim()) {
      return Response.json({ error: "status required" }, { status: 400 });
    }
    const status = rawStatus.toUpperCase() as JobStatus;
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }

    const jobs = await prisma.b2bEmailSearchJob.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    // "Claim on read" — тот же приём, что у Instagram-заданий: выдача сразу
    // переводит PENDING в IN_PROGRESS, чтобы следующий цикл опроса не
    // подобрал то же задание второй раз, пока предыдущее ещё обрабатывается.
    if (status === "PENDING" && jobs.length > 0) {
      await prisma.b2bEmailSearchJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { status: "IN_PROGRESS" },
      });
    }

    return Response.json({
      jobs: jobs.map((j) => ({ id: j.id, channelId: j.channelId, requestedCount: j.requestedCount })),
    });
  } catch (err) {
    return integrationError(err);
  }
}
