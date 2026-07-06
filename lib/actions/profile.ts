"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";

const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function updateProfile(data: {
  name: string;
  email: string;
  workEmail?: string;
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
      workEmail: data.workEmail?.trim() || null,
      ...(data.password ? { passwordHash: await hash(data.password, 10) } : {}),
    },
  });

  revalidatePath("/settings");
  return {};
}

export async function uploadAvatar(
  formData: FormData
): Promise<{ error: string; avatarUrl?: undefined } | { error?: undefined; avatarUrl: string }> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Файл не выбран" };
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return { error: "Поддерживаются только изображения (JPEG, PNG, WEBP, GIF)" };
  }
  if (file.size > MAX_AVATAR_SIZE) {
    return { error: "Изображение больше 5 МБ" };
  }

  const previous = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await mkdir(AVATAR_DIR, { recursive: true });

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const fileName = `${user.id}-${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(AVATAR_DIR, fileName), buffer);

  const avatarUrl = `/avatars/${fileName}`;
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });

  if (previous.avatarUrl) {
    const oldName = previous.avatarUrl.replace("/avatars/", "");
    await rm(path.join(AVATAR_DIR, oldName), { force: true });
  }

  revalidatePath("/settings");
  return { avatarUrl };
}
