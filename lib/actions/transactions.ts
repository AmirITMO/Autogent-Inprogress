"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function createTransaction(data: {
  type: "INCOME" | "EXPENSE";
  categoryId: string;
  amount: number;
  description?: string;
  date?: string;
  leadId?: string;
}): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  if (!(data.amount > 0)) return { error: "Сумма должна быть больше нуля" };

  await prisma.transaction.create({
    data: {
      categoryId: data.categoryId,
      leadId: data.leadId || undefined,
      amount: data.amount,
      type: data.type,
      description: data.description,
      date: data.date ? new Date(data.date) : new Date(),
      createdById: user.id,
    },
  });
  revalidatePath("/accounting");
  return {};
}

export async function deleteTransaction(id: string) {
  await requireUser();
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/accounting");
}
