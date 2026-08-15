import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "FAILED"] as const;
type JobStatus = (typeof VALID_STATUSES)[number];

// Сервис-парсер сам опрашивает CRM за новыми заданиями (pull) — CRM только
// кладёт задание в очередь по кнопке «Спарсить N» и никогда не стучится
// к сервису напрямую (у него нет публичного адреса).
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "INSTAGRAM_AGENT_API_KEY");

    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status");
    if (!rawStatus?.trim()) {
      return Response.json({ error: "status required" }, { status: 400 });
    }
    const status = rawStatus.toUpperCase() as JobStatus;
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }

    const jobs = await prisma.instagramScrapeJob.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { searchProfile: { select: { id: true, name: true, criteria: true } } },
    });

    // "Claim on read": выдача PENDING-заданий сразу переводит их в IN_PROGRESS —
    // единственный процесс-опросник не должен подобрать то же задание второй раз
    // на следующем цикле опроса, если предыдущая обработка ещё не завершена
    // (падение сервиса всё равно оставит задание "зависшим" в IN_PROGRESS, но
    // это уже видимо и не приводит к тихому повторному платному прогону).
    if (status === "PENDING" && jobs.length > 0) {
      await prisma.instagramScrapeJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { status: "IN_PROGRESS" },
      });
    }

    return Response.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        channelId: j.channelId,
        requestedCount: j.requestedCount,
        searchProfile: j.searchProfile,
      })),
    });
  } catch (err) {
    return integrationError(err);
  }
}
