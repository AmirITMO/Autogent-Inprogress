"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateSettings(data: {
  morningSummaryTime: string;
  eveningSummaryTime: string;
  deadlineCheckInterval: number;
  timezone: string;
}): Promise<{ error: string } | { error?: undefined }> {
  await requireAdmin();

  if (!TIME_RE.test(data.morningSummaryTime) || !TIME_RE.test(data.eveningSummaryTime)) {
    return { error: "Некорректное время сводки — используйте формат ЧЧ:ММ" };
  }
  if (
    !Number.isInteger(data.deadlineCheckInterval) ||
    data.deadlineCheckInterval < 15 ||
    data.deadlineCheckInterval > 180 ||
    data.deadlineCheckInterval % 15 !== 0
  ) {
    return { error: "Проверка дедлайнов должна быть от 15 до 180 минут, кратно 15" };
  }

  // Вся платформа жёстко завязана на московское время (см. lib/moscowTime.ts) —
  // это поле не должно расходиться с реальным поведением приложения.
  const safeData = { ...data, timezone: "Europe/Moscow" };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: safeData,
    create: { id: "singleton", ...safeData },
  });
  revalidatePath("/settings");
  return {};
}
