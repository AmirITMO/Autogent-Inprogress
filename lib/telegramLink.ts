import { randomBytes } from "crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS_PER_HOUR = 5;

type LinkTokenEntry = { userId: string; expiresAt: number };

const tokens = new Map<string, LinkTokenEntry>();
const issuedAt = new Map<string, number[]>();

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt < now) tokens.delete(token);
  }
}

export function createLinkToken(userId: string): { token: string } | { error: string } {
  pruneExpired();

  const now = Date.now();
  const recent = (issuedAt.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_TOKENS_PER_HOUR) {
    return { error: "Слишком много попыток. Попробуйте позже." };
  }
  recent.push(now);
  issuedAt.set(userId, recent);

  const token = randomBytes(24).toString("base64url");
  tokens.set(token, { userId, expiresAt: now + TOKEN_TTL_MS });
  return { token };
}

// Одноразовое изъятие токена — повторное использование невозможно.
export function consumeLinkToken(token: string): { userId: string } | null {
  const entry = tokens.get(token);
  tokens.delete(token);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { userId: entry.userId };
}
