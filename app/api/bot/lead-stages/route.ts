import { LEAD_STAGES } from "@/lib/constants";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    return Response.json({ stages: LEAD_STAGES.map((s) => ({ id: s.id, title: s.title })) });
  } catch (err) {
    return botError(err);
  }
}
