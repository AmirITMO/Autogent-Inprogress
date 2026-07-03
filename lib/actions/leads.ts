"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import type { LeadStageId } from "@/lib/constants";

export async function createLead(data: {
  title: string;
  company?: string;
  description?: string;
  contactName?: string;
  contact?: string;
}) {
  const user = await requireUser();
  const last = await prisma.lead.findFirst({
    where: { stage: "SCHEDULED_CALL" },
    orderBy: { order: "desc" },
  });

  const lead = await prisma.lead.create({
    data: {
      title: data.title,
      company: data.company,
      description: data.description,
      contactName: data.contactName,
      contact: data.contact,
      stage: "SCHEDULED_CALL",
      order: (last?.order ?? 0) + 1,
      ownerId: user.id,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      message: `Лид создан`,
    },
  });

  revalidatePath("/crm");
  return lead;
}

export async function moveLead(
  leadId: string,
  toStage: LeadStageId,
  toIndex: number
) {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  const siblings = await prisma.lead.findMany({
    where: { stage: toStage, id: { not: leadId } },
    orderBy: { order: "asc" },
  });
  siblings.splice(toIndex, 0, { ...lead, stage: toStage });

  await prisma.$transaction(
    siblings.map((s, idx) =>
      prisma.lead.update({
        where: { id: s.id },
        data: { order: idx, stage: toStage },
      })
    )
  );

  if (lead.stage !== toStage) {
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: user.id,
        message: `Стадия изменена: ${lead.stage} → ${toStage}`,
      },
    });

    if (toStage === "PAID") {
      await syncLeadIncome(leadId);
    }
  }

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
  }
) {
  const user = await requireUser();

  await prisma.lead.update({
    where: { id: leadId },
    data,
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: user.id,
      message: `Карточка обновлена`,
    },
  });

  await syncLeadIncome(leadId);

  revalidatePath("/crm");
  revalidatePath("/accounting");
}

export async function setLeadLost(leadId: string, lost: boolean, lostReason?: string) {
  const user = await requireUser();

  await prisma.lead.update({
    where: { id: leadId },
    data: { lost, lostReason: lost ? lostReason : null },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: user.id,
      message: lost
        ? `Сделка отмечена как отказ${lostReason ? `: ${lostReason}` : ""}`
        : `Отметка об отказе снята`,
    },
  });

  revalidatePath("/crm");
}

async function syncLeadIncome(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  const entries: { name: string; amount: number }[] = [
    { name: "Предоплата", amount: Number(lead.prepay) },
    { name: "Постоплата", amount: Number(lead.postpay) },
    { name: "Подписка", amount: Number(lead.monthlySub) },
  ];

  for (const entry of entries) {
    if (entry.amount <= 0) continue;

    const category = await prisma.transactionCategory.findFirst({
      where: { name: entry.name, type: "INCOME" },
    });
    if (!category) continue;

    const existing = await prisma.transaction.findFirst({
      where: { leadId, categoryId: category.id },
    });

    if (existing) {
      if (Number(existing.amount) !== entry.amount) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { amount: entry.amount },
        });
      }
    } else {
      await prisma.transaction.create({
        data: {
          categoryId: category.id,
          leadId,
          amount: entry.amount,
          type: "INCOME",
          description: `${entry.name} по сделке «${lead.title}»`,
          createdById: user.id,
        },
      });
    }
  }
}

export async function getLeadActivity(leadId: string) {
  await requireUser();
  return prisma.leadActivity.findMany({
    where: { leadId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}
