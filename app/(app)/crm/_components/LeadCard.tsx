import { formatMoney } from "@/lib/constants";

export type LeadCardData = {
  id: string;
  title: string;
  company: string | null;
  description: string | null;
  contactName: string | null;
  contact: string | null;
  link: string | null;
  stage: string;
  prepay: number;
  postpay: number;
  monthlySub: number;
  expenses: number;
  notes: string | null;
  lost: boolean;
  lostReason: string | null;
  startDate: string;
  order: number;
  ownerName: string;
  channelId: string | null;
  channelName: string | null;
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
      className={`w-full rounded-xl border border-border bg-surface p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md ${
        dragging ? "shadow-xl" : ""
      } ${lead.lost ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium leading-snug text-foreground">{lead.title}</div>
        {lead.lost && (
          <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
            Отказ
          </span>
        )}
      </div>
      {lead.company && (
        <div className="mt-0.5 text-xs text-muted">{lead.company}</div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            {lead.ownerName}
          </span>
          {lead.channelName && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
              {lead.channelName}
            </span>
          )}
        </span>
        {net !== 0 && (
          <span className="text-sm font-semibold text-accent">
            {formatMoney(net)}
          </span>
        )}
      </div>
    </button>
  );
}
