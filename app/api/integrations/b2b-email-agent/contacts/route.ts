import type { Prisma, B2bEmailContactStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

const VALID_STATUSES: B2bEmailContactStatus[] = [
  "WRITTEN",
  "REPLIED",
  "CALL_SCHEDULED",
  "LEAD_CREATED",
  "DECLINED",
];

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "B2B_EMAIL_AGENT_API_KEY");

    const body = (await req.json()) as {
      channelId?: string;
      externalId?: string;
      companyName?: string;
      website?: string;
      contactEmail?: string;
      triggerReason?: string;
      status?: string;
      followUpCount?: number;
      nextFollowUpAt?: string;
      dialogue?: Prisma.InputJsonValue;
    };

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }
    if (!body.externalId?.trim()) {
      return Response.json({ error: "externalId required" }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status as B2bEmailContactStatus)) {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const data = {
      companyName: body.companyName,
      website: body.website,
      contactEmail: body.contactEmail,
      triggerReason: body.triggerReason,
      dialogue: body.dialogue,
      followUpCount: body.followUpCount,
      nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
    };

    const contact = await prisma.b2bEmailContact.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      update: { ...data, status: body.status as B2bEmailContactStatus | undefined },
      create: {
        ...data,
        channelId: channel.id,
        externalId: body.externalId,
        status: (body.status as B2bEmailContactStatus | undefined) ?? "WRITTEN",
      },
    });

    return Response.json({ id: contact.id, status: contact.status });
  } catch (err) {
    return integrationError(err);
  }
}
