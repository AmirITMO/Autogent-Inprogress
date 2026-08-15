"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatMoney } from "@/lib/constants";
import { AgentManagementPanel } from "./AgentManagementPanel";

type ContactStatus = "WRITTEN" | "REPLIED" | "CALL_SCHEDULED" | "LEAD_CREATED" | "DECLINED";

type DialogueMessage = { from?: string; text?: string; at?: string };

type Contact = {
  id: string;
  name: string | null;
  telegramUsername: string | null;
  sourceChatName: string | null;
  triggerMessage: string | null;
  triggerReason: string | null;
  outreachAccount: string | null;
  dialogue: unknown;
  status: ContactStatus;
  contactedAt: string;
  leadId: string | null;
  leadStage: string | null;
};

type Snapshot = { id: string; createdAt: string; payload: unknown };

type Financials = {
  totalLeads: number;
  lostLeads: number;
  paidLeads: number;
  conversionRate: number;
  revenue: number;
  spend: number;
  roi: number | null;
  cac: number | null;
  avgCheck: number | null;
};

type KbMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

type SnapshotPayload = {
  messagesScanned?: number;
  triggersFound?: number;
  outboundSent?: number;
  responsesReceived?: number;
  accounts?: { name?: string; sentToday?: number; dailyLimit?: number }[];
};

const STATUS_LABEL: Record<ContactStatus, string> = {
  WRITTEN: "Написали",
  REPLIED: "Ответил",
  CALL_SCHEDULED: "Созвон назначен",
  LEAD_CREATED: "Стал сделкой",
  DECLINED: "Отказ",
};

const STATUS_ACCENT: Record<ContactStatus, "success" | "danger" | "warning" | "accent"> = {
  WRITTEN: "accent",
  REPLIED: "warning",
  CALL_SCHEDULED: "warning",
  LEAD_CREATED: "success",
  DECLINED: "danger",
};

const PERIODS = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
] as const;

function periodCutoff(id: (typeof PERIODS)[number]["id"]): Date | null {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (id === "today") return start;
  if (id === "7d") {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (id === "30d") {
    start.setDate(start.getDate() - 29);
    return start;
  }
  return null;
}

function asPayload(value: unknown): SnapshotPayload {
  return typeof value === "object" && value !== null ? (value as SnapshotPayload) : {};
}

function asDialogue(value: unknown): DialogueMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is DialogueMessage => typeof v === "object" && v !== null);
}

export function ScoutAgentDashboard({
  channelId,
  snapshots,
  contacts,
  financials,
  kbContent,
  kbUpdatedAt,
  kbMessages,
}: {
  channelId: string;
  snapshots: Snapshot[];
  contacts: Contact[];
  financials: Financials;
  kbContent: string;
  kbUpdatedAt: string | null;
  kbMessages: KbMessage[];
}) {
  const [topTab, setTopTab] = useState<"manage" | "analytics" | "details">("analytics");
  const [tab, setTab] = useState<"contacts" | "summary">("contacts");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("7d");

  const filteredContacts = useMemo(() => {
    const cutoff = periodCutoff(period);
    if (!cutoff) return contacts;
    return contacts.filter((c) => new Date(c.contactedAt) >= cutoff);
  }, [contacts, period]);

  const stats = useMemo(() => {
    const written = filteredContacts.length;
    const replied = filteredContacts.filter((c) =>
      ["REPLIED", "CALL_SCHEDULED", "LEAD_CREATED"].includes(c.status)
    ).length;
    const callScheduled = filteredContacts.filter((c) =>
      ["CALL_SCHEDULED", "LEAD_CREATED"].includes(c.status)
    ).length;
    const reachedCrm = filteredContacts.filter((c) => c.leadId).length;
    return { written, replied, callScheduled, reachedCrm };
  }, [filteredContacts]);

  // Не завязано на период — это KPI «за всё время» для вкладки «Аналитика».
  const textToCallConversion = useMemo(() => {
    if (contacts.length === 0) return 0;
    const callScheduled = contacts.filter((c) => ["CALL_SCHEDULED", "LEAD_CREATED"].includes(c.status)).length;
    return (callScheduled / contacts.length) * 100;
  }, [contacts]);

  const trend = useMemo(
    () =>
      snapshots.map((s) => {
        const p = asPayload(s.payload);
        return {
          date: new Date(s.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          messagesScanned: p.messagesScanned ?? 0,
          triggersFound: p.triggersFound ?? 0,
        };
      }),
    [snapshots]
  );

  const latestAccounts = useMemo(() => {
    const last = snapshots[snapshots.length - 1];
    return last ? (asPayload(last.payload).accounts ?? []) : [];
  }, [snapshots]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        <TopTabButton active={topTab === "manage"} onClick={() => setTopTab("manage")}>
          Управление
        </TopTabButton>
        <TopTabButton active={topTab === "analytics"} onClick={() => setTopTab("analytics")}>
          Аналитика
        </TopTabButton>
        <TopTabButton active={topTab === "details"} onClick={() => setTopTab("details")}>
          Подробности
        </TopTabButton>
      </div>

      {topTab === "manage" && (
        <AgentManagementPanel
          channelId={channelId}
          initialContent={kbContent}
          initialUpdatedAt={kbUpdatedAt}
          initialMessages={kbMessages}
        />
      )}

      {topTab === "analytics" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Лидов принесено" value={String(financials.totalLeads)} />
            <StatTile label="Выручка" value={formatMoney(financials.revenue)} accent="success" />
            <StatTile label="Затраты" value={formatMoney(financials.spend)} />
            <StatTile
              label="ROI"
              value={financials.roi == null ? "—" : `${financials.roi >= 0 ? "+" : ""}${financials.roi.toFixed(0)}%`}
              accent={financials.roi != null ? (financials.roi >= 0 ? "success" : "danger") : undefined}
            />
            <StatTile label="CAC" value={financials.cac == null ? "—" : formatMoney(financials.cac)} />
            <StatTile label="Отказов" value={String(financials.lostLeads)} accent={financials.lostLeads > 0 ? "danger" : undefined} />
            <StatTile label="Конверсия из текста в созвон" value={`${textToCallConversion.toFixed(1)}%`} accent="warning" />
          </div>

          <button
            onClick={() => setTopTab("details")}
            className="mt-4 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Подробности →
          </button>
        </div>
      )}

      {topTab === "details" && (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")}>
            Контакты ({contacts.length})
          </TabButton>
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            Сводка
          </TabButton>
        </div>
        <div className="ml-auto flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                period === p.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "summary" ? (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Написал" value={String(stats.written)} />
            <StatTile label="Ответили" value={String(stats.replied)} accent="warning" />
            <StatTile label="Созвон назначен" value={String(stats.callScheduled)} accent="warning" />
            <StatTile label="Дошли до CRM-воронки" value={String(stats.reachedCrm)} accent="success" />
          </div>

          {trend.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Сканирование и триггеры по снимкам</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="messagesScanned" name="Сообщений просканировано" stroke="#3b82f6" dot={false} />
                  <Line type="monotone" dataKey="triggersFound" name="Найдено триггеров" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {latestAccounts.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Здоровье аккаунтов (последний снимок)</h3>
              <div className="flex flex-col gap-2">
                {latestAccounts.map((a, idx) => {
                  const sent = a.sentToday ?? 0;
                  const limit = a.dailyLimit ?? 0;
                  const usage = limit > 0 ? (sent / limit) * 100 : 0;
                  const risky = usage >= 80;
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 font-medium text-foreground">{a.name ?? "—"}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(usage, 100)}%`,
                            background: risky ? "var(--danger)" : "var(--accent)",
                          }}
                        />
                      </div>
                      <span className={`w-16 shrink-0 text-right text-xs ${risky ? "text-danger" : "text-muted"}`}>
                        {sent}/{limit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {trend.length === 0 && latestAccounts.length === 0 && (
            <p className="mt-6 text-sm text-muted">Снимков метрик от агента пока нет</p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {filteredContacts.length === 0 ? (
            <p className="text-sm text-muted">За выбранный период контактов нет</p>
          ) : (
            filteredContacts.map((c) => <ContactCard key={c.id} contact={c} />)
          )}
        </div>
      )}
    </div>
      )}
    </div>
  );
}

function TopTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-b-2 border-accent text-accent"
          : "border-b-2 border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? "bg-accent text-white" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ color: accent ? `var(--${accent})` : "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}

function ContactCard({ contact: c }: { contact: Contact }) {
  const [open, setOpen] = useState(false);
  const dialogue = asDialogue(c.dialogue);
  const accent = STATUS_ACCENT[c.status];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">
          {c.name || c.telegramUsername || "Без имени"}
        </span>
        {c.sourceChatName && <span className="text-xs text-muted">из «{c.sourceChatName}»</span>}
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
        >
          {STATUS_LABEL[c.status]}
        </span>
        <span className="text-xs text-muted">
          {new Date(c.contactedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 text-sm">
          {c.triggerReason && (
            <div className="mb-2">
              <span className="text-xs text-muted">Почему написали: </span>
              <span className="text-foreground">{c.triggerReason}</span>
            </div>
          )}
          {c.triggerMessage && (
            <div className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              «{c.triggerMessage}»
            </div>
          )}
          {c.outreachAccount && (
            <div className="mb-2 text-xs text-muted">Писали с аккаунта: {c.outreachAccount}</div>
          )}

          {dialogue.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {dialogue.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                    m.from === "scout"
                      ? "self-start bg-accent-soft text-foreground"
                      : "self-end bg-surface-2 text-foreground"
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
          )}

          {c.leadId && (
            <div className="mt-3 text-xs text-success">
              Сделка создана в CRM{c.leadStage ? ` — этап «${c.leadStage}»` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
