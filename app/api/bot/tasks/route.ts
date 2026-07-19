import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/roles";
import { DONE_COLUMN_NAME } from "@/lib/constants";
import { createTaskCore } from "@/lib/actions/tasksCore";
import { verifyBotSecret, resolveTelegramUser, botError, BotAuthError } from "@/lib/bot/auth";

const PAGE_SIZE = 5;

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const url = new URL(req.url);
    const chatId = url.searchParams.get("chatId");
    const status = url.searchParams.get("status") === "done" ? "done" : "open";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const requestedAssigneeId = url.searchParams.get("assigneeId");

    const actor = await resolveTelegramUser(chatId);
    let assigneeId = requestedAssigneeId || actor.id;

    if (assigneeId !== actor.id) {
      const perms = await getPermissions(actor.id, actor.role);
      if (actor.role !== "ADMIN" && !perms.editTasksOthers) {
        throw new BotAuthError(403, "forbidden");
      }
    }

    const where = {
      assigneeId,
      archived: false,
      column: status === "done" ? { name: DONE_COLUMN_NAME } : { name: { not: DONE_COLUMN_NAME } },
    };

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: { project: true, column: true },
        orderBy: status === "done" ? { completedAt: "desc" } : [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return Response.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        isBug: t.isBug,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        projectName: t.project && t.project.name !== "Общий" ? t.project.name : null,
        columnName: t.column.name,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return botError(err);
  }
}

export async function POST(req: Request) {
  try {
    verifyBotSecret(req);
    const body = (await req.json()) as {
      chatId?: string | number;
      title?: string;
      description?: string;
      assigneeId?: string;
      priority?: "P0" | "P1" | "P2" | "P3";
      isBug?: boolean;
      estimateHours?: number | null;
      dueDate?: string | null;
      projectId?: string;
    };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    if (!body.title?.trim()) {
      return Response.json({ error: "title required" }, { status: 400 });
    }

    const firstBoard = await prisma.taskBoard.findFirst({
      include: { columns: { orderBy: { order: "asc" }, take: 1 } },
    });
    const columnId = firstBoard?.columns[0]?.id;
    if (!columnId) return Response.json({ error: "no_board" }, { status: 500 });

    const task = await createTaskCore(actor, {
      columnId,
      title: body.title.trim(),
      description: body.description,
      assigneeId: body.assigneeId,
      priority: body.priority,
      isBug: body.isBug,
      estimateHours: body.estimateHours,
      dueDate: body.dueDate,
      projectId: body.projectId,
    });

    return Response.json({ id: task.id, title: task.title });
  } catch (err) {
    return botError(err);
  }
}
