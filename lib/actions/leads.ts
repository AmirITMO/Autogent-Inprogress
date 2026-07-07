"use server";

import { revalidatePath } from "next/cache";
import type { Lead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import type { LeadStageId } from "@/lib/constants";
import { stageAtOrAfter, monthsElapsed, monthKey } from "@/lib/accounting";

export async function createLead(data: {
  title: string;
  company?: string;
  description?: string;
  contactName?: string;
  contact?: string;
  channelId?: string;
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
      channelId: data.channelId || undefined,
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
  revalidatePath("/accounting");
  return lead;
}

export async function deleteLead(leadId: string): Promise<{ error: string } | { error?: undefined }> {
  await requireUser();
  const txCount = await prisma.transaction.count({ where: { leadId } });
  if (txCount > 0) {
    return {
      error: "Нельзя удалить сделку — на неё уже есть транзакции в бухгалтерии. Сначала удалите или отвяжите их.",
    };
  }
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/crm");
  revalidatePath("/accounting");
  return {};
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

    await syncLeadIncome(leadId);
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
    startDate?: string;
    channelId?: string | null;
  }
) {
  const user = await requireUser();
  const { startDate, ...rest } = data;

  await prisma.lead.update({
    where: { id: leadId },
    data: { ...rest, ...(startDate ? { startDate: new Date(startDate) } : {}) },
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

// Деньги попадают в бухгалтерию только когда сделка реально дошла до соответствующего этапа —
// до этого предоплата/постоплата/подписка в карточке лида ничего не значат для кассы.
async function applyIncomeRules(lead: Lead, userId: string) {
  await syncOneTimeEntry(lead, userId, "Предоплата", Number(lead.prepay), stageAtOrAfter(lead.stage, "PAID"));
  await syncOneTimeEntry(
    lead,
    userId,
    "Постоплата",
    Number(lead.postpay),
    stageAtOrAfter(lead.stage, "POSTPAY")
  );

  if (lead.stage === "SUPPORT") {
    await syncSupportSubscription(lead, userId);
  } else {
    await removeSupportSubscription(lead.id);
  }
}

async function syncLeadIncome(leadId: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await applyIncomeRules(lead, user.id);
}

async function syncOneTimeEntry(
  lead: { id: string; title: string },
  userId: string,
  categoryName: string,
  amount: number,
  eligible: boolean
) {
  const category = await prisma.transactionCategory.findFirst({
    where: { name: categoryName, type: "INCOME" },
  });
  if (!category) return;

  const existing = await prisma.transaction.findFirst({
    where: { leadId: lead.id, categoryId: category.id },
  });

  if (!eligible || amount <= 0) {
    if (existing) await prisma.transaction.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    if (Number(existing.amount) !== amount) {
      await prisma.transaction.update({ where: { id: existing.id }, data: { amount } });
    }
  } else {
    await prisma.transaction.create({
      data: {
        categoryId: category.id,
        leadId: lead.id,
        amount,
        type: "INCOME",
        description: `${categoryName} по сделке «${lead.title}»`,
        createdById: userId,
      },
    });
  }
}

// На поддержке подписка списывается каждый месяц — материализуем по одной транзакции
// на каждый месяц с даты появления сделки (startDate) до текущего момента.
async function syncSupportSubscription(
  lead: { id: string; title: string; monthlySub: unknown; startDate: Date },
  userId: string
) {
  const amount = Number(lead.monthlySub);
  const category = await prisma.transactionCategory.findFirst({
    where: { name: "Подписка", type: "INCOME" },
  });
  if (!category || amount <= 0) return;

  const months = monthsElapsed(lead.startDate, new Date());

  for (let i = 0; i < months; i++) {
    const monthDate = new Date(lead.startDate.getFullYear(), lead.startDate.getMonth() + i, 1);
    const marker = `за ${monthKey(monthDate)}`;

    const existing = await prisma.transaction.findFirst({
      where: { leadId: lead.id, categoryId: category.id, description: { contains: marker } },
    });

    if (existing) {
      if (Number(existing.amount) !== amount) {
        await prisma.transaction.update({ where: { id: existing.id }, data: { amount } });
      }
      continue;
    }

    await prisma.transaction.create({
      data: {
        categoryId: category.id,
        leadId: lead.id,
        amount,
        type: "INCOME",
        date: monthDate,
        description: `Подписка по сделке «${lead.title}» ${marker}`,
        createdById: userId,
      },
    });
  }
}

async function removeSupportSubscription(leadId: string) {
  const category = await prisma.transactionCategory.findFirst({
    where: { name: "Подписка", type: "INCOME" },
  });
  if (!category) return;
  await prisma.transaction.deleteMany({ where: { leadId, categoryId: category.id } });
}

// Сверяет ленту транзакций со ВСЕМИ лидами по правилам этапов — вызывается при открытии
// Бухгалтерии/Дашборда. Нужно не только чтобы материализовать новые месяцы подписки без
// крон-джобы, но и чтобы подчистить транзакции, оставшиеся от сделок, которые были заведены
// в обход этих правил (например импортом) или с тех пор откатились на более ранний этап.
export async function reconcileAllLeadIncome() {
  const user = await requireUser();
  const leads = await prisma.lead.findMany();
  for (const lead of leads) {
    await applyIncomeRules(lead, user.id);
  }
}

export async function getLeadActivity(leadId: string) {
  await requireUser();
  return prisma.leadActivity.findMany({
    where: { leadId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
