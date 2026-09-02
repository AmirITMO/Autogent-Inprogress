import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/roles";
import { ChannelsView } from "./_components/ChannelsView";

export default async function ChannelsPage() {
  await requirePagePermission("viewChannels");

  const channels = await prisma.trafficChannel.findMany({
    where: { type: "MANUAL", isActive: true },
    orderBy: { order: "asc" },
  });

  const leadCounts = await prisma.lead.groupBy({
    by: ["channelId"],
    where: { channelId: { in: channels.map((c) => c.id) } },
    _count: { _all: true },
  });
  const countByChannel = new Map(leadCounts.map((c) => [c.channelId, c._count._all]));
  const totalLeads = leadCounts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Каналы трафика</h1>
      </div>
      <ChannelsView
        channels={channels.map((c) => ({ id: c.id, name: c.name, leadCount: countByChannel.get(c.id) ?? 0 }))}
        totalLeads={totalLeads}
      />
    </div>
  );
}
