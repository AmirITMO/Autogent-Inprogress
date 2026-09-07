import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";
import { notifyNewWebsiteContact } from "@/lib/notifications/websiteLead";

export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "WEBSITE_API_KEY");

    const body = (await req.json()) as {
      channelId?: string;
      externalId?: string;
      title?: string;
      company?: string;
      description?: string;
      contactName?: string;
      contact?: string;
    };

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }
    if (!body.externalId?.trim()) {
      return Response.json({ error: "externalId required" }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return Response.json({ error: "title required" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const data = {
      title: body.title.trim(),
      company: body.company,
      description: body.description,
      contactName: body.contactName,
      contact: body.contact,
    };

    // upsert по (channelId, externalId): сетевой ретрай от gateway не плодит
    // вторую карточку — обновляет ту же (в CRM-воронку контакт не попадает
    // автоматически ни при первом запросе, ни при повторном).
    const isNew = !(await prisma.websiteContact.findUnique({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      select: { id: true },
    }));

    const contact = await prisma.websiteContact.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      update: data,
      create: { ...data, channelId: channel.id, externalId: body.externalId },
    });

    if (isNew) {
      await notifyNewWebsiteContact(contact);
    }

    return Response.json({ id: contact.id, status: contact.status });
  } catch (err) {
    return integrationError(err);
  }
}
