"use client";

import { useEffect, useState } from "react";
import { updateLead, getLeadActivity, setLeadLost } from "@/lib/actions/leads";
import { formatMoney } from "@/lib/constants";
import { IconLink } from "@/components/icons";
import type { LeadCardData } from "./LeadCard";

type Activity = { id: string; message: string; createdAt: Date; user: { name: string } };

export function LeadModal({
  lead,
  channels,
  onClose,
}: {
  lead: LeadCardData;
  channels: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: lead.title,
    company: lead.company ?? "",
    description: lead.description ?? "",
    contactName: lead.contactName ?? "",
    contact: lead.contact ?? "",
    link: lead.link ?? "",
    prepay: lead.prepay,
    postpay: lead.postpay,
    monthlySub: lead.monthlySub,
    expenses: lead.expenses,
    notes: lead.notes ?? "",
    startDate: lead.startDate.slice(0, 10),
    channelId: lead.channelId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "");
  const [lostBusy, setLostBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    getLeadActivity(lead.id).then((a) => setActivity(a as unknown as Activity[]));
  }, [lead.id]);

  const net = form.prepay + form.postpay + form.monthlySub - form.expenses;

  function field<K extends keyof typeof form>(key: K, label: string, type = "text") {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">{label}</label>
        <input
          type={type}
          value={form[key] as string | number}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              [key]: type === "number" ? Number(e.target.value) : e.target.value,
            }))
          }
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    await updateLead(lead.id, { ...form, channelId: form.channelId || null });
    setSaving(false);
    onClose();
  }

  async function handleMarkLost() {
    setLostBusy(true);
    await setLeadLost(lead.id, true, lostReason.trim() || undefined);
    setLostBusy(false);
    onClose();
  }

  async function handleUnmarkLost() {
    setLostBusy(true);
    await setLeadLost(lead.id, false);
    setLostBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Карточка лида
            {lead.lost && (
              <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                Отказ
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${location.origin}/crm?lead=${lead.id}`);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <IconLink className="h-3.5 w-3.5" />
              {linkCopied ? "Скопировано" : "Копировать ссылку"}
            </button>
            <button onClick={onClose} className="text-muted hover:text-foreground">
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("title", "Название сделки")}
          {field("company", "Компания")}
          {field("contactName", "Имя ЛПР")}
          {field("contact", "Контакт ЛПР")}
          {field("link", "Ссылка")}
          {field("prepay", "Предоплата", "number")}
          {field("postpay", "Постоплата", "number")}
          {field("monthlySub", "Ежемес. подписка", "number")}
          {field("expenses", "Растраты", "number")}
          {field("startDate", "Дата появления сделки", "date")}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Канал трафика</label>
            <select
              value={form.channelId}
              onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">—</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-xs text-muted">Дополнительное описание</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-xs text-muted">Прочее</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="Любые дополнительные заметки по лиду…"
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-2">
          <span className="text-sm text-muted">Чистыми</span>
          <span className="text-sm font-semibold text-accent">{formatMoney(net)}</span>
        </div>

        <div className="mt-4 rounded-lg border border-border p-3">
          {lead.lost ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted">
                Причина отказа: <span className="text-foreground">{lead.lostReason || "не указана"}</span>
              </div>
              <button
                onClick={handleUnmarkLost}
                disabled={lostBusy}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                Снять отметку
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="Причина отказа (например: КП не одобрено)"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-danger"
              />
              <button
                onClick={handleMarkLost}
                disabled={lostBusy}
                className="shrink-0 rounded-lg border border-danger px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                Отметить как отказ
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>

        {activity.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-medium text-muted">История</h3>
            <div className="flex flex-col gap-2">
              {activity.map((a) => (
                <div key={a.id} className="text-xs text-muted">
                  <span className="text-foreground">{a.user.name}</span> — {a.message}{" "}
                  <span>({new Date(a.createdAt).toLocaleString("ru-RU")})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
