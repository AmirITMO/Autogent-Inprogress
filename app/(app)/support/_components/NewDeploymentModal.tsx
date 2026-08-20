"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDeployment } from "@/lib/actions/support";

type EligibleLead = { id: string; title: string; company: string | null; stage: string };
type Assignee = { id: string; name: string };

export function NewDeploymentModal({
  eligibleLeads,
  assignees,
  onClose,
}: {
  eligibleLeads: EligibleLead[];
  assignees: Assignee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    leadId: eligibleLeads[0]?.id ?? "",
    serverHost: "",
    services: "",
    runbook: "",
    heartbeatEverySeconds: 300,
    assignedToId: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!form.leadId) return;
    setSaving(true);
    const deployment = await createDeployment({
      leadId: form.leadId,
      serverHost: form.serverHost.trim() || undefined,
      services: form.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      runbook: form.runbook.trim() || undefined,
      heartbeatEverySeconds: form.heartbeatEverySeconds,
      assignedToId: form.assignedToId || undefined,
    });
    setSaving(false);
    onClose();
    router.push(`/support/${deployment.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Подключить проект к мониторингу</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Сделка (Поддержка / Постоплата)</label>
            <select
              value={form.leadId}
              onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            >
              {eligibleLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                  {l.company ? ` (${l.company})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Сервер</label>
            <input
              value={form.serverHost}
              onChange={(e) => setForm((f) => ({ ...f, serverHost: e.target.value }))}
              placeholder="ssh deploy@1.2.3.4 -p 2222"
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Сервисы (через запятую)</label>
            <input
              value={form.services}
              onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
              placeholder="app, db, telegram-bot"
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Runbook (что делать при инциденте)</label>
            <textarea
              rows={3}
              value={form.runbook}
              onChange={(e) => setForm((f) => ({ ...f, runbook: e.target.value }))}
              placeholder="docker compose restart app"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted">Интервал heartbeat, сек</label>
              <input
                type="number"
                min={30}
                value={form.heartbeatEverySeconds}
                onChange={(e) => setForm((f) => ({ ...f, heartbeatEverySeconds: Number(e.target.value) }))}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted">Ответственный</label>
              <select
                value={form.assignedToId}
                onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              >
                <option value="">—</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !form.leadId}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Создаю…" : "Подключить"}
          </button>
        </div>
      </div>
    </div>
  );
}
