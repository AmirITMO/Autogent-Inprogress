import { prisma } from "@/lib/prisma";
import { B2B_EMAIL_AGENT_USER_ID } from "@/lib/constants";
import { createLeadCore } from "@/lib/actions/leadsCore";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "B2B_EMAIL_AGENT_API_KEY");

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

    let b2bContact = null;
    if (body.contactExternalId?.trim()) {
      b2bContact = await prisma.b2bEmailContact.findUnique({
        where: { channelId_externalId: { channelId: channel.id, externalId: body.contactExternalId } },
      });
      if (!b2bContact) {
        return Response.json({ error: "unknown_contact" }, { status: 400 });
      }
      // Идемпотентность на случай ретрая: контакт уже привязан к сделке —
      // отдаём её же, а не плодим вторую сделку с той же историей.
      if (b2bContact.leadId) {
        const existing = await prisma.lead.findUniqueOrThrow({ where: { id: b2bContact.leadId } });
        return Response.json({ id: existing.id, title: existing.title, channelId: existing.channelId });
      }
    }

    const lead = await createLeadCore(
      { id: B2B_EMAIL_AGENT_USER_ID, role: "EMPLOYEE" },
      {
        title: body.title.trim(),
        company: body.company ?? b2bContact?.companyName ?? undefined,
        description: body.description,
        contactName: body.contactName,
        contact: body.contact ?? b2bContact?.contactEmail ?? undefined,
        channelId: channel.id,
      }
    );

    if (b2bContact) {
      await prisma.b2bEmailContact.update({
        where: { id: b2bContact.id },
        data: { leadId: lead.id, status: "LEAD_CREATED" },
      });
    }

    return Response.json({ id: lead.id, title: lead.title, channelId: lead.channelId });
  } catch (err) {
    return integrationError(err);
  }
}
