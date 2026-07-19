import { prisma } from "@/lib/prisma";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function POST(req: Request) {
  try {
    verifyBotSecret(req);
    const { chatId } = (await req.json()) as { chatId?: string | number };
    const user = await resolveTelegramUser(chatId != null ? String(chatId) : null);

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: null, telegramUsername: null },
    });

    return Response.json({ status: "unlinked" });
  } catch (err) {
    return botError(err);
  }
}
