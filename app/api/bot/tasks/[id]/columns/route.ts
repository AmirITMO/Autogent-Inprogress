import { prisma } from "@/lib/prisma";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

// Список статусов (колонок борда) для карточки задачи — доступен на просмотр
// всем привязанным пользователям (право редактировать проверяется отдельно,
// в момент самого изменения статуса).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    const task = await prisma.task.findUnique({ where: { id }, include: { column: true } });
    if (!task) return Response.json({ error: "not_found" }, { status: 404 });

    const columns = await prisma.taskColumn.findMany({
      where: { boardId: task.column.boardId },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    });

    return Response.json({ columns, currentColumnId: task.columnId });
  } catch (err) {
    return botError(err);
  }
}
