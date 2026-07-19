import { prisma } from "@/lib/prisma";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

// Список сотрудников для выбора участников созвона — доступен любому
// привязанному пользователю (как на сайте: участников календаря может
// выбрать кто угодно, это не ограничено правами CRM/задач).
export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    const users = await prisma.user.findMany({
      where: { isBlocked: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return Response.json({ users });
  } catch (err) {
    return botError(err);
  }
}
