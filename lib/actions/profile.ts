"use server";

import { revalidatePath } from "next/cache";
import { compare, hash } from "bcryptjs";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import { AVATAR_DIR } from "@/lib/uploadPaths";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function updateProfile(data: {
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ error: string; message?: undefined } | { error?: undefined; message: string }> {
  const user = await requireUser();

  let passwordHash: string | undefined;
  if (data.newPassword) {
    if (!data.currentPassword) {
      return { error: "Введите текущий пароль, чтобы задать новый" };
    }
    const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const currentValid = await compare(data.currentPassword, full.passwordHash);
    if (!currentValid) {
      return { error: "Текущий пароль указан неверно" };
    }
    const passwordError = validatePasswordStrength(data.newPassword);
    if (passwordError) return { error: passwordError };
    passwordHash = await hash(data.newPassword, 10);
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
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  // Имя показывается в сайдбаре на каждой странице — ревалидируем весь layout,
  // а не только /settings, иначе смена отражается только после долгого ожидания
  // естественного протухания Router Cache.
  revalidatePath("/", "layout");
  return { message: passwordHash ? "Профиль и пароль обновлены" : "Профиль обновлён" };
}

const AVATAR_EXTENSIONS = ["jpg", "png", "webp", "gif"];

// Аватарки НЕ лежат в /public: Next.js в production-режиме кэширует у себя в памяти
// результат раздачи статики по конкретному пути и, если файла ещё не было на диске
// в момент самого первого запроса, продолжает отдавать 404 даже после появления
// файла — вплоть до перезапуска контейнера. Поэтому раздаём аватар через обычный
// route handler (app/api/avatar/[userId]/route.ts), который читает диск заново
// при каждом запросе и такому кэшированию не подвержен.
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

  await mkdir(AVATAR_DIR, { recursive: true });

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(AVATAR_DIR, `${user.id}.${ext}`), buffer);

  // Убираем файлы с другими расширениями от прошлых загрузок этого пользователя.
  await Promise.all(
    AVATAR_EXTENSIONS.filter((e) => e !== ext).map((e) =>
      rm(path.join(AVATAR_DIR, `${user.id}.${e}`), { force: true })
    )
  );

  const avatarUrl = `/api/avatar/${user.id}?v=${Date.now()}`;
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });

  // Аватар показывается в сайдбаре на каждой странице (и в задачах/комментариях) —
  // ревалидируем весь layout, иначе новое фото долго не появляется из-за Router Cache.
  revalidatePath("/", "layout");
  return { avatarUrl };
}
