import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/roles";
import { ScoutAgentDashboard } from "./_components/ScoutAgentDashboard";

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("viewChannels");
  const { id } = await params;

  const channel = await prisma.trafficChannel.findUnique({ where: { id } });
  if (!channel) notFound();

  const [snapshots, contacts] = await Promise.all([
    prisma.scoutAgentMetricSnapshot.findMany({
      where: { channelId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.scoutAgentContact.findMany({
      where: { channelId: id },
      orderBy: { contactedAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, stage: true } } },
    }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <Link href="/channels" className="text-xs text-muted hover:text-foreground">
          ← Каналы трафика
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{channel.name}</h1>
        <p className="text-sm text-muted">Аналитика скаут-агента: контакты, диалоги, здоровье аккаунтов</p>
      </div>
      <ScoutAgentDashboard
        snapshots={snapshots
          .slice()
          .reverse()
          .map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), payload: s.payload }))}
        contacts={contacts.map((c) => ({
          id: c.id,
          name: c.name,
          telegramUsername: c.telegramUsername,
          sourceChatName: c.sourceChatName,
          triggerMessage: c.triggerMessage,
          triggerReason: c.triggerReason,
          outreachAccount: c.outreachAccount,
          dialogue: c.dialogue,
          status: c.status,
          contactedAt: c.contactedAt.toISOString(),
          leadId: c.leadId,
          leadStage: c.lead?.stage ?? null,
        }))}
      />
    </div>
  );
}
