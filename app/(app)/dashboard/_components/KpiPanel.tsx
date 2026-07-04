"use client";

import { useState } from "react";
import { setKpi, removeKpi } from "@/lib/actions/kpi";
import { KPI_METRICS, formatMoney, type KpiDirection } from "@/lib/constants";

export type KpiRow = { metricKey: string; target: number };

function progressOf(current: number, target: number, direction: KpiDirection) {
  if (target <= 0) return { pct: 0, met: false };
  if (direction === "min") {
    return { pct: Math.min(100, (current / target) * 100), met: current >= target };
  }
  return {
    pct: current <= target ? 100 : Math.max(0, 100 - ((current - target) / target) * 100),
    met: current <= target,
  };
}

export function KpiPanel({
  kpis,
  values,
  isAdmin,
}: {
  kpis: KpiRow[];
  values: Record<string, number>;
  isAdmin: boolean;
}) {
  const [managing, setManaging] = useState(false);

  const active = KPI_METRICS.filter((m) => kpis.some((k) => k.metricKey === m.key));

  if (active.length === 0 && !isAdmin) return null;

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">KPI</h3>
        {isAdmin && (
          <button
            onClick={() => setManaging(true)}
            className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-surface-2"
          >
            Настроить KPI
          </button>
        )}
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted">Цели не заданы.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((m) => {
            const kpi = kpis.find((k) => k.metricKey === m.key)!;
            const current = values[m.key] ?? 0;
            const { pct, met } = progressOf(current, kpi.target, m.direction);
            return (
              <div key={m.key} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{m.label}</span>
                  <span className={met ? "text-success" : "text-muted"}>{met ? "✓ выполнено" : ""}</span>
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {m.isMoney ? formatMoney(current) : current} / {m.isMoney ? formatMoney(kpi.target) : kpi.target}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: met ? "var(--success)" : "var(--accent)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {managing && <ManageKpiModal kpis={kpis} onClose={() => setManaging(false)} />}
    </div>
  );
}

function ManageKpiModal({ kpis, onClose }: { kpis: KpiRow[]; onClose: () => void }) {
  const [metricKey, setMetricKey] = useState(KPI_METRICS[0].key);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!target) return;
    setSaving(true);
    await setKpi(metricKey, Number(target));
    setSaving(false);
    setTarget("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Настройка KPI</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {kpis.map((k) => {
            const meta = KPI_METRICS.find((m) => m.key === k.metricKey);
            if (!meta) return null;
            return (
              <div
                key={k.metricKey}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="text-foreground">{meta.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted">{meta.isMoney ? formatMoney(k.target) : k.target}</span>
                  <button
                    onClick={() => removeKpi(k.metricKey)}
                    className="text-xs text-danger hover:underline"
                  >
                    убрать
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-muted">Метрика</label>
            <select
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              {KPI_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-28 flex-col gap-1">
            <label className="text-xs text-muted">Цель</label>
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !target}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
