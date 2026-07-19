import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS_PER_HOUR = 5;

// Троттлинг выпуска токенов — не критично для безопасности (см. телеграм-токен
// сам по себе одноразовый и короткоживущий), поэтому в памяти процесса и без
// персистентности достаточно: худший случай при рестарте — временно ослабленный лимит.
const issuedAt = new Map<string, number[]>();

export async function createLinkToken(userId: string): Promise<{ token: string } | { error: string }> {
  const now = Date.now();
  const recent = (issuedAt.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_TOKENS_PER_HOUR) {
    return { error: "Слишком много попыток. Попробуйте позже." };
  }
  recent.push(now);
  issuedAt.set(userId, recent);

  const token = randomBytes(24).toString("base64url");
  await prisma.telegramLinkToken.create({
    data: { token, userId, expiresAt: new Date(now + TOKEN_TTL_MS) },
  });

  // Заодно подчищаем просроченные токены — небольшая фоновая гигиена без отдельной крон-задачи.
  await prisma.telegramLinkToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return { token };
}

// Одноразовое изъятие токена — повторное использование невозможно.
export async function consumeLinkToken(token: string): Promise<{ userId: string } | null> {
  const entry = await prisma.telegramLinkToken.delete({ where: { token } }).catch(() => null);
  if (!entry || entry.expiresAt < new Date()) return null;
  return { userId: entry.userId };
}
