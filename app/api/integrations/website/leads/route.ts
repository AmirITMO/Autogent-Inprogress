import { prisma } from "@/lib/prisma";
import { WEBSITE_AGENT_USER_ID } from "@/lib/constants";
import { createLeadCore } from "@/lib/actions/leadsCore";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";
import { notifyNewWebsiteLead } from "@/lib/notifications/websiteLead";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "WEBSITE_API_KEY");

    const body = (await req.json()) as {
      title?: string;
      company?: string;
      description?: string;
      contactName?: string;
      contact?: string;
      channelId?: string;
      externalId?: string;
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

    const lead = await createLeadCore(
      { id: WEBSITE_AGENT_USER_ID, role: "EMPLOYEE" },
      {
        title: body.title.trim(),
        company: body.company,
        description: body.description,
        contactName: body.contactName,
        contact: body.contact,
        channelId: channel.id,
      }
    );

    await notifyNewWebsiteLead(lead);

    return Response.json({ id: lead.id, title: lead.title, channelId: lead.channelId });
  } catch (err) {
    return integrationError(err);
  }
}
