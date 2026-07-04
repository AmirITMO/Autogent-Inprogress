import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { TasksView } from "./_components/TasksView";

export default async function TasksPage() {
  await requireUser();

  const board = await prisma.taskBoard.findFirst({
    where: { name: "ЗАДАЧИ" },
    include: {
      columns: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: { assignee: true, project: true, _count: { select: { comments: true } } },
          },
        },
      },
    },
  });

  const [users, projects] = await Promise.all([
    prisma.user.findMany({ where: { isBlocked: false }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!board) {
    return (
      <div className="p-5 text-sm text-muted">
        Доска «ЗАДАЧИ» не найдена. Запустите сид: <code>npm run db:seed</code>
      </div>
    );
  }

  const columns = board.columns.map((c) => ({
    id: c.id,
    title: c.name,
    tasks: c.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      isBug: t.isBug,
      estimateHours: t.estimateHours ? Number(t.estimateHours) : null,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      order: t.order,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      commentCount: t._count.comments,
    })),
  }));

  const treeTasks = columns.flatMap((c) =>
    c.tasks.map((t) => ({ ...t, columnName: c.title }))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Задачи</h1>
      </div>
      <TasksView
        columns={columns}
        users={users}
        projects={projects}
        treeTasks={treeTasks}
        defaultColumnId={columns[0]?.id ?? ""}
      />
    </div>
  );
}
