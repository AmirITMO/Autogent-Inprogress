"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { stageAtOrAfter } from "@/lib/accounting";
import { assertCanEditCrm } from "./leadsCore";

const PARTNERSHIP_CHANNEL_ID = "channel-partnerships";

function generateReferralCode(): string {
  return randomBytes(4).toString("hex"); // 8 симв., достаточно для короткой публичной ссылки
}

export async function createPartner(data: {
  name: string;
  commissionType: "PERCENT" | "FIXED";
  commissionValue: number;
  destinationUrl?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    if (!data.name.trim()) throw new Error("Имя партнёра обязательно");
    if (!Number.isFinite(data.commissionValue) || data.commissionValue < 0) {
      throw new Error("Комиссия должна быть числом не меньше нуля");
    }
    if (data.commissionType === "PERCENT" && data.commissionValue > 100) {
      throw new Error("Процент не может быть больше 100");
    }

    // Коллизия 8-символьного hex-кода практически невозможна, но не бесконечный
    // retry — до 5 попыток, дальше явная ошибка вместо зависания.
    let code = generateReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.partner.findUnique({ where: { referralCode: code } });
      if (!exists) break;
      code = generateReferralCode();
    }

    const partner = await prisma.partner.create({
      data: {
        name: data.name.trim(),
        commissionType: data.commissionType,
        commissionValue: data.commissionValue,
        referralCode: code,
        destinationUrl: data.destinationUrl?.trim() || undefined,
      },
    });

    revalidatePath(`/channels/${PARTNERSHIP_CHANNEL_ID}`);
    return { ok: true, id: partner.id };
  } catch (err) {
    console.error("createPartner failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export async function deactivatePartner(partnerId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);
    await prisma.partner.update({ where: { id: partnerId }, data: { isActive: false } });
    revalidatePath(`/channels/${PARTNERSHIP_CHANNEL_ID}`);
    return { ok: true };
  } catch (err) {
    console.error("deactivatePartner failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export type PartnerWithStats = {
  id: string;
  name: string;
  commissionType: "PERCENT" | "FIXED";
  commissionValue: number;
  referralCode: string;
  clickCount: number;
  isActive: boolean;
  leadsCount: number;
  commissionOwed: number;
};

export async function listPartnersWithStats(): Promise<PartnerWithStats[]> {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "desc" },
    include: { leads: { select: { stage: true, lost: true, prepay: true, postpay: true } } },
  });

  return partners.map((p) => {
    const paidLeads = p.leads.filter((l) => !l.lost && stageAtOrAfter(l.stage, "PAID"));
    const commissionValue = Number(p.commissionValue);
    const commissionOwed =
      p.commissionType === "FIXED"
        ? paidLeads.length * commissionValue
        : paidLeads.reduce((sum, l) => sum + (Number(l.prepay) + Number(l.postpay)) * (commissionValue / 100), 0);

    return {
      id: p.id,
      name: p.name,
      commissionType: p.commissionType,
      commissionValue,
      referralCode: p.referralCode,
      clickCount: p.clickCount,
      isActive: p.isActive,
      leadsCount: p.leads.length,
      commissionOwed,
    };
  });
}
