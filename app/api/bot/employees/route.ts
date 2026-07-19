import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/roles";
import { verifyBotSecret, resolveTelegramUser, botError, BotAuthError } from "@/lib/bot/auth";

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const chatId = new URL(req.url).searchParams.get("chatId");
    const actor = await resolveTelegramUser(chatId);

    const perms = await getPermissions(actor.id, actor.role);
    if (actor.role !== "ADMIN" && !perms.editTasksOthers) {
      throw new BotAuthError(403, "forbidden");
    }

    const employees = await prisma.user.findMany({
      where: { isBlocked: false },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    return Response.json({ employees });
  } catch (err) {
    return botError(err);
  }
}
