"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/constants";
import {
  createChannel,
  renameChannel,
  toggleChannelActive,
  deleteChannel,
  addChannelSpend,
  deleteChannelSpend,
} from "@/lib/actions/channels";

type Spend = { id: string; amount: number; date: string; note: string | null };
type ChannelMetrics = {
  id: string;
  name: string;
  isActive: boolean;
  totalLeads: number;
  lostLeads: number;
  paidLeads: number;
  conversionRate: number;
  revenue: number;
  spend: number;
  roi: number | null;
  cac: number | null;
  avgCheck: number | null;
  spends: Spend[];
};

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

export function ChannelsView({
  metrics,
  unattributedCount,
}: {
  metrics: ChannelMetrics[];
  unattributedCount: number;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const visible = metrics.filter((m) => showArchived || m.isActive);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    await createChannel(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Название канала (например, Instagram Ads)"
          className="w-72 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {creating ? "Добавление…" : "+ Добавить канал"}
        </button>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            showArchived
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          Показывать архивные
        </button>
        {unattributedCount > 0 && (
          <span className="text-xs text-muted">
            {unattributedCount} сделок без привязки к каналу — укажите канал в карточке лида
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Каналов пока нет — добавьте первый выше</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((m) => (
            <ChannelCard key={m.id} metrics={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ metrics: m }: { metrics: ChannelMetrics }) {
  const [name, setName] = useState(m.name);
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [addingSpend, setAddingSpend] = useState(false);
  const [showSpends, setShowSpends] = useState(false);

  async function commitRename() {
    setEditingName(false);
    if (name.trim() && name.trim() !== m.name) await renameChannel(m.id, name.trim());
  }

  async function handleAddSpend() {
    const value = Number(amount);
    if (!value || value <= 0) return;
    setAddingSpend(true);
    await addChannelSpend({ channelId: m.id, amount: value, note: note || undefined });
    setAmount("");
    setNote("");
    setAddingSpend(false);
  }

  async function handleDelete() {
    if (!confirm(`Удалить канал «${m.name}»?`)) return;
    setBusy(true);
    const result = await deleteChannel(m.id);
    if (result.error) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${!m.isActive ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm font-semibold text-foreground outline-none focus:border-accent"
          />
        ) : (
          <h3
            onDoubleClick={() => setEditingName(true)}
            title="Двойной клик — переименовать"
            className="cursor-text text-sm font-semibold text-foreground"
          >
            {m.name}
          </h3>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleChannelActive(m.id, !m.isActive)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
          >
            {m.isActive ? "В архив" : "Вернуть"}
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      </div>
      {error && <div className="mt-1 text-xs text-danger">{error}</div>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Лидов" value={String(m.totalLeads)} />
        <Metric label="Оплачено" value={String(m.paidLeads)} accent="success" />
        <Metric label="Конверсия" value={pct(m.conversionRate)} />
        <Metric label="Отказов" value={String(m.lostLeads)} accent={m.lostLeads > 0 ? "danger" : undefined} />
        <Metric label="Выручка" value={formatMoney(m.revenue)} accent="success" />
        <Metric label="Затраты" value={formatMoney(m.spend)} accent="danger" />
        <Metric
          label="ROI"
          value={m.roi == null ? "—" : `${m.roi >= 0 ? "+" : ""}${m.roi.toFixed(0)}%`}
          accent={m.roi != null ? (m.roi >= 0 ? "success" : "danger") : undefined}
        />
        <Metric label="Цена клиента" value={m.cac == null ? "—" : formatMoney(m.cac)} />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted">Расход</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-1 min-w-[120px] flex-col gap-1">
            <label className="text-[11px] text-muted">Комментарий</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="например, за неделю"
              className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={handleAddSpend}
            disabled={addingSpend || !Number(amount)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Добавить
          </button>
          {m.spends.length > 0 && (
            <button
              onClick={() => setShowSpends((v) => !v)}
              className="ml-auto rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
            >
              {showSpends ? "Скрыть" : `История (${m.spends.length})`}
            </button>
          )}
        </div>

        {showSpends && (
          <div className="mt-3 flex flex-col gap-1.5">
            {m.spends.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
              >
                <span className="text-muted">
                  {new Date(s.date).toLocaleDateString("ru-RU")}
                  {s.note && ` — ${s.note}`}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{formatMoney(s.amount)}</span>
                  <button
                    onClick={() => deleteChannelSpend(s.id)}
                    className="text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "success" | "danger" }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div
        className="mt-0.5 text-sm font-semibold"
        style={{ color: accent ? `var(--${accent})` : "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
