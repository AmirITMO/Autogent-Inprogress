import { setLeadLostCore } from "@/lib/actions/leadsCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const body = (await req.json()) as { chatId?: string | number; lost?: boolean; lostReason?: string };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    await setLeadLostCore(actor, id, !!body.lost, body.lostReason);
    return Response.json({ status: "updated" });
  } catch (err) {
    return botError(err);
  }
}
