export const LEAD_STAGES = [
  { id: "FIRST_TOUCH", title: "1 касание", accent: "#94a3b8" },
  { id: "SCHEDULED_CALL", title: "Назначили созвон", accent: "#3b82f6" },
  { id: "CALL_DONE", title: "Прошел созвон", accent: "#3b82f6" },
  { id: "SECOND_TOUCH_KP", title: "Назначено второе касание и КП", accent: "#eab308" },
  { id: "SECOND_CALL_DONE", title: "Второй созвон прошел", accent: "#eab308" },
  { id: "KP_SENT", title: "КП подтверждено", accent: "#eab308" },
  { id: "APPROVED", title: "Ждем предоплату", accent: "#22c55e" },
  { id: "PAID", title: "Оплата (предоплата)", accent: "#22c55e" },
  { id: "IN_PROGRESS", title: "В работе", accent: "#a855f7" },
  { id: "POSTPAY", title: "Постоплата", accent: "#22c55e" },
  { id: "SUPPORT", title: "Поддержка", accent: "#0ea5e9" },
] as const;

export type LeadStageId = (typeof LEAD_STAGES)[number]["id"];

// Сервисный User, от имени которого скаут-агент создаёт лидов (ownerId у Lead обязателен).
// Сотрудник переназначает лида на себя вручную при разборе.
export const SCOUT_AGENT_USER_ID = "user-scout-agent";

// Аналогично, для B2B email-агента — письма уходят только после ручного
// одобрения сотрудником (см. lib/actions/b2bEmailSend.ts), но лид всё равно
// нужно на кого-то завести сразу при парсинге, до отправки. У Instagram-канала
// своего сервисного User нет: там лид заводит вручную реальный сотрудник через UI.
export const B2B_EMAIL_AGENT_USER_ID = "user-b2b-email-agent";

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  P0: "P0 — critical",
  P1: "P1 — high",
  P2: "P2 — normal",
  P3: "P3 — low",
};

// Цвета через CSS-переменные (значения на тему — в app/globals.css): бейджи
// приоритетов должны перекрашиваться вместе со сменой светлой/тёмной темы.
export const TASK_PRIORITY_COLOR: Record<string, string> = {
  P0: "var(--prio-p0)",
  P1: "var(--prio-p1)",
  P2: "var(--prio-p2)",
  P3: "var(--prio-p3)",
};

export const TASK_PRIORITY_BG: Record<string, string> = {
  P0: "var(--prio-p0-bg)",
  P1: "var(--prio-p1-bg)",
  P2: "var(--prio-p2-bg)",
  P3: "var(--prio-p3-bg)",
};

export const TASK_COLORS = ["ROSE", "PEACH", "AMBER", "MINT", "TEAL", "SKY", "LAVENDER", "SLATE"] as const;
export type TaskColorId = (typeof TASK_COLORS)[number];

// Подсветка карточки на доске задач — акцент/группировка "на глаз". bg — фон
// карточки, border — акцентная кайма. Конкретные значения живут в
// app/globals.css по две штуки на цвет: пастель для светлой темы и
// приглушённый тёмный тинт того же оттенка для тёмной.
export const TASK_COLOR_STYLE: Record<TaskColorId, { label: string; bg: string; border: string }> = {
  ROSE: { label: "Розовый", bg: "var(--card-rose-bg)", border: "var(--card-rose-bd)" },
  PEACH: { label: "Персиковый", bg: "var(--card-peach-bg)", border: "var(--card-peach-bd)" },
  AMBER: { label: "Жёлтый", bg: "var(--card-amber-bg)", border: "var(--card-amber-bd)" },
  MINT: { label: "Зелёный", bg: "var(--card-mint-bg)", border: "var(--card-mint-bd)" },
  TEAL: { label: "Бирюзовый", bg: "var(--card-teal-bg)", border: "var(--card-teal-bd)" },
  SKY: { label: "Голубой", bg: "var(--card-sky-bg)", border: "var(--card-sky-bd)" },
  LAVENDER: { label: "Сиреневый", bg: "var(--card-lavender-bg)", border: "var(--card-lavender-bd)" },
  SLATE: { label: "Серый", bg: "var(--card-slate-bg)", border: "var(--card-slate-bd)" },
};

export const DEFAULT_TASK_COLUMNS = [
  "Бэклог",
  "К выполнению",
  "В работе",
  "На паузе",
  "На проверке",
  "Выполнено",
];

export const DONE_COLUMN_NAME = "Выполнено";
export const IN_PROGRESS_COLUMN_NAME = "В работе";
export const PAUSED_COLUMN_NAME = "На паузе";

export const EXPENSE_CATEGORIES = [
  { name: "Налоги", isRecurring: false },
  { name: "Реклама", isRecurring: false },
  { name: "% трафику", isRecurring: false },
  { name: "Зарплаты", isRecurring: true },
  { name: "Подписки/инструменты", isRecurring: true },
  { name: "Прочее", isRecurring: false },
];

export const INCOME_CATEGORIES = [
  { name: "Предоплата", isRecurring: false },
  { name: "Постоплата", isRecurring: false },
  { name: "Подписка", isRecurring: true },
];

export type KpiDirection = "min" | "max";

export const KPI_METRICS: { key: string; label: string; direction: KpiDirection; isMoney?: boolean }[] = [
  { key: "totalLeads", label: "Всего сделок", direction: "min" },
  { key: "openTasks", label: "Открытые задачи", direction: "min" },
  { key: "overdueTasks", label: "Просрочено задач", direction: "max" },
  { key: "cashBalance", label: "Касса", direction: "min", isMoney: true },
  ...LEAD_STAGES.map((s) => ({
    key: `stage_${s.id}`,
    label: s.title,
    direction: "min" as const,
  })),
];

export const DEPLOYMENT_STATUS_LABEL: Record<string, string> = {
  UNKNOWN: "Нет данных",
  OK: "Работает",
  DEGRADED: "Деградация",
  DOWN: "Недоступен",
};

export const DEPLOYMENT_STATUS_ACCENT: Record<string, "success" | "danger" | "warning" | "accent"> = {
  UNKNOWN: "accent",
  OK: "success",
  DEGRADED: "warning",
  DOWN: "danger",
};

export function formatMoney(value: number | string) {
  const num = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(num) + " ₽";
}
