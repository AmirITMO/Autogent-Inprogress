"use client";

import { useEffect, useState } from "react";
import { updateLead, getLeadActivity } from "@/lib/actions/leads";
import { formatMoney } from "@/lib/constants";
import type { LeadCardData } from "./LeadCard";

type Activity = { id: string; message: string; createdAt: Date; user: { name: string } };

export function LeadModal({
  lead,
  onClose,
}: {
  lead: LeadCardData;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: lead.title,
    company: lead.company ?? "",
    contact: lead.contact ?? "",
    link: lead.link ?? "",
    prepay: lead.prepay,
    postpay: lead.postpay,
    monthlySub: lead.monthlySub,
    expenses: lead.expenses,
    notes: lead.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);

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
    await updateLead(lead.id, form);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Карточка лида</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("title", "Название сделки")}
          {field("company", "Компания")}
          {field("contact", "Контакт (ЛПР)")}
          {field("link", "Ссылка")}
          {field("prepay", "Предоплата", "number")}
          {field("postpay", "Постоплата", "number")}
          {field("monthlySub", "Ежемес. подписка", "number")}
          {field("expenses", "Растраты", "number")}
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
