import { prisma } from "@/lib/prisma";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    const projects = await prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { order: "asc" },
    });
    return Response.json({ projects });
  } catch (err) {
    return botError(err);
  }
}
