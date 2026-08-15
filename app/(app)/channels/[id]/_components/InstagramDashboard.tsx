"use client";

import { useMemo, useState, useTransition } from "react";
import { convertInstagramContactToLead, markInstagramContactStatus } from "@/lib/actions/instagramContacts";
import { InstagramSearchLauncher } from "./InstagramSearchLauncher";

type ContactStatus = "FOUND" | "CONTACTED" | "LEAD_CREATED" | "DECLINED";

type Contact = {
  id: string;
  username: string;
  fullName: string | null;
  bio: string | null;
  category: string | null;
  followers: number | null;
  contactInfo: string | null;
  sourceTag: string | null;
  status: ContactStatus;
  foundAt: string;
  leadId: string | null;
  leadStage: string | null;
  draftMessage: string | null;
};

type SearchProfile = { id: string; name: string; criteria: unknown; createdAt: string };

type Snapshot = { id: string; createdAt: string; payload: unknown };

type SnapshotPayload = { accountsScanned?: number; accountsFound?: number };

function asPayload(value: unknown): SnapshotPayload {
  return typeof value === "object" && value !== null ? (value as SnapshotPayload) : {};
}

const STATUS_LABEL: Record<ContactStatus, string> = {
  FOUND: "Найден",
  CONTACTED: "Написали",
  LEAD_CREATED: "Стал сделкой",
  DECLINED: "Отказ",
};

const STATUS_ACCENT: Record<ContactStatus, "success" | "danger" | "warning" | "accent"> = {
  FOUND: "accent",
  CONTACTED: "warning",
  LEAD_CREATED: "success",
  DECLINED: "danger",
};

export function InstagramDashboard({
  channelId,
  snapshots,
  contacts,
  searchProfiles,
}: {
  channelId: string;
  snapshots: Snapshot[];
  contacts: Contact[];
  searchProfiles: SearchProfile[];
}) {
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const total = contacts.length;
    const contacted = contacts.filter((c) => c.status !== "FOUND").length;
    const converted = contacts.filter((c) => c.leadId).length;
    const last = snapshots[snapshots.length - 1];
    const totals = last ? asPayload(last.payload) : {};
    return { total, contacted, converted, totals };
  }, [contacts, snapshots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.fullName?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q)
    );
  }, [contacts, query]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Всего в базе" value={String(stats.total)} />
        <StatTile label="Написали" value={String(stats.contacted)} accent="warning" />
        <StatTile label="Дошли до CRM-воронки" value={String(stats.converted)} accent="success" />
        <StatTile
          label="Просканировано агентом"
          value={stats.totals.accountsScanned != null ? String(stats.totals.accountsScanned) : "—"}
        />
      </div>

      <div className="mt-4">
        <InstagramSearchLauncher channelId={channelId} searchProfiles={searchProfiles} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по юзернейму, имени, категории…"
        className="mt-3 w-full max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />

      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Аккаунт</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Подписчики</th>
              <th className="px-3 py-2 font-medium">Контакт</th>
              <th className="px-3 py-2 font-medium">Черновик оффера</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Найден</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              filtered.map((c) => <ContactRow key={c.id} contact={c} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContactRow({ contact: c }: { contact: Contact }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const accent = STATUS_ACCENT[c.status];

  function handleMark(status: "CONTACTED" | "DECLINED") {
    startTransition(async () => {
      await markInstagramContactStatus(c.id, status);
    });
  }

  function handleConvert() {
    setError("");
    startTransition(async () => {
      try {
        await convertInstagramContactToLead(c.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось создать сделку");
      }
    });
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2/50">
      <td className="px-3 py-2">
        <a
          href={`https://instagram.com/${c.username}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground hover:underline"
        >
          @{c.username}
        </a>
        {c.fullName && <div className="text-xs text-muted">{c.fullName}</div>}
      </td>
      <td className="px-3 py-2 text-muted">{c.category ?? "—"}</td>
      <td className="px-3 py-2 text-muted">{c.followers?.toLocaleString("ru-RU") ?? "—"}</td>
      <td className="px-3 py-2 text-muted">{c.contactInfo ?? "—"}</td>
      <td className="max-w-[220px] truncate px-3 py-2 text-muted" title={c.draftMessage ?? ""}>
        {c.draftMessage ?? "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
        >
          {STATUS_LABEL[c.status]}
        </span>
        {c.leadStage && <div className="mt-1 text-[11px] text-muted">этап «{c.leadStage}»</div>}
      </td>
      <td className="px-3 py-2 text-xs text-muted">
        {new Date(c.foundAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
      </td>
      <td className="px-3 py-2">
        {c.leadId ? (
          <span className="text-xs text-success">В CRM</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {c.status === "FOUND" && (
              <button
                onClick={() => handleMark("CONTACTED")}
                disabled={pending}
                className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
              >
                Написали
              </button>
            )}
            <button
              onClick={() => handleMark("DECLINED")}
              disabled={pending}
              className="rounded-lg border border-border px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Отказ
            </button>
            <button
              onClick={handleConvert}
              disabled={pending}
              className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Создать сделку
            </button>
          </div>
        )}
        {error && <div className="mt-1 text-[11px] text-danger">{error}</div>}
      </td>
    </tr>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ color: accent ? `var(--${accent})` : "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}
