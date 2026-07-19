import { getPermissions } from "@/lib/roles";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const chatId = new URL(req.url).searchParams.get("chatId");
    const user = await resolveTelegramUser(chatId);
    const permissions = await getPermissions(user.id, user.role);

    return Response.json({
      userId: user.id,
      name: user.name,
      role: user.role,
      permissions,
    });
  } catch (err) {
    return botError(err);
  }
}
