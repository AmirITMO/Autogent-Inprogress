"use client";

import { useState } from "react";
import { updateSettings } from "@/lib/actions/settings";

const DEADLINE_INTERVAL_OPTIONS = Array.from({ length: (180 - 15) / 15 + 1 }, (_, i) => 15 + i * 15);

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
  const [error, setError] = useState("");

  async function save(next: typeof form) {
    const prev = form;
    setForm(next);
    setError("");
    const result = await updateSettings(next);
    if (result.error) {
      setError(result.error);
      setForm(prev);
      return;
    }
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
          <select
            value={form.deadlineCheckInterval}
            onChange={(e) => save({ ...form, deadlineCheckInterval: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            {DEADLINE_INTERVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Часовой пояс">
          <input
            value="Europe/Moscow"
            disabled
            title="Платформа работает по московскому времени и не поддерживает другие часовые пояса"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-muted outline-none disabled:opacity-70"
          />
        </Field>
      </div>
      {error && <div className="mt-3 text-xs text-danger">{error}</div>}
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
