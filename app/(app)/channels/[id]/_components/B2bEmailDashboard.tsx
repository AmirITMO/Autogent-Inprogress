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

type ContactStatus = "WRITTEN" | "REPLIED" | "CALL_SCHEDULED" | "LEAD_CREATED" | "DECLINED";

type DialogueMessage = { from?: string; text?: string; at?: string };

type Contact = {
  id: string;
  companyName: string | null;
  website: string | null;
  contactEmail: string | null;
  triggerReason: string | null;
  dialogue: unknown;
  status: ContactStatus;
  followUpCount: number;
  nextFollowUpAt: string | null;
  contactedAt: string;
  leadId: string | null;
  leadStage: string | null;
};

type Snapshot = { id: string; createdAt: string; payload: unknown };

type SnapshotPayload = {
  companiesParsed?: number;
  emailsSent?: number;
  accounts?: { name?: string; sentToday?: number; dailyLimit?: number }[];
};

const STATUS_LABEL: Record<ContactStatus, string> = {
  WRITTEN: "Отправили",
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

export function B2bEmailDashboard({
  snapshots,
  contacts,
}: {
  snapshots: Snapshot[];
  contacts: Contact[];
}) {
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

  const trend = useMemo(
    () =>
      snapshots.map((s) => {
        const p = asPayload(s.payload);
        return {
          date: new Date(s.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          companiesParsed: p.companiesParsed ?? 0,
          emailsSent: p.emailsSent ?? 0,
        };
      }),
    [snapshots]
  );

  const latestAccounts = useMemo(() => {
    const last = snapshots[snapshots.length - 1];
    return last ? (asPayload(last.payload).accounts ?? []) : [];
  }, [snapshots]);

  return (
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
            <StatTile label="Отправили" value={String(stats.written)} />
            <StatTile label="Ответили" value={String(stats.replied)} accent="warning" />
            <StatTile label="Созвон назначен" value={String(stats.callScheduled)} accent="warning" />
            <StatTile label="Дошли до CRM-воронки" value={String(stats.reachedCrm)} accent="success" />
          </div>

          {trend.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Компании и отправки по снимкам</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="companiesParsed" name="Компаний обработано" stroke="#3b82f6" dot={false} />
                  <Line type="monotone" dataKey="emailsSent" name="Писем отправлено" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {latestAccounts.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Здоровье почтовых ящиков (последний снимок)</h3>
              <div className="flex flex-col gap-2">
                {latestAccounts.map((a, idx) => {
                  const sent = a.sentToday ?? 0;
                  const limit = a.dailyLimit ?? 0;
                  const usage = limit > 0 ? (sent / limit) * 100 : 0;
                  const risky = usage >= 80;
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="w-32 shrink-0 truncate font-medium text-foreground">{a.name ?? "—"}</span>
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

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" }) {
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
          {c.companyName || c.contactEmail || "Без названия"}
        </span>
        {c.website && <span className="text-xs text-muted">{c.website}</span>}
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
          {c.contactEmail && <div className="mb-2 text-xs text-muted">Email: {c.contactEmail}</div>}
          {c.triggerReason && (
            <div className="mb-2">
              <span className="text-xs text-muted">Почему выбрана компания: </span>
              <span className="text-foreground">{c.triggerReason}</span>
            </div>
          )}
          {c.status === "WRITTEN" && (
            <div className="mb-2 text-xs text-muted">
              Фоллоу-апов отправлено: {c.followUpCount}
              {c.nextFollowUpAt &&
                ` — следующий ${new Date(c.nextFollowUpAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`}
            </div>
          )}

          {dialogue.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {dialogue.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                    m.from === "agent"
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
