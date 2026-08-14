import type { Prisma, ScoutContactStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

const VALID_STATUSES: ScoutContactStatus[] = [
  "WRITTEN",
  "REPLIED",
  "CALL_SCHEDULED",
  "LEAD_CREATED",
  "DECLINED",
];

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "SCOUT_AGENT_API_KEY");

    const body = (await req.json()) as {
      channelId?: string;
      externalId?: string;
      name?: string;
      telegramUsername?: string;
      sourceChatName?: string;
      triggerMessage?: string;
      triggerReason?: string;
      outreachAccount?: string;
      status?: string;
      dialogue?: Prisma.InputJsonValue;
    };

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }
    if (!body.externalId?.trim()) {
      return Response.json({ error: "externalId required" }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status as ScoutContactStatus)) {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const data = {
      name: body.name,
      telegramUsername: body.telegramUsername,
      sourceChatName: body.sourceChatName,
      triggerMessage: body.triggerMessage,
      triggerReason: body.triggerReason,
      outreachAccount: body.outreachAccount,
      dialogue: body.dialogue,
    };

    const contact = await prisma.scoutAgentContact.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      update: { ...data, status: body.status as ScoutContactStatus | undefined },
      create: {
        ...data,
        channelId: channel.id,
        externalId: body.externalId,
        status: (body.status as ScoutContactStatus | undefined) ?? "WRITTEN",
      },
    });

    return Response.json({ id: contact.id, status: contact.status });
  } catch (err) {
    return integrationError(err);
  }
}
