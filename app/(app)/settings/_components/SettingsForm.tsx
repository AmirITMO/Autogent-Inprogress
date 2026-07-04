"use client";

import { useState } from "react";
import { updateSettings } from "@/lib/actions/settings";

export function SettingsForm({
  settings,
}: {
  settings: {
    morningSummaryTime: string;
    eveningSummaryTime: string;
    deadlineCheckInterval: number;
    timezone: string;
  };
}) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  async function save(next: typeof form) {
    setForm(next);
    await updateSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="max-w-lg rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Утренняя сводка">
          <input
            type="time"
            value={form.morningSummaryTime}
            onChange={(e) => save({ ...form, morningSummaryTime: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Вечерняя сводка">
          <input
            type="time"
            value={form.eveningSummaryTime}
            onChange={(e) => save({ ...form, eveningSummaryTime: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Проверка дедлайнов, мин">
          <input
            type="number"
            value={form.deadlineCheckInterval}
            onChange={(e) => save({ ...form, deadlineCheckInterval: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Часовой пояс">
          <input
            value={form.timezone}
            onChange={(e) => save({ ...form, timezone: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
      </div>
      {saved && <div className="mt-3 text-xs text-accent">Сохранено</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}
