"use client";

import { useMemo, useState, useTransition } from "react";
import { convertWebsiteContactToLead, declineWebsiteContact } from "@/lib/actions/websiteContacts";

type ContactStatus = "NEW" | "DECLINED" | "LEAD_CREATED";

type Contact = {
  id: string;
  title: string;
  company: string | null;
  description: string | null;
  contactName: string | null;
  contact: string | null;
  status: ContactStatus;
  createdAt: string;
  leadId: string | null;
  leadStage: string | null;
};

const STATUS_LABEL: Record<ContactStatus, string> = {
  NEW: "Новая",
  LEAD_CREATED: "Стала сделкой",
  DECLINED: "Отказ",
};

const STATUS_ACCENT: Record<ContactStatus, "success" | "danger" | "accent"> = {
  NEW: "accent",
  LEAD_CREATED: "success",
  DECLINED: "danger",
};

export function WebsiteDashboard({ contacts }: { contacts: Contact[] }) {
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const total = contacts.length;
    const isNew = contacts.filter((c) => c.status === "NEW").length;
    const converted = contacts.filter((c) => c.leadId).length;
    return { total, isNew, converted };
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.contactName?.toLowerCase().includes(q) ||
        c.contact?.toLowerCase().includes(q)
    );
  }, [contacts, query]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Всего заявок" value={String(stats.total)} />
        <StatTile label="Новых, не разобрано" value={String(stats.isNew)} accent="warning" />
        <StatTile label="Стали сделками" value={String(stats.converted)} accent="success" />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по заявке, компании, контакту…"
        className="mt-4 w-full max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />

      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Заявка</th>
              <th className="px-3 py-2 font-medium">Компания</th>
              <th className="px-3 py-2 font-medium">Контакт</th>
              <th className="px-3 py-2 font-medium">Детали</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Пришла</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted">
                  Заявок пока нет
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

  function handleDecline() {
    setError("");
    startTransition(async () => {
      await declineWebsiteContact(c.id);
    });
  }

  function handleConvert() {
    setError("");
    startTransition(async () => {
      try {
        await convertWebsiteContactToLead(c.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось создать сделку");
      }
    });
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2/50">
      <td className="px-3 py-2 font-medium text-foreground">{c.title}</td>
      <td className="px-3 py-2 text-muted">{c.company ?? "—"}</td>
      <td className="px-3 py-2 text-muted">
        {c.contactName && <div>{c.contactName}</div>}
        {c.contact ?? (!c.contactName && "—")}
      </td>
      <td className="max-w-[260px] truncate px-3 py-2 text-muted" title={c.description ?? ""}>
        {c.description ?? "—"}
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
        {new Date(c.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
      </td>
      <td className="px-3 py-2">
        {c.leadId ? (
          <span className="text-xs text-success">В CRM</span>
        ) : c.status === "DECLINED" ? (
          <span className="text-xs text-muted">Отклонена</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleDecline}
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
