import { completeTaskCore } from "@/lib/actions/tasksCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const { chatId } = (await req.json()) as { chatId?: string | number };
    const actor = await resolveTelegramUser(chatId != null ? String(chatId) : null);

    await completeTaskCore(actor, id);
    return Response.json({ status: "completed" });
  } catch (err) {
    return botError(err);
  }
}
