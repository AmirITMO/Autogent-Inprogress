"use client";

import { useMemo, useState, useTransition } from "react";
import { KanbanBoard, type KanbanColumnData } from "@/components/kanban/KanbanBoard";
import { LEAD_STAGES, type LeadStageId, formatMoney } from "@/lib/constants";
import { moveLead } from "@/lib/actions/leads";
import { LeadCard, type LeadCardData } from "./LeadCard";
import { LeadModal } from "./LeadModal";
import { NewLeadModal } from "./NewLeadModal";

export function CrmBoard({ initialLeads }: { initialLeads: LeadCardData[] }) {
  const [query, setQuery] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [activeLead, setActiveLead] = useState<LeadCardData | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialLeads.filter((l) => {
      if (l.lost && !showLost) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q) ||
        l.contact?.toLowerCase().includes(q) ||
        l.contactName?.toLowerCase().includes(q) ||
        l.ownerName.toLowerCase().includes(q)
      );
    });
  }, [initialLeads, query, showLost]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по компании, контакту, менеджеру…"
          className="w-72 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
        />
        <button
          onClick={() => setShowLost((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            showLost
              ? "border-danger bg-danger/10 text-danger"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          Показывать отказы
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          + Новый лид
        </button>
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
      {creating && <NewLeadModal onClose={() => setCreating(false)} />}
    </div>
  );
}
