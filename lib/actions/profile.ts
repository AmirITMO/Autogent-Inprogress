"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";

export async function updateProfile(data: {
  name: string;
  email: string;
  password?: string;
}): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();

  if (data.password) {
    const passwordError = validatePasswordStrength(data.password);
    if (passwordError) return { error: passwordError };
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing && existing.id !== user.id) {
    return { error: "Этот email уже занят другим пользователем" };
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
  return {};
}
