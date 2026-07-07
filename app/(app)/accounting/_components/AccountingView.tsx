"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { formatMoney } from "@/lib/constants";
import { createTransaction, deleteTransaction } from "@/lib/actions/transactions";
import { IconWallet, IconTrendUp, IconCoins, IconClock } from "@/components/icons";

type Tx = {
  id: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  description: string | null;
  date: string;
  categoryName: string;
  isRecurring: boolean;
  leadTitle: string | null;
  createdByName: string;
};

type Category = { id: string; name: string; type: "INCOME" | "EXPENSE"; isRecurring: boolean };
type LeadOption = { id: string; title: string };

const PIE_COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#8b93a1"];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function AccountingView({
  transactions,
  categories,
  leads,
}: {
  transactions: Tx[];
  categories: Category[];
  leads: LeadOption[];
}) {
  const [period, setPeriod] = useState(currentMonthKey());
  const [showAllPeriods, setShowAllPeriods] = useState(false);

  // Касса — деньги, реально признанные бизнесом (ведётся автоматически при смене этапа сделки:
  // до предоплаты в бухгалтерию ничего не попадает), поэтому это просто сумма всей ленты.
  const cashBalance = useMemo(
    () =>
      transactions.reduce(
        (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
        0
      ),
    [transactions]
  );

  const periodTx = useMemo(
    () => (showAllPeriods ? transactions : transactions.filter((t) => t.date.slice(0, 7) === period)),
    [transactions, period, showAllPeriods]
  );

  const periodIncome = periodTx
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + t.amount, 0);
  const periodExpense = periodTx
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + t.amount, 0);

  const recurringForecast = transactions
    .filter((t) => t.type === "EXPENSE" && t.isRecurring)
    .reduce((acc, t) => {
      acc[t.categoryName] = (acc[t.categoryName] ?? 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);
  const recurringTotal = Object.values(recurringForecast).reduce((a, b) => a + b, 0);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of transactions) {
      const key = t.date.slice(0, 7);
      if (!map.has(key)) map.set(key, { month: key, income: 0, expense: 0 });
      const row = map.get(key)!;
      if (t.type === "INCOME") row.income += t.amount;
      else row.expense += t.amount;
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions]);

  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of periodTx) {
      if (t.type !== "EXPENSE") continue;
      map.set(t.categoryName, (map.get(t.categoryName) ?? 0) + t.amount);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [periodTx]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Касса"
          value={formatMoney(cashBalance)}
          accent="accent"
          icon={<IconWallet className="h-5 w-5" />}
          hint="Всё, что признано в бухгалтерии на сегодня: предоплаты, постоплаты и подписки только по сделкам, дошедшим до соответствующего этапа, минус расходы"
        />
        <StatTile
          label="Доход за период"
          value={formatMoney(periodIncome)}
          accent="accent-2"
          icon={<IconTrendUp className="h-5 w-5" />}
          hint="Сумма поступлений за выбранный месяц (или за всё время, если период не задан)"
        />
        <StatTile
          label="Расход за период"
          value={formatMoney(periodExpense)}
          accent="danger"
          icon={<IconCoins className="h-5 w-5" />}
          hint="Сумма расходов за выбранный месяц (или за всё время, если период не задан)"
        />
        <StatTile
          label="Прогноз повторяющихся трат"
          value={formatMoney(recurringTotal)}
          accent="warning"
          icon={<IconClock className="h-5 w-5" />}
          hint="Сумма всех расходов с пометкой «регулярный» (зарплаты, подписки) — ориентир, сколько уйдёт в следующий раз"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted">Период отчёта</label>
        <input
          type="month"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setShowAllPeriods(false);
          }}
          disabled={showAllPeriods}
          className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          onClick={() => setShowAllPeriods((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            showAllPeriods
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          За всё время
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">P&L по месяцам</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted)" fontSize={12} />
              <YAxis stroke="var(--muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              />
              <Bar dataKey="income" name="Доход" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Расход" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Разбивка расходов {showAllPeriods ? "за всё время" : `за ${period}`}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {expenseBreakdown.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AddTransactionForm categories={categories} leads={leads} />

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">
          Лента транзакций {showAllPeriods ? "за всё время" : `за ${period}`}
        </h3>
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2">Дата</th>
                <th className="pb-2">Категория</th>
                <th className="pb-2">Сделка</th>
                <th className="pb-2">Комментарий</th>
                <th className="pb-2 text-right">Сумма</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...periodTx].reverse().map((t) => (
                <tr key={t.id} className="border-b border-border/50 transition hover:bg-surface-2/60">
                  <td className="py-1.5 text-muted">
                    {new Date(t.date).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="py-1.5 text-foreground">{t.categoryName}</td>
                  <td className="py-1.5 text-muted">{t.leadTitle ?? "—"}</td>
                  <td className="py-1.5 text-muted">{t.description ?? "—"}</td>
                  <td
                    className={`py-1.5 text-right font-medium ${
                      t.type === "INCOME" ? "text-accent" : "text-danger"
                    }`}
                  >
                    {t.type === "INCOME" ? "+" : "−"}
                    {formatMoney(t.amount)}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm("Удалить транзакцию?")) deleteTransaction(t.id);
                      }}
                      className="text-muted hover:text-danger"
                      aria-label="Удалить"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {periodTx.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted">
                    Нет транзакций за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddTransactionForm({ categories, leads }: { categories: Category[]; leads: LeadOption[] }) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    description: "",
    leadId: "",
    date: todayInputValue(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const categoryOptions = categories.filter((c) => c.type === type);

  function switchType(next: "INCOME" | "EXPENSE") {
    setType(next);
    setForm((f) => ({ ...f, categoryId: "" }));
  }

  async function handleAdd() {
    if (!form.categoryId || !form.amount) return;
    setSaving(true);
    setError("");
    const result = await createTransaction({
      type,
      categoryId: form.categoryId,
      amount: Number(form.amount),
      description: form.description || undefined,
      leadId: form.leadId || undefined,
      date: form.date,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setForm({ categoryId: "", amount: "", description: "", leadId: "", date: todayInputValue() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Добавить операцию</h3>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => switchType("INCOME")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              type === "INCOME" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Доход
          </button>
          <button
            type="button"
            onClick={() => switchType("EXPENSE")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              type === "EXPENSE" ? "bg-danger text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Расход
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Категория</label>
          <select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">Выберите…</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Сумма</label>
          <input
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-32 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Дата</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="flex min-w-[160px] flex-col gap-1">
          <label className="text-xs text-muted">Сделка (опц.)</label>
          <select
            value={form.leadId}
            onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="">—</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 min-w-[160px] flex-col gap-1">
          <label className="text-xs text-muted">Комментарий</label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving || !form.categoryId || !form.amount}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
            type === "INCOME" ? "bg-accent hover:bg-accent-hover" : "bg-danger hover:bg-danger/90"
          }`}
        >
          {saving ? "Добавление…" : "Добавить"}
        </button>
        {saved && <span className="text-xs text-success">Добавлено</span>}
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
  hint,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">{label}</div>
        {icon && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1 text-xl font-semibold" style={{ color: `var(--${accent})` }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted">{hint}</div>}
    </div>
  );
}
