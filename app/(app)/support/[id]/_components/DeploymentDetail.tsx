"use client";

import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { DEPLOYMENT_STATUS_LABEL, DEPLOYMENT_STATUS_ACCENT, TASK_PRIORITY_LABEL } from "@/lib/constants";
import {
  updateDeployment,
  regenerateHeartbeatToken,
  createIncident,
  resolveIncident,
} from "@/lib/actions/support";

type Deployment = {
  id: string;
  serverHost: string | null;
  services: string[];
  runbook: string | null;
  heartbeatToken: string;
  heartbeatEverySeconds: number;
  status: string;
  lastHeartbeatAt: string | null;
  lastStatusDetail: string | null;
  assignedToId: string | null;
};

type Incident = {
  id: string;
  severity: string;
  title: string;
  detail: string | null;
  autoDetected: boolean;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  rootCause: string | null;
};

type Assignee = { id: string; name: string };

export function DeploymentDetail({
  deployment,
  incidents,
  assignees,
  appUrl,
}: {
  deployment: Deployment;
  incidents: Incident[];
  assignees: Assignee[];
  appUrl: string;
}) {
  const [token, setToken] = useState(deployment.heartbeatToken);
  const heartbeatUrl = `${appUrl}/api/support/heartbeat/${token}`;
  const accent = DEPLOYMENT_STATUS_ACCENT[deployment.status];

  const open = incidents.filter((i) => !i.resolvedAt);
  const resolved = incidents.filter((i) => i.resolvedAt);

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <StatusPanel deployment={deployment} accent={accent} />
          <ConfigPanel deployment={deployment} assignees={assignees} />
          <HeartbeatPanel heartbeatUrl={heartbeatUrl} deploymentId={deployment.id} onRegenerate={setToken} />
        </div>

        <div className="flex flex-col gap-4">
          <NewIncidentForm deploymentId={deployment.id} />
          <IncidentList title="Открытые инциденты" incidents={open} />
          <IncidentList title="Закрытые инциденты" incidents={resolved} collapsedByDefault />
        </div>
      </div>
    </div>
  );
}

function StatusPanel({ deployment, accent }: { deployment: Deployment; accent: string }) {
  const heartbeatLabel = deployment.lastHeartbeatAt
    ? formatDistanceToNow(new Date(deployment.lastHeartbeatAt), { addSuffix: true, locale: ru })
    : "ещё не было пинга";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
        >
          {DEPLOYMENT_STATUS_LABEL[deployment.status]}
        </span>
        <span className="text-xs text-muted">Пинг {heartbeatLabel}</span>
      </div>
      {deployment.lastStatusDetail && (
        <p className="mt-2 text-sm text-muted">{deployment.lastStatusDetail}</p>
      )}
    </div>
  );
}

function ConfigPanel({ deployment, assignees }: { deployment: Deployment; assignees: Assignee[] }) {
  const [form, setForm] = useState({
    serverHost: deployment.serverHost ?? "",
    services: deployment.services.join(", "),
    runbook: deployment.runbook ?? "",
    heartbeatEverySeconds: deployment.heartbeatEverySeconds,
    assignedToId: deployment.assignedToId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateDeployment(deployment.id, {
      serverHost: form.serverHost.trim() || null,
      services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
      runbook: form.runbook.trim() || null,
      heartbeatEverySeconds: form.heartbeatEverySeconds,
      assignedToId: form.assignedToId || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function field(key: "serverHost" | "services", label: string) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">{label}</label>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Конфигурация</h2>
      {field("serverHost", "Сервер")}
      {field("services", "Сервисы (через запятую)")}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Runbook</label>
        <textarea
          rows={3}
          value={form.runbook}
          onChange={(e) => setForm((f) => ({ ...f, runbook: e.target.value }))}
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
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Сохраняю…" : saved ? "Сохранено ✓" : "Сохранить"}
      </button>
    </div>
  );
}

function HeartbeatPanel({
  heartbeatUrl,
  deploymentId,
  onRegenerate,
}: {
  heartbeatUrl: string;
  deploymentId: string;
  onRegenerate: (token: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(heartbeatUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleRegenerate() {
    if (!confirm("Старый токен перестанет работать — heartbeat-клиент на сервере клиента нужно будет обновить. Продолжить?")) return;
    setBusy(true);
    const token = await regenerateHeartbeatToken(deploymentId);
    onRegenerate(token);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Heartbeat-эндпоинт</h2>
      <p className="text-xs text-muted">
        Вставьте в конфиг сервиса клиента (см. support_heartbeat_client/ в основном репо) как SUPPORT_HEARTBEAT_URL.
      </p>
      <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">{heartbeatUrl}</code>
      <div className="flex gap-2">
        <button onClick={handleCopy} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2">
          {copied ? "Скопировано ✓" : "Скопировать"}
        </button>
        <button
          onClick={handleRegenerate}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          Перевыпустить токен
        </button>
      </div>
    </div>
  );
}

function NewIncidentForm({ deploymentId }: { deploymentId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState<"P0" | "P1" | "P2" | "P3">("P1");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    await createIncident(deploymentId, { title: title.trim(), detail: detail.trim() || undefined, severity });
    setSaving(false);
    setTitle("");
    setDetail("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
      >
        + Зафиксировать инцидент вручную
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Что случилось"
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />
      <textarea
        rows={2}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Подробности (необязательно)"
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as typeof severity)}
        className="w-32 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      >
        {(["P0", "P1", "P2", "P3"] as const).map((p) => (
          <option key={p} value={p}>
            {TASK_PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">
          Отмена
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !title.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Создаю…" : "Создать"}
        </button>
      </div>
    </div>
  );
}

function IncidentList({
  title,
  incidents,
  collapsedByDefault,
}: {
  title: string;
  incidents: Incident[];
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (incidents.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <h2 className="text-sm font-semibold text-foreground">
          {title} ({incidents.length})
        </h2>
        <span className="text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {incidents.map((i) => (
            <IncidentRow key={i.id} incident={i} />
          ))}
        </div>
      )}
    </div>
  );
}

const SEVERITY_ACCENT: Record<string, string> = { P0: "danger", P1: "warning", P2: "accent", P3: "success" };

function IncidentRow({ incident: i }: { incident: Incident }) {
  const [resolving, setResolving] = useState(false);
  const [rootCause, setRootCause] = useState("");
  const [saving, setSaving] = useState(false);
  const accent = SEVERITY_ACCENT[i.severity] ?? "accent";

  async function handleResolve() {
    setSaving(true);
    await resolveIncident(i.id, rootCause.trim() || undefined);
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
            >
              {i.severity}
            </span>
            <span className="text-sm font-medium text-foreground">{i.title}</span>
            {i.autoDetected && <span className="text-[11px] text-muted">авто</span>}
          </div>
          {i.detail && <p className="mt-1 text-xs text-muted">{i.detail}</p>}
        </div>
        <span className="shrink-0 text-[11px] text-muted">
          {format(new Date(i.detectedAt), "d MMM HH:mm", { locale: ru })}
        </span>
      </div>

      {i.resolvedAt ? (
        <p className="mt-2 text-xs text-muted">
          Решено {format(new Date(i.resolvedAt), "d MMM HH:mm", { locale: ru })}
          {i.resolvedByName ? ` — ${i.resolvedByName}` : ""}
          {i.rootCause ? `: ${i.rootCause}` : ""}
        </p>
      ) : resolving ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="Причина / что сделали (необязательно)"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
          />
          <button
            onClick={handleResolve}
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "…" : "Готово"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setResolving(true)}
          className="mt-2 rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-2"
        >
          Отметить решённым
        </button>
      )}
    </div>
  );
}
