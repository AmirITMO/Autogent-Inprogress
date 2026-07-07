import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { LEAD_STAGES, formatMoney, DONE_COLUMN_NAME } from "@/lib/constants";
import { reconcileAllLeadIncome } from "@/lib/actions/leads";
import { KpiPanel } from "./_components/KpiPanel";
import {
  IconTrendUp,
  IconFolder,
  IconClock,
  IconWallet,
  IconSparkles,
  IconCoins,
  IconCalendar,
} from "@/components/icons";

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  if (isAdmin) await reconcileAllLeadIncome();

  const leadWhere = isAdmin ? {} : { ownerId: user.id };
  const taskWhere = isAdmin ? {} : { assigneeId: user.id };

  const now = new Date();

  const [leads, tasks, transactions, kpis, me, myEvents, allEvents] = await Promise.all([
    prisma.lead.findMany({ where: leadWhere }),
    prisma.task.findMany({
      where: taskWhere,
      include: { column: true, project: true },
      orderBy: [{ dueDate: "asc" }],
    }),
    isAdmin ? prisma.transaction.findMany() : Promise.resolve([]),
    prisma.kpi.findMany(),
    prisma.user.findUnique({ where: { id: user.id }, select: { motivationPhotoKey: true } }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: now }, attendees: { some: { id: user.id } } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  // Ленту транзакций пополняют только сделки, дошедшие до нужного этапа (см. syncLeadIncome),
  // поэтому касса — это просто сумма доходов минус расходы.
  const cashBalance = transactions.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  // Предполагаемая выручка — сумма предоплаты и постоплаты по всем сделкам, которые
  // ещё не отмечены как отказ (для сотрудника — только по его сделкам, как и везде
  // на этом дашборде).
  const expectedRevenue = leads
    .filter((l) => !l.lost)
    .reduce((sum, l) => sum + Number(l.prepay) + Number(l.postpay), 0);

  const openTasks = tasks.filter((t) => t.column.name !== DONE_COLUMN_NAME);
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date()
  );
  const upcomingTasks = openTasks
    .filter((t) => t.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 5);

  const metricValues: Record<string, number> = {
    totalLeads: leads.length,
    openTasks: openTasks.length,
    overdueTasks: overdueTasks.length,
    cashBalance,
  };
  for (const stage of LEAD_STAGES) {
    metricValues[`stage_${stage.id}`] = leads.filter((l) => l.stage === stage.id).length;
  }

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <IconSparkles className="h-5 w-5 text-accent" />
          {greeting}, {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isAdmin ? "Сводка по всей команде" : "Ваши сделки и задачи"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
        <Tile
          label={isAdmin ? "Всего сделок" : "Мои сделки"}
          value={String(leads.length)}
          accent="accent-2"
          icon={<IconTrendUp className="h-5 w-5" />}
        />
        <Tile
          label="Предполагаемая выручка"
          value={formatMoney(expectedRevenue)}
          accent="success"
          icon={<IconCoins className="h-5 w-5" />}
        />
        <Tile
          label={isAdmin ? "Открытые задачи" : "Мои открытые задачи"}
          value={String(openTasks.length)}
          accent="accent"
          icon={<IconFolder className="h-5 w-5" />}
        />
        <Tile
          label="Просрочено"
          value={String(overdueTasks.length)}
          danger={overdueTasks.length > 0}
          icon={<IconClock className="h-5 w-5" />}
        />
        {isAdmin && (
          <Tile
            label="Касса"
            value={formatMoney(cashBalance)}
            accent="success"
            icon={<IconWallet className="h-5 w-5" />}
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <IconFolder className="h-4 w-4 text-accent" />
              Ближайшие дедлайны
            </h3>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted">Нет задач с дедлайном — можно выдохнуть</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcomingTasks.map((t) => {
                  const overdue = t.dueDate! < new Date();
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-accent bg-surface-2 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{t.title}</div>
                        <div className="text-xs text-muted">{t.project?.name ?? t.column.name}</div>
                      </div>
                      <span className={`shrink-0 text-xs font-medium ${overdue ? "text-danger" : "text-muted"}`}>
                        {t.dueDate!.toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <IconCalendar className="h-4 w-4 text-accent-2" />
              Мои созвоны
            </h3>
            {myEvents.length === 0 ? (
              <p className="text-sm text-muted">У вас нет запланированных созвонов</p>
            ) : (
              <div className="flex flex-col gap-2">
                {myEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-accent-2 bg-surface-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 truncate text-foreground">{e.title}</div>
                    <span className="shrink-0 text-xs font-medium text-accent-2">
                      {e.startAt.toLocaleDateString("ru-RU")} {e.startAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {allEvents.length > 0 && (
              <>
                <h4 className="mb-2 mt-4 text-xs font-medium text-muted">Все созвоны команды</h4>
                <div className="flex flex-col gap-1.5">
                  {allEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/60 px-3 py-1.5 text-xs text-muted"
                    >
                      <span className="min-w-0 truncate">{e.title}</span>
                      <span className="shrink-0">
                        {e.startAt.toLocaleDateString("ru-RU")} {e.startAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {me?.motivationPhotoKey && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <h3 className="mb-2 text-sm font-medium text-foreground">Мотивация</h3>
              <div className="inline-flex max-w-full overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/api/motivation-photo"
                  alt="Фото мотивации"
                  className="max-h-72 w-auto max-w-full object-contain"
                />
              </div>
            </div>
          )}

          <div className="flex-1 rounded-xl border border-border bg-surface p-5">
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
      </div>

      <KpiPanel
        kpis={kpis.map((k) => ({ metricKey: k.metricKey, target: Number(k.target) }))}
        values={metricValues}
        isAdmin={isAdmin}
      />
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
  icon?: React.ReactNode;
}) {
  const color = danger ? "var(--danger)" : accent ? `var(--${accent})` : "var(--foreground)";
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">{label}</div>
        {icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
