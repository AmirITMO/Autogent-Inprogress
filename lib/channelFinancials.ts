import { stageAtOrAfter } from "@/lib/accounting";
import type { LeadStageId } from "@/lib/constants";

// Decimal-подобный тип — принимает и Prisma Decimal (у него есть toString()), и number/string.
type Numeric = number | string | { toString(): string };

type LeadForFinancials = {
  stage: LeadStageId;
  lost: boolean;
  prepay: Numeric;
  postpay: Numeric;
};

type SpendForFinancials = { amount: Numeric };

export function computeChannelFinancials(leads: LeadForFinancials[], spends: SpendForFinancials[]) {
  const activeLeads = leads.filter((l) => !l.lost);
  const paidLeads = activeLeads.filter((l) => stageAtOrAfter(l.stage, "PAID"));
  const revenue = activeLeads.reduce((sum, l) => sum + Number(l.prepay) + Number(l.postpay), 0);
  const spend = spends.reduce((sum, s) => sum + Number(s.amount), 0);

  return {
    totalLeads: leads.length,
    lostLeads: leads.length - activeLeads.length,
    paidLeads: paidLeads.length,
    conversionRate: leads.length > 0 ? (paidLeads.length / leads.length) * 100 : 0,
    revenue,
    spend,
    roi: spend > 0 ? ((revenue - spend) / spend) * 100 : null,
    cac: paidLeads.length > 0 ? spend / paidLeads.length : null,
    avgCheck: paidLeads.length > 0 ? revenue / paidLeads.length : null,
  };
}
