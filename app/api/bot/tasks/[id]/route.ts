import { prisma } from "@/lib/prisma";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    const t = await prisma.task.findUnique({
      where: { id },
      include: { project: true, column: true },
    });
    if (!t) return Response.json({ error: "not_found" }, { status: 404 });

    return Response.json({
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        isBug: t.isBug,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        projectName: t.project && t.project.name !== "Общий" ? t.project.name : null,
        columnName: t.column.name,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      },
    });
  } catch (err) {
    return botError(err);
  }
}
