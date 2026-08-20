import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyIntegrationApiKey(req, "TG_AUTOCOMMENT_AGENT_API_KEY");
    const { id } = await params;

    const body = (await req.json()) as { errorMessage?: string };

    const draft = await prisma.tgCommentDraft.findUnique({ where: { id } });
    if (!draft) {
      return Response.json({ error: "unknown_draft" }, { status: 404 });
    }

    // != null, не truthy — errorMessage: "" тоже означает "была ошибка"
    // (тот же приём, что у Instagram/B2B-заданий).
    const hasError = body.errorMessage != null;
    const updated = await prisma.tgCommentDraft.update({
      where: { id },
      data: {
        status: hasError ? "FAILED" : "SENT",
        errorMessage: hasError ? body.errorMessage : null,
        sentAt: hasError ? null : new Date(),
      },
    });

    return Response.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return integrationError(err);
  }
}
