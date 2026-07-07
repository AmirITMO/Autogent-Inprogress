import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { stageAtOrAfter } from "@/lib/accounting";
import { ChannelsView } from "./_components/ChannelsView";

export default async function ChannelsPage() {
  await requireAdmin();

  const [channels, leads, spends] = await Promise.all([
    prisma.trafficChannel.findMany({ orderBy: { order: "asc" } }),
    prisma.lead.findMany({
      select: { id: true, channelId: true, stage: true, lost: true, prepay: true, postpay: true },
    }),
    prisma.channelSpend.findMany({ orderBy: { date: "desc" } }),
  ]);

  const metrics = channels.map((c) => {
    const channelLeads = leads.filter((l) => l.channelId === c.id);
    const activeLeads = channelLeads.filter((l) => !l.lost);
    const paidLeads = activeLeads.filter((l) => stageAtOrAfter(l.stage, "PAID"));
    const revenue = activeLeads.reduce((sum, l) => sum + Number(l.prepay) + Number(l.postpay), 0);
    const spend = spends
      .filter((s) => s.channelId === c.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    return {
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      totalLeads: channelLeads.length,
      lostLeads: channelLeads.length - activeLeads.length,
      paidLeads: paidLeads.length,
      conversionRate: channelLeads.length > 0 ? (paidLeads.length / channelLeads.length) * 100 : 0,
      revenue,
      spend,
      roi: spend > 0 ? ((revenue - spend) / spend) * 100 : null,
      cac: paidLeads.length > 0 ? spend / paidLeads.length : null,
      avgCheck: paidLeads.length > 0 ? revenue / paidLeads.length : null,
      spends: spends
        .filter((s) => s.channelId === c.id)
        .map((s) => ({
          id: s.id,
          amount: Number(s.amount),
          date: s.date.toISOString(),
          note: s.note,
        })),
    };
  });

  const unattributedCount = leads.filter((l) => !l.channelId).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Каналы трафика</h1>
        <p className="text-sm text-muted">
          Конверсии, затраты и эффективность по каждому источнику лидов
        </p>
      </div>
      <ChannelsView metrics={metrics} unattributedCount={unattributedCount} />
    </div>
  );
}
