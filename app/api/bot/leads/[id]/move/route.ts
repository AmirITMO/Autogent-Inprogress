import { prisma } from "@/lib/prisma";
import { LEAD_STAGES } from "@/lib/constants";
import { moveLeadCore } from "@/lib/actions/leadsCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const body = (await req.json()) as { chatId?: string | number; direction?: "next" | "prev" };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const currentIndex = LEAD_STAGES.findIndex((s) => s.id === lead.stage);
    const targetIndex = body.direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= LEAD_STAGES.length) {
      return Response.json({ error: "no_such_stage" }, { status: 400 });
    }
    const toStage = LEAD_STAGES[targetIndex].id;

    const countInTarget = await prisma.lead.count({ where: { stage: toStage } });
    await moveLeadCore(actor, id, toStage, countInTarget);

    return Response.json({ status: "moved", stage: toStage });
  } catch (err) {
    return botError(err);
  }
}
