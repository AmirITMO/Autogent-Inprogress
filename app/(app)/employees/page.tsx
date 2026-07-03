import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { EmployeesView } from "./_components/EmployeesView";

export default async function EmployeesPage() {
  await requireAdmin();

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      include: { projectAccess: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
  ]);

  const serialized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isBlocked: u.isBlocked,
    projectIds: u.projectAccess.map((a) => a.projectId),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Сотрудники</h1>
        <p className="text-sm text-muted">Команда, доступы и блокировки</p>
      </div>
      <EmployeesView
        users={serialized}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
