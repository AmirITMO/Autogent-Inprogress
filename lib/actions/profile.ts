"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

export async function updateProfile(data: {
  name: string;
  email: string;
  password?: string;
}) {
  const user = await requireUser();

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing && existing.id !== user.id) {
    throw new Error("Этот email уже занят другим пользователем");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: data.name,
      email: data.email,
      ...(data.password ? { passwordHash: await hash(data.password, 10) } : {}),
    },
  });

  revalidatePath("/settings");
}
