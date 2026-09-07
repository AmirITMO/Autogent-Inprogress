import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/roles";
import { ChannelsView } from "./_components/ChannelsView";

export default async function ChannelsPage() {
  await requirePagePermission("viewChannels");

  // WEBSITE рядом с MANUAL в этом же упрощённом списке (по просьбе пользователя) —
  // единственный автоматический канал, у которого нет собственного отдельного
  // пункта меню, в отличие от архивированных Instagram/B2B/Scout.
  const channels = await prisma.trafficChannel.findMany({
    where: { type: { in: ["MANUAL", "WEBSITE"] }, isActive: true },
    orderBy: { order: "asc" },
  });
  const manualIds = channels.filter((c) => c.type === "MANUAL").map((c) => c.id);
  const websiteIds = channels.filter((c) => c.type === "WEBSITE").map((c) => c.id);

  const [leadCounts, newContactCounts] = await Promise.all([
    prisma.lead.groupBy({ by: ["channelId"], where: { channelId: { in: manualIds } }, _count: { _all: true } }),
    // Для WEBSITE считаем непросмотренные заявки, а не сделки — сделка здесь
    // появляется только после того, как сотрудник сам её создаст.
    prisma.websiteContact.groupBy({
      by: ["channelId"],
      where: { channelId: { in: websiteIds }, status: "NEW" },
      _count: { _all: true },
    }),
  ]);
  const countByChannel = new Map(leadCounts.map((c) => [c.channelId, c._count._all]));
  const newByChannel = new Map(newContactCounts.map((c) => [c.channelId, c._count._all]));
  const totalLeads = leadCounts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Каналы трафика</h1>
      </div>
      <ChannelsView
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          leadCount: countByChannel.get(c.id) ?? 0,
          newCount: c.type === "WEBSITE" ? (newByChannel.get(c.id) ?? 0) : undefined,
        }))}
        totalLeads={totalLeads}
      />
    </div>
  );
}
