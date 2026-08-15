import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyIntegrationApiKey(req, "INSTAGRAM_AGENT_API_KEY");
    const { id } = await params;

    const body = (await req.json()) as { foundCount?: number; errorMessage?: string };
    if (!Number.isInteger(body.foundCount) || (body.foundCount as number) < 0) {
      return Response.json({ error: "foundCount must be a non-negative integer" }, { status: 400 });
    }

    const job = await prisma.instagramScrapeJob.findUnique({ where: { id } });
    if (!job) {
      return Response.json({ error: "unknown_job" }, { status: 404 });
    }

    // Идемпотентно — повторный вызов (ретрай сети со стороны сервиса) просто
    // перезаписывает итог, а не падает ошибкой.
    const updated = await prisma.instagramScrapeJob.update({
      where: { id },
      data: {
        status: body.errorMessage ? "FAILED" : "DONE",
        foundCount: body.foundCount,
        errorMessage: body.errorMessage ?? null,
      },
    });

    return Response.json({ id: updated.id, status: updated.status, foundCount: updated.foundCount });
  } catch (err) {
    return integrationError(err);
  }
}
