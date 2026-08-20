import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyIntegrationApiKey(req, "B2B_EMAIL_AGENT_API_KEY");
    const { id } = await params;

    const body = (await req.json()) as { foundCount?: number; errorMessage?: string };
    if (!Number.isInteger(body.foundCount) || (body.foundCount as number) < 0) {
      return Response.json({ error: "foundCount must be a non-negative integer" }, { status: 400 });
    }

    const job = await prisma.b2bEmailSearchJob.findUnique({ where: { id } });
    if (!job) {
      return Response.json({ error: "unknown_job" }, { status: 404 });
    }

    // Идемпотентно (ретрай сети со стороны сервиса просто перезаписывает
    // итог) и != null, не truthy — errorMessage: "" тоже означает "была
    // ошибка", а не "ошибки нет".
    const hasError = body.errorMessage != null;
    const updated = await prisma.b2bEmailSearchJob.update({
      where: { id },
      data: {
        status: hasError ? "FAILED" : "DONE",
        foundCount: body.foundCount,
        errorMessage: hasError ? body.errorMessage : null,
      },
    });

    return Response.json({ id: updated.id, status: updated.status, foundCount: updated.foundCount });
  } catch (err) {
    return integrationError(err);
  }
}
