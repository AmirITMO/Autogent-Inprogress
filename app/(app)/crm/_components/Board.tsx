"use client";

import { useMemo, useState, useTransition } from "react";
import { KanbanBoard, type KanbanColumnData } from "@/components/kanban/KanbanBoard";
import { LEAD_STAGES, type LeadStageId, formatMoney } from "@/lib/constants";
import { createLead, moveLead } from "@/lib/actions/leads";
import { LeadCard, type LeadCardData } from "./LeadCard";
import { LeadModal } from "./LeadModal";

export function CrmBoard({ initialLeads }: { initialLeads: LeadCardData[] }) {
  const [query, setQuery] = useState("");
  const [activeLead, setActiveLead] = useState<LeadCardData | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialLeads;
    return initialLeads.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.contact?.toLowerCase().includes(q) ||
        l.ownerName.toLowerCase().includes(q)
    );
  }, [initialLeads, query]);

  const columns: KanbanColumnData<LeadCardData>[] = LEAD_STAGES.map((stage) => {
    const items = filtered
      .filter((l) => l.stage === stage.id)
      .sort((a, b) => a.order - b.order);
    const total = items.reduce(
      (sum, l) => sum + l.prepay + l.postpay + l.monthlySub,
      0
    );
    return {
      id: stage.id,
      title: stage.title,
      accent: stage.accent,
      items,
      summary: total > 0 ? formatMoney(total) : undefined,
    };
  });

  function handleMove(leadId: string, toColumnId: string, toIndex: number) {
    startTransition(() => {
      moveLead(leadId, toColumnId as LeadStageId, toIndex);
    });
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    await createLead({ title: newTitle.trim(), company: newCompany.trim() || undefined });
    setNewTitle("");
    setNewCompany("");
    setCreating(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по компании, контакту, менеджеру…"
          className="w-72 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            + Новый лид
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Название сделки"
              className="w-48 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Компания"
              className="w-40 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
            <button
              onClick={handleCreate}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Создать
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <KanbanBoard
          columns={columns}
          onMove={handleMove}
          renderCard={(lead, dragging) => (
            <LeadCard lead={lead} dragging={dragging} onOpen={() => setActiveLead(lead)} />
          )}
        />
      </div>

      {activeLead && (
        <LeadModal lead={activeLead} onClose={() => setActiveLead(null)} />
      )}
    </div>
  );
}
