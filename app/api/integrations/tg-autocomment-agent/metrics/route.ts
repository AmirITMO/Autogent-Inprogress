import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "TG_AUTOCOMMENT_AGENT_API_KEY");

    const body = (await req.json()) as { channelId?: string } & Prisma.InputJsonObject;

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const snapshot = await prisma.tgCommentMetricSnapshot.create({
      data: { channelId: channel.id, payload: body },
    });

    return Response.json({ id: snapshot.id, createdAt: snapshot.createdAt });
  } catch (err) {
    return integrationError(err);
  }
}
