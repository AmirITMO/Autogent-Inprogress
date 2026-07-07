"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function createChannel(name: string): Promise<{ error: string } | { error?: undefined }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Введите название канала" };

  const last = await prisma.trafficChannel.findFirst({ orderBy: { order: "desc" } });
  await prisma.trafficChannel.create({ data: { name: trimmed, order: (last?.order ?? 0) + 1 } });

  revalidatePath("/channels");
  return {};
}

export async function renameChannel(id: string, name: string) {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.trafficChannel.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/channels");
}

export async function toggleChannelActive(id: string, isActive: boolean) {
  await requireUser();
  await prisma.trafficChannel.update({ where: { id }, data: { isActive } });
  revalidatePath("/channels");
}

export async function deleteChannel(id: string): Promise<{ error: string } | { error?: undefined }> {
  await requireUser();
  const leadCount = await prisma.lead.count({ where: { channelId: id } });
  if (leadCount > 0) {
    return { error: "Нельзя удалить канал, к которому привязаны сделки — сначала снимите привязку или заархивируйте канал" };
  }
  await prisma.trafficChannel.delete({ where: { id } });
  revalidatePath("/channels");
  return {};
}

export async function addChannelSpend(data: {
  channelId: string;
  amount: number;
  date?: string;
  note?: string;
}): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  if (!(data.amount > 0)) return { error: "Сумма должна быть больше нуля" };

  await prisma.channelSpend.create({
    data: {
      channelId: data.channelId,
      amount: data.amount,
      date: data.date ? new Date(data.date) : new Date(),
      note: data.note?.trim() || undefined,
      createdById: user.id,
    },
  });

  revalidatePath("/channels");
  return {};
}

export async function deleteChannelSpend(id: string) {
  await requireUser();
  await prisma.channelSpend.delete({ where: { id } });
  revalidatePath("/channels");
}

export async function setLeadChannel(leadId: string, channelId: string | null) {
  await requireUser();
  await prisma.lead.update({ where: { id: leadId }, data: { channelId } });
  revalidatePath("/crm");
  revalidatePath("/channels");
}
