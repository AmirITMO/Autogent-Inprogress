import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { LEAD_STAGES, formatMoney, DONE_COLUMN_NAME } from "@/lib/constants";
import { reconcileAllLeadIncome } from "@/lib/actions/leads";
import { KpiPanel } from "./_components/KpiPanel";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  if (isAdmin) await reconcileAllLeadIncome();

  const leadWhere = isAdmin ? {} : { ownerId: user.id };
  const taskWhere = isAdmin ? {} : { assigneeId: user.id };

  const [leads, tasks, transactions, kpis] = await Promise.all([
    prisma.lead.findMany({ where: leadWhere }),
    prisma.task.findMany({ where: taskWhere, include: { column: true } }),
    isAdmin ? prisma.transaction.findMany() : Promise.resolve([]),
    prisma.kpi.findMany(),
  ]);

  // Ленту транзакций пополняют только сделки, дошедшие до нужного этапа (см. syncLeadIncome),
  // поэтому касса — это просто сумма доходов минус расходы.
  const cashBalance = transactions.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  const openTasks = tasks.filter((t) => t.column.name !== DONE_COLUMN_NAME);
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date()
  );

  const metricValues: Record<string, number> = {
    totalLeads: leads.length,
    openTasks: openTasks.length,
    overdueTasks: overdueTasks.length,
    cashBalance,
  };
  for (const stage of LEAD_STAGES) {
    metricValues[`stage_${stage.id}`] = leads.filter((l) => l.stage === stage.id).length;
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-foreground">
        Привет, {user.name} 👋
      </h1>
      <p className="mb-6 text-sm text-muted">
        {isAdmin ? "Сводка по всей команде" : "Ваши сделки и задачи"}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile
          label={isAdmin ? "Всего сделок" : "Мои сделки"}
          value={String(leads.length)}
          accent="accent-2"
          icon="📈"
        />
        <Tile
          label={isAdmin ? "Открытые задачи" : "Мои открытые задачи"}
          value={String(openTasks.length)}
          accent="accent"
          icon="🗂️"
        />
        <Tile
          label="Просрочено"
          value={String(overdueTasks.length)}
          danger={overdueTasks.length > 0}
          icon="⏰"
        />
        {isAdmin && <Tile label="Касса" value={formatMoney(cashBalance)} accent="success" icon="💰" />}
      </div>

      <KpiPanel
        kpis={kpis.map((k) => ({ metricKey: k.metricKey, target: Number(k.target) }))}
        values={metricValues}
        isAdmin={isAdmin}
      />

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Воронка CRM</h3>
        <div className="flex flex-wrap gap-2.5">
          {LEAD_STAGES.map((stage) => {
            const count = leads.filter((l) => l.stage === stage.id).length;
            return (
              <div
                key={stage.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm transition hover:border-accent/40"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.accent }} />
                <span className="text-muted">{stage.title}</span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  danger,
  accent,
  icon,
}: {
  label: string;
  value: string;
  danger?: boolean;
  accent?: string;
  icon?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">{label}</div>
        {icon && <span className="text-base opacity-70">{icon}</span>}
      </div>
      <div
        className="mt-2 text-2xl font-semibold text-foreground"
        style={{ color: danger ? "var(--danger)" : accent ? `var(--${accent})` : undefined }}
      >
        {value}
      </div>
    </div>
  );
}
