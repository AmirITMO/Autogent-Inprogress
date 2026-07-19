"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import type { LeadStageId } from "@/lib/constants";
import {
  createLeadCore,
  deleteLeadCore,
  moveLeadCore,
  updateLeadCore,
  setLeadLostCore,
  reconcileAllLeadIncomeCore,
} from "./leadsCore";

export async function createLead(data: {
  title: string;
  company?: string;
  description?: string;
  contactName?: string;
  contact?: string;
  channelId?: string;
}) {
  const user = await requireUser();
  const lead = await createLeadCore(user, data);
  revalidatePath("/crm");
  revalidatePath("/accounting");
  return lead;
}

export async function deleteLead(leadId: string): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  const result = await deleteLeadCore(user, leadId);
  if (result.error) return result;
  revalidatePath("/crm");
  revalidatePath("/accounting");
  return {};
}

export async function moveLead(leadId: string, toStage: LeadStageId, toIndex: number) {
  const user = await requireUser();
  await moveLeadCore(user, leadId, toStage, toIndex);
  revalidatePath("/crm");
  revalidatePath("/accounting");
}

export async function updateLead(
  leadId: string,
  data: {
    title?: string;
    company?: string;
    description?: string;
    contactName?: string;
    contact?: string;
    link?: string;
    prepay?: number;
    postpay?: number;
    monthlySub?: number;
    expenses?: number;
    notes?: string;
    startDate?: string;
    channelId?: string | null;
  }
) {
  const user = await requireUser();
  await updateLeadCore(user, leadId, data);
  revalidatePath("/crm");
  revalidatePath("/accounting");
}

export async function setLeadLost(leadId: string, lost: boolean, lostReason?: string) {
  const user = await requireUser();
  await setLeadLostCore(user, leadId, lost, lostReason);
  revalidatePath("/crm");
}

// Сверяет ленту транзакций со ВСЕМИ лидами по правилам этапов — вызывается при открытии
// Бухгалтерии/Дашборда. Нужно не только чтобы материализовать новые месяцы подписки без
// крон-джобы, но и чтобы подчистить транзакции, оставшиеся от сделок, которые были заведены
// в обход этих правил (например импортом) или с тех пор откатились на более ранний этап.
export async function reconcileAllLeadIncome() {
  const user = await requireUser();
  await reconcileAllLeadIncomeCore(user);
}

export async function getLeadActivity(leadId: string) {
  await requireUser();
  return prisma.leadActivity.findMany({
    where: { leadId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
