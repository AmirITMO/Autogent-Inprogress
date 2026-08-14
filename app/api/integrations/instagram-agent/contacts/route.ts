import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "INSTAGRAM_AGENT_API_KEY");

    const body = (await req.json()) as {
      channelId?: string;
      externalId?: string;
      username?: string;
      fullName?: string;
      bio?: string;
      category?: string;
      followers?: number;
      contactInfo?: string;
      sourceTag?: string;
    };

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }
    if (!body.externalId?.trim()) {
      return Response.json({ error: "externalId required" }, { status: 400 });
    }
    if (!body.username?.trim()) {
      return Response.json({ error: "username required" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const data = {
      username: body.username,
      fullName: body.fullName,
      bio: body.bio,
      category: body.category,
      followers: body.followers,
      contactInfo: body.contactInfo,
      sourceTag: body.sourceTag,
    };

    const contact = await prisma.instagramContact.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      update: data,
      create: { ...data, channelId: channel.id, externalId: body.externalId },
    });

    return Response.json({ id: contact.id, status: contact.status });
  } catch (err) {
    return integrationError(err);
  }
}
