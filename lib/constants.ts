export const LEAD_STAGES = [
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

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  P0: "P0 — critical",
  P1: "P1 — high",
  P2: "P2 — normal",
  P3: "P3 — low",
};

export const TASK_PRIORITY_COLOR: Record<string, string> = {
  P0: "#ef4444",
  P1: "#f97316",
  P2: "#3b82f6",
  P3: "#7a7268",
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

export function formatMoney(value: number | string) {
  const num = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(num) + " ₽";
}
