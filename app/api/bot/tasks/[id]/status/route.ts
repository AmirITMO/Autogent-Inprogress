import { prisma } from "@/lib/prisma";
import { moveTaskCore } from "@/lib/actions/tasksCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const { chatId, columnId } = (await req.json()) as { chatId?: string | number; columnId?: string };
    const actor = await resolveTelegramUser(chatId != null ? String(chatId) : null);

    if (!columnId) return Response.json({ error: "columnId required" }, { status: 400 });

    const count = await prisma.task.count({ where: { columnId } });
    await moveTaskCore(actor, id, columnId, count);

    return Response.json({ status: "updated" });
  } catch (err) {
    return botError(err);
  }
}
