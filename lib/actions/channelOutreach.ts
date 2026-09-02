"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

// Ручная агрегированная отчётность (см. ChannelOutreachBatch в schema.prisma) —
// для каналов вроде hh.ru, где отправку делает сотрудник сам вручную/через
// расширение браузера, а сюда заносит только итоговые цифры за раз.
export async function addOutreachBatch(
  channelId: string,
  sentCount: number,
  positiveCount: number,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    if (!Number.isInteger(sentCount) || sentCount <= 0) {
      throw new Error("Отправлено — целое число больше нуля");
    }
    if (!Number.isInteger(positiveCount) || positiveCount < 0) {
      throw new Error("Положительных ответов — целое число, не меньше нуля");
    }
    if (positiveCount > sentCount) {
      throw new Error("Положительных ответов не может быть больше, чем отправлено");
    }

    await prisma.channelOutreachBatch.create({
      data: { channelId, sentCount, positiveCount, note: note?.trim() || null, createdById: user.id },
    });

    revalidatePath(`/channels/${channelId}`);
    return { ok: true };
  } catch (err) {
    console.error("addOutreachBatch failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}
