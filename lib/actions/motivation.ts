"use server";

import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { UPLOAD_ROOT } from "@/lib/uploadPaths";
import { revalidatePath } from "next/cache";

const MOTIVATION_DIR = path.join(UPLOAD_ROOT, "motivation");
const MAX_SIZE = 10 * 1024 * 1024; // 10 МБ
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Личное фото мотивации: видно только самому пользователю на его дашборде.
// Хранится вне /public и раздаётся только владельцу через
// app/api/motivation-photo/route.ts (без параметров — всегда "своё" фото).
export async function uploadMotivationPhoto(
  formData: FormData
): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Файл не выбран" };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Поддерживаются только изображения (JPEG, PNG, WEBP, GIF)" };
  }
  if (file.size > MAX_SIZE) {
    return { error: "Изображение больше 10 МБ" };
  }

  await mkdir(MOTIVATION_DIR, { recursive: true });
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const key = `${user.id}.${ext}`;

  const previous = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (previous.motivationPhotoKey && previous.motivationPhotoKey !== key) {
    await rm(path.join(MOTIVATION_DIR, previous.motivationPhotoKey), { force: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(MOTIVATION_DIR, key), buffer);
  await prisma.user.update({ where: { id: user.id }, data: { motivationPhotoKey: key } });

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return {};
}

export async function removeMotivationPhoto(): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (previous.motivationPhotoKey) {
    await rm(path.join(MOTIVATION_DIR, previous.motivationPhotoKey), { force: true });
  }
  await prisma.user.update({ where: { id: user.id }, data: { motivationPhotoKey: null } });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return {};
}
