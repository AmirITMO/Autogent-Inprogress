import { prisma } from "@/lib/prisma";
import { verifyBotSecret, botError } from "@/lib/bot/auth";
import { consumeLinkToken } from "@/lib/telegramLink";

export async function POST(req: Request) {
  try {
    verifyBotSecret(req);
    const { token, chatId, username } = (await req.json()) as {
      token?: string;
      chatId?: string | number;
      username?: string | null;
    };
    if (!token || chatId === undefined || chatId === null) {
      return Response.json({ error: "token and chat_id required" }, { status: 400 });
    }

    const consumed = consumeLinkToken(token);
    if (!consumed) return Response.json({ error: "invalid_or_expired_token" }, { status: 400 });

    const chatIdBig = BigInt(chatId);

    // "Последний привязавшийся побеждает" — отвязываем этот chat_id от
    // любого прежнего владельца, чтобы не упасть на UNIQUE-ограничении.
    await prisma.user.updateMany({
      where: { telegramChatId: chatIdBig, id: { not: consumed.userId } },
      data: { telegramChatId: null, telegramUsername: null },
    });

    const user = await prisma.user.update({
      where: { id: consumed.userId },
      data: { telegramChatId: chatIdBig, telegramUsername: username ?? null },
      select: { id: true, name: true, role: true },
    });

    return Response.json({ status: "linked", name: user.name, role: user.role });
  } catch (err) {
    return botError(err);
  }
}
