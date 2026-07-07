"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KanbanBoard, type KanbanColumnData } from "@/components/kanban/KanbanBoard";
import { LEAD_STAGES, type LeadStageId, formatMoney } from "@/lib/constants";
import { moveLead } from "@/lib/actions/leads";
import { LeadCard, type LeadCardData } from "./LeadCard";
import { LeadModal } from "./LeadModal";
import { NewLeadModal } from "./NewLeadModal";

export function CrmBoard({
  initialLeads,
  channels,
  canEdit,
}: {
  initialLeads: LeadCardData[];
  channels: { id: string; name: string }[];
  canEdit: boolean;
}) {
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

  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (!leadId) return;
    const found = initialLeads.find((l) => l.id === leadId);
    if (found) setActiveLead(found);
    router.replace("/crm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMove(leadId: string, toColumnId: string, toIndex: number) {
    startTransition(() => {
      moveLead(leadId, toColumnId as LeadStageId, toIndex);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по компании, контакту, менеджеру…"
          className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent sm:w-72 sm:flex-none"
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
        <div className="hidden flex-1 sm:block" />
        {canEdit && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            + Новый лид
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <KanbanBoard
          columns={columns}
          onMove={handleMove}
          canDrag={() => canEdit}
          renderCard={(lead, dragging) => (
            <LeadCard lead={lead} dragging={dragging} onOpen={() => setActiveLead(lead)} />
          )}
        />
      </div>

      {activeLead && (
        <LeadModal
          lead={activeLead}
          channels={channels}
          readOnly={!canEdit}
          onClose={() => setActiveLead(null)}
        />
      )}
      {creating && canEdit && <NewLeadModal channels={channels} onClose={() => setCreating(false)} />}
    </div>
  );
}
