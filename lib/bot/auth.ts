import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/actions/tasksCore";

export class BotAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Constant-time сравнение секрета между ботом и backend — как X-Bot-Secret
// в референсной реализации, чтобы нельзя было восстановить секрет по времени ответа.
export function verifyBotSecret(req: Request) {
  const expected = process.env.BOT_INTERNAL_SECRET;
  const given = req.headers.get("x-bot-secret");
  if (!expected || !given) throw new BotAuthError(401, "unauthorized");

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BotAuthError(401, "unauthorized");
  }
}

export async function resolveTelegramUser(chatId: string | null): Promise<Actor & { name: string }> {
  if (!chatId) throw new BotAuthError(400, "chat_id required");
  let chatIdBig: bigint;
  try {
    chatIdBig = BigInt(chatId);
  } catch {
    throw new BotAuthError(400, "invalid chat_id");
  }

  const user = await prisma.user.findUnique({
    where: { telegramChatId: chatIdBig },
    select: { id: true, role: true, name: true },
  });
  if (!user) throw new BotAuthError(404, "not_linked");
  return user;
}

export function botError(err: unknown) {
  if (err instanceof BotAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error && err.message === "Forbidden") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  console.error(err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}
