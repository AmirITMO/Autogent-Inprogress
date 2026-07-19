"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { createLinkToken } from "@/lib/telegramLink";

export async function getTelegramStatus(): Promise<{ connected: boolean; username: string | null }> {
  const user = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { telegramChatId: true, telegramUsername: true },
  });
  return { connected: me.telegramChatId !== null, username: me.telegramUsername };
}

export async function createTelegramLinkToken(): Promise<
  { token: string; botUsername: string } | { error: string }
> {
  const user = await requireUser();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return { error: "Telegram-бот пока не настроен" };

  const result = createLinkToken(user.id);
  if ("error" in result) return result;
  return { token: result.token, botUsername };
}
