import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { MyTasksList } from "./_components/MyTasksList";

export default async function MyTasksPage() {
  const user = await requireUser();

  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id, archived: false },
    include: {
      column: true,
      project: true,
      _count: { select: { comments: true, attachments: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarUrl: true },
  });

  const [users, projects] = await Promise.all([
    prisma.user.findMany({ where: { isBlocked: false }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const serialized = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    isBug: t.isBug,
    estimateHours: t.estimateHours ? Number(t.estimateHours) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    order: t.order,
    assigneeId: t.assigneeId,
    assigneeName: user.name ?? user.email ?? "",
    assigneeAvatarUrl: me?.avatarUrl ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    commentCount: t._count.comments,
    attachmentCount: t._count.attachments,
    columnName: t.column.name,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Мои задачи</h1>
        <p className="text-sm text-muted">Активные задачи, назначенные на вас</p>
      </div>
      <MyTasksList tasks={serialized} users={users} projects={projects} />
    </div>
  );
}
