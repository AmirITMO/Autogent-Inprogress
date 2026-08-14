import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/roles";
import { ScoutAgentDashboard } from "./_components/ScoutAgentDashboard";
import { InstagramDashboard } from "./_components/InstagramDashboard";
import { B2bEmailDashboard } from "./_components/B2bEmailDashboard";

const TYPE_SUBTITLE: Record<string, string> = {
  SCOUT_TELEGRAM: "Аналитика скаут-агента: контакты, диалоги, здоровье аккаунтов",
  INSTAGRAM: "База контактов, собранная агентом — переписку ведут сотрудники вручную",
  B2B_EMAIL: "Аналитика email-рассылок: контакты, диалоги, фоллоу-апы",
};

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("viewChannels");
  const { id } = await params;

  const channel = await prisma.trafficChannel.findUnique({ where: { id } });
  if (!channel || channel.type === "MANUAL") notFound();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <Link href="/channels" className="text-xs text-muted hover:text-foreground">
          ← Каналы трафика
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{channel.name}</h1>
        <p className="text-sm text-muted">{TYPE_SUBTITLE[channel.type]}</p>
      </div>
      {channel.type === "SCOUT_TELEGRAM" && <ScoutChannel channelId={id} />}
      {channel.type === "INSTAGRAM" && <InstagramChannel channelId={id} />}
      {channel.type === "B2B_EMAIL" && <B2bEmailChannel channelId={id} />}
    </div>
  );
}

async function ScoutChannel({ channelId }: { channelId: string }) {
  const [snapshots, contacts] = await Promise.all([
    prisma.scoutAgentMetricSnapshot.findMany({
      where: { channelId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.scoutAgentContact.findMany({
      where: { channelId },
      orderBy: { contactedAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, stage: true } } },
    }),
  ]);

  return (
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
  );
}

async function InstagramChannel({ channelId }: { channelId: string }) {
  const [snapshots, contacts] = await Promise.all([
    prisma.instagramMetricSnapshot.findMany({
      where: { channelId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.instagramContact.findMany({
      where: { channelId },
      orderBy: { foundAt: "desc" },
      take: 500,
      include: { lead: { select: { id: true, stage: true } } },
    }),
  ]);

  return (
    <InstagramDashboard
      snapshots={snapshots
        .slice()
        .reverse()
        .map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), payload: s.payload }))}
      contacts={contacts.map((c) => ({
        id: c.id,
        username: c.username,
        fullName: c.fullName,
        bio: c.bio,
        category: c.category,
        followers: c.followers,
        contactInfo: c.contactInfo,
        sourceTag: c.sourceTag,
        status: c.status,
        foundAt: c.foundAt.toISOString(),
        leadId: c.leadId,
        leadStage: c.lead?.stage ?? null,
      }))}
    />
  );
}

async function B2bEmailChannel({ channelId }: { channelId: string }) {
  const [snapshots, contacts] = await Promise.all([
    prisma.b2bEmailMetricSnapshot.findMany({
      where: { channelId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.b2bEmailContact.findMany({
      where: { channelId },
      orderBy: { contactedAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, stage: true } } },
    }),
  ]);

  return (
    <B2bEmailDashboard
      snapshots={snapshots
        .slice()
        .reverse()
        .map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), payload: s.payload }))}
      contacts={contacts.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        website: c.website,
        contactEmail: c.contactEmail,
        triggerReason: c.triggerReason,
        dialogue: c.dialogue,
        status: c.status,
        followUpCount: c.followUpCount,
        nextFollowUpAt: c.nextFollowUpAt?.toISOString() ?? null,
        contactedAt: c.contactedAt.toISOString(),
        leadId: c.leadId,
        leadStage: c.lead?.stage ?? null,
      }))}
    />
  );
}
