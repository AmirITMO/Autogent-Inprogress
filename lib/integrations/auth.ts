import { timingSafeEqual } from "crypto";

export class IntegrationAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Constant-time сравнение API-ключа интеграции — по аналогии с verifyBotSecret,
// но отдельный секрет на клиента, а не общий X-Bot-Secret на весь Telegram-бот.
export function verifyIntegrationApiKey(req: Request, envVar: string) {
  const expected = process.env[envVar];
  const given = req.headers.get("x-api-key");
  if (!expected || !given) throw new IntegrationAuthError(401, "unauthorized");

  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new IntegrationAuthError(401, "unauthorized");
  }
}

export function integrationError(err: unknown) {
  if (err instanceof IntegrationAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}
