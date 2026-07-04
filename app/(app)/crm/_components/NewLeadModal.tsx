"use client";

import { useState } from "react";
import { createLead } from "@/lib/actions/leads";

export function NewLeadModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    title: "",
    company: "",
    description: "",
    contactName: "",
    contact: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);
    await createLead({
      title: form.title.trim(),
      company: form.company.trim() || undefined,
      description: form.description.trim() || undefined,
      contactName: form.contactName.trim() || undefined,
      contact: form.contact.trim() || undefined,
    });
    setSaving(false);
    onClose();
  }

  function field(key: keyof typeof form, label: string, placeholder?: string) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">{label}</label>
        <input
          autoFocus={key === "title"}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Новый лид</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {field("title", "Название сделки")}
          {field("company", "Компания")}
          {field("contactName", "Имя ЛПР")}
          {field("contact", "Контакт ЛПР", "телефон, telegram…")}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Дополнительное описание</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !form.title.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
