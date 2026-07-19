import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/roles";
import { getEmployeeReportCore } from "@/lib/actions/employees";
import { verifyBotSecret, resolveTelegramUser, botError, BotAuthError } from "@/lib/bot/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const chatId = new URL(req.url).searchParams.get("chatId");
    const actor = await resolveTelegramUser(chatId);

    const perms = await getPermissions(actor.id, actor.role);
    if (actor.role !== "ADMIN" && !perms.editTasksOthers) {
      throw new BotAuthError(403, "forbidden");
    }

    const employee = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
    if (!employee) return Response.json({ error: "not_found" }, { status: 404 });

    const report = await getEmployeeReportCore(id);
    return Response.json({ employee, report });
  } catch (err) {
    return botError(err);
  }
}
