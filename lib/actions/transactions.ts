"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function createExpense(data: {
  categoryId: string;
  amount: number;
  description?: string;
  date?: string;
}) {
  const user = await requireUser();
  await prisma.transaction.create({
    data: {
      categoryId: data.categoryId,
      amount: data.amount,
      type: "EXPENSE",
      description: data.description,
      date: data.date ? new Date(data.date) : new Date(),
      createdById: user.id,
    },
  });
  revalidatePath("/accounting");
}
