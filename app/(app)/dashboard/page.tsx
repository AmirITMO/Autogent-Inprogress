import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { LEAD_STAGES, formatMoney, DONE_COLUMN_NAME } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const leadWhere = isAdmin ? {} : { ownerId: user.id };
  const taskWhere = isAdmin ? {} : { assigneeId: user.id };

  const [leads, tasks, transactions] = await Promise.all([
    prisma.lead.findMany({ where: leadWhere }),
    prisma.task.findMany({ where: taskWhere, include: { column: true } }),
    isAdmin ? prisma.transaction.findMany() : Promise.resolve([]),
  ]);

  const cashBalance = transactions.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  const openTasks = tasks.filter((t) => t.column.name !== DONE_COLUMN_NAME);
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date()
  );

  return (
    <div className="p-5">
      <h1 className="text-lg font-semibold text-foreground">
        Привет, {user.name}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {isAdmin ? "Сводка по всей команде" : "Ваши сделки и задачи"}
      </p>

      <div className="grid grid-cols-4 gap-4">
        <Tile label={isAdmin ? "Всего сделок" : "Мои сделки"} value={String(leads.length)} />
        <Tile label={isAdmin ? "Открытые задачи" : "Мои открытые задачи"} value={String(openTasks.length)} />
        <Tile label="Просрочено" value={String(overdueTasks.length)} danger={overdueTasks.length > 0} />
        {isAdmin && <Tile label="Касса" value={formatMoney(cashBalance)} />}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Воронка CRM</h3>
        <div className="flex flex-wrap gap-3">
          {LEAD_STAGES.map((stage) => {
            const count = leads.filter((l) => l.stage === stage.id).length;
            return (
              <div
                key={stage.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: stage.accent }} />
                <span className="text-muted">{stage.title}</span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${danger ? "text-danger" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
