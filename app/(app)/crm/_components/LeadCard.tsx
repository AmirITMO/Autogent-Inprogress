import { formatMoney } from "@/lib/constants";

export type LeadCardData = {
  id: string;
  title: string;
  company: string | null;
  contact: string | null;
  link: string | null;
  stage: string;
  prepay: number;
  postpay: number;
  monthlySub: number;
  expenses: number;
  notes: string | null;
  order: number;
  ownerName: string;
};

export function LeadCard({
  lead,
  dragging,
  onOpen,
}: {
  lead: LeadCardData;
  dragging?: boolean;
  onOpen: () => void;
}) {
  const net = lead.prepay + lead.postpay + lead.monthlySub - lead.expenses;

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-lg border border-border bg-surface-2 p-3 text-left transition hover:border-accent/50 ${
        dragging ? "shadow-xl" : ""
      }`}
    >
      <div className="text-sm font-medium text-foreground">{lead.title}</div>
      {lead.company && (
        <div className="text-xs text-muted">{lead.company}</div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{lead.ownerName}</span>
        {net !== 0 && (
          <span className="text-xs font-medium text-accent">
            {formatMoney(net)}
          </span>
        )}
      </div>
    </button>
  );
}
