import { prisma } from "@/lib/prisma";
import { SCOUT_AGENT_USER_ID } from "@/lib/constants";
import { createLeadCore } from "@/lib/actions/leadsCore";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "SCOUT_AGENT_API_KEY");

    const body = (await req.json()) as {
      title?: string;
      company?: string;
      description?: string;
      contactName?: string;
      contact?: string;
      channelId?: string;
      contactExternalId?: string;
    };

    if (!body.title?.trim()) {
      return Response.json({ error: "title required" }, { status: 400 });
    }
    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    let scoutContact = null;
    if (body.contactExternalId?.trim()) {
      scoutContact = await prisma.scoutAgentContact.findUnique({
        where: { channelId_externalId: { channelId: channel.id, externalId: body.contactExternalId } },
      });
      if (!scoutContact) {
        return Response.json({ error: "unknown_contact" }, { status: 400 });
      }
    }

    const lead = await createLeadCore(
      { id: SCOUT_AGENT_USER_ID, role: "EMPLOYEE" },
      {
        title: body.title.trim(),
        company: body.company,
        description: body.description,
        contactName: body.contactName ?? scoutContact?.name ?? undefined,
        contact: body.contact ?? scoutContact?.telegramUsername ?? undefined,
        channelId: channel.id,
      }
    );

    if (scoutContact) {
      await prisma.scoutAgentContact.update({
        where: { id: scoutContact.id },
        data: { leadId: lead.id, status: "LEAD_CREATED" },
      });
    }

    return Response.json({ id: lead.id, title: lead.title, channelId: lead.channelId });
  } catch (err) {
    return integrationError(err);
  }
}
