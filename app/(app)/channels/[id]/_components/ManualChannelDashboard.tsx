"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NewLeadModal } from "@/app/(app)/crm/_components/NewLeadModal";
import { addOutreachBatch } from "@/lib/actions/channelOutreach";
import { formatMoney } from "@/lib/constants";

type LeadRow = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  createdAt: string;
};

type OutreachBatch = { id: string; sentCount: number; positiveCount: number; note: string | null; createdAt: string };

type Financials = {
  totalLeads: number;
  lostLeads: number;
  paidLeads: number;
  conversionRate: number;
  revenue: number;
};

const STAGE_LABEL: Record<string, string> = {
  FIRST_TOUCH: "1 касание",
  SCHEDULED_CALL: "Назначили созвон",
  CALL_DONE: "Прошел созвон",
  SECOND_TOUCH_KP: "Второе касание и КП",
  SECOND_CALL_DONE: "Второй созвон прошел",
  KP_SENT: "КП подтверждено",
  APPROVED: "Ждём предоплату",
  PAID: "Оплата",
  IN_PROGRESS: "В работе",
  POSTPAY: "Постоплата",
  SUPPORT: "Поддержка",
};

export function ManualChannelDashboard({
  channelId,
  channelName,
  allChannels,
  financials,
  leads,
  outreachBatches,
  showOutreachForm,
}: {
  channelId: string;
  channelName: string;
  allChannels: { id: string; name: string }[];
  financials: Financials;
  leads: LeadRow[];
  outreachBatches: OutreachBatch[];
  // hh.ru и подобные каналы без своего агента, где сотрудник отправляет
  // сообщения сам и заносит сюда только итоговые цифры за раз (см.
  // ChannelOutreachBatch) — остальные каналы этой формы не показывают.
  showOutreachForm: boolean;
}) {
  const [tab, setTab] = useState<"analytics" | "reports">("analytics");
  const [showNewLead, setShowNewLead] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          Аналитика
        </TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>
          Отчётность
        </TabButton>
      </div>

      {tab === "analytics" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Лидов всего" value={String(financials.totalLeads)} />
            <StatTile label="Оплачено" value={String(financials.paidLeads)} accent="success" />
            <StatTile label="Конверсия" value={`${financials.conversionRate.toFixed(1)}%`} />
            <StatTile label="Отказов" value={String(financials.lostLeads)} accent={financials.lostLeads > 0 ? "danger" : undefined} />
          </div>
          {financials.revenue > 0 && (
            <div className="mt-3">
              <StatTile label="Выручка" value={formatMoney(financials.revenue)} accent="success" />
            </div>
          )}

          {outreachBatches.length > 0 && (
            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Отправки и отклик по периодам</h3>
              <div className="flex flex-col gap-1.5">
                {outreachBatches.map((b) => {
                  const rate = b.sentCount > 0 ? ((b.positiveCount / b.sentCount) * 100).toFixed(0) : "0";
                  return (
                    <div key={b.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="text-muted">
                        {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                        {b.note && ` — ${b.note}`}
                      </span>
                      <span className="text-foreground">
                        {b.sentCount} отправлено → {b.positiveCount} положительных ({rate}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="flex-1 overflow-y-auto p-5">
          {showOutreachForm && <OutreachForm channelId={channelId} onSaved={() => router.refresh()} />}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Лиды с этого канала ({leads.length})</h3>
            <button
              onClick={() => setShowNewLead(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              + Добавить лида
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {leads.length === 0 ? (
              <p className="text-sm text-muted">Пока ни одного лида с этого канала</p>
            ) : (
              leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/crm?lead=${l.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-accent"
                >
                  <span className="text-foreground">{l.title}{l.company ? ` — ${l.company}` : ""}</span>
                  <span className="text-xs text-muted">
                    {STAGE_LABEL[l.stage] ?? l.stage} · {new Date(l.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {showNewLead && (
        <NewLeadModal
          channels={allChannels}
          fixedChannelId={channelId}
          initialStage="FIRST_TOUCH"
          onCreated={() => router.refresh()}
          onClose={() => setShowNewLead(false)}
        />
      )}
    </div>
  );
}

function OutreachForm({ channelId, onSaved }: { channelId: string; onSaved: () => void }) {
  const [sent, setSent] = useState("");
  const [positive, setPositive] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    const result = await addOutreachBatch(channelId, Number(sent), Number(positive), note || undefined);
    if (result.error) {
      setError(result.error);
    } else {
      setSent("");
      setPositive("");
      setNote("");
      onSaved();
    }
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Занести отправку</h3>
      <p className="mb-3 text-xs text-muted">
        Отправляете сами (вручную или расширением) — сюда только итоговые цифры за раз. На каждый
        положительный ответ, который реально стоит вести дальше, заведите отдельного лида кнопкой ниже —
        он попадёт на этап «1 касание».
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Отправлено">
          <input
            type="number"
            value={sent}
            onChange={(e) => setSent(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Положительных ответов">
          <input
            type="number"
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Комментарий">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="например, HR-отдел продаж, hh.ru"
            className="w-56 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <button
          onClick={handleSave}
          disabled={saving || !Number(sent)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
        active ? "border-b-2 border-accent text-accent" : "border-b-2 border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: accent ? `var(--${accent})` : "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}
