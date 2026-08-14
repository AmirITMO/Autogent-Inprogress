"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import type { LeadStageId } from "@/lib/constants";
import { assertCanEditCrm, createLeadCore } from "./leadsCore";

// Instagram-контакты попадают вручную в CRM-сделку — агент только собирает базу,
// пишет и решает сотрудник, поэтому это обычный server action от лица реального
// пользователя, а не сервисного аккаунта (в отличие от скаута и B2B email-агента).
export async function convertInstagramContactToLead(contactId: string, stage?: LeadStageId) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const contact = await prisma.instagramContact.findUniqueOrThrow({ where: { id: contactId } });
  if (contact.leadId) throw new Error("Контакт уже привязан к сделке");

  const lead = await createLeadCore(user, {
    title: contact.fullName || contact.username,
    contactName: contact.fullName ?? undefined,
    contact: `@${contact.username}`,
    channelId: contact.channelId,
    stage,
  });

  await prisma.instagramContact.update({
    where: { id: contact.id },
    data: { leadId: lead.id, status: "LEAD_CREATED" },
  });

  revalidatePath("/crm");
  revalidatePath(`/channels/${contact.channelId}`);
  return lead;
}

export async function markInstagramContactStatus(
  contactId: string,
  status: "FOUND" | "CONTACTED" | "DECLINED"
) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const contact = await prisma.instagramContact.update({
    where: { id: contactId },
    data: { status },
  });

  revalidatePath(`/channels/${contact.channelId}`);
}
