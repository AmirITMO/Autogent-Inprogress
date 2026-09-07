"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import type { LeadStageId } from "@/lib/constants";
import { assertCanEditCrm, createLeadCore } from "./leadsCore";

// Заявки с сайта попадают вручную в CRM-сделку — та же логика, что у Instagram:
// автоматика только логирует контакт, решает и заводит сделку сотрудник.
export async function convertWebsiteContactToLead(contactId: string, stage?: LeadStageId) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const contact = await prisma.websiteContact.findUniqueOrThrow({ where: { id: contactId } });
  if (contact.leadId) throw new Error("Контакт уже привязан к сделке");

  const lead = await createLeadCore(user, {
    title: contact.title,
    company: contact.company ?? undefined,
    description: contact.description ?? undefined,
    contactName: contact.contactName ?? undefined,
    contact: contact.contact ?? undefined,
    channelId: contact.channelId,
    stage,
  });

  await prisma.websiteContact.update({
    where: { id: contact.id },
    data: { leadId: lead.id, status: "LEAD_CREATED" },
  });

  revalidatePath("/crm");
  revalidatePath(`/channels/${contact.channelId}`);
  return lead;
}

export async function declineWebsiteContact(contactId: string) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const contact = await prisma.websiteContact.update({
    where: { id: contactId },
    data: { status: "DECLINED" },
  });

  revalidatePath(`/channels/${contact.channelId}`);
}
