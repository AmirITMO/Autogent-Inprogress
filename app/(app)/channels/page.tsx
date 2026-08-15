import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/roles";
import { computeChannelFinancials } from "@/lib/channelFinancials";
import { ChannelsView } from "./_components/ChannelsView";

export default async function ChannelsPage() {
  await requirePagePermission("viewChannels");

  const [channels, leads, spends] = await Promise.all([
    prisma.trafficChannel.findMany({
      orderBy: { order: "asc" },
    }),
    prisma.lead.findMany({
      select: { id: true, channelId: true, stage: true, lost: true, prepay: true, postpay: true },
    }),
    prisma.channelSpend.findMany({ orderBy: { date: "desc" } }),
  ]);

  const metrics = channels.map((c) => {
    const channelLeads = leads.filter((l) => l.channelId === c.id);
    const channelSpends = spends.filter((s) => s.channelId === c.id);
    const financials = computeChannelFinancials(channelLeads, channelSpends);

    return {
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      type: c.type,
      ...financials,
      spends: channelSpends.map((s) => ({
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
