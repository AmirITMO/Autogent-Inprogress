"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

// Одобрение переводит черновик в APPROVED — бот сам заберёт его через
// GET .../drafts?status=approved и опубликует. Публикация никогда не
// происходит без этого явного шага (см. TgCommentDraft в schema.prisma).
export async function approveTgCommentDraft(
  draftId: string,
  editedComment?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    const draft = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draftId } });
    const finalComment = (editedComment ?? draft.draftComment).trim();
    if (!finalComment) {
      throw new Error("Текст комментария пустой");
    }

    // Атомарный updateMany, не check-then-update — двойной клик "Одобрить"
    // (или гонка approve/skip на одном черновике) должен дать ровно один
    // исход, а не check-then-act в коде (см. lib/actions/b2bEmailSend.ts).
    const claim = await prisma.tgCommentDraft.updateMany({
      where: { id: draftId, status: "PENDING" },
      data: { status: "APPROVED", draftComment: finalComment, sentById: user.id },
    });
    if (claim.count === 0) {
      throw new Error("Черновик уже не ждёт решения — обновите страницу");
    }

    revalidatePath(`/channels/${draft.channelId}`);
    return { ok: true };
  } catch (err) {
    console.error("approveTgCommentDraft failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export async function skipTgCommentDraft(draftId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    const draft = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draftId } });
    const claim = await prisma.tgCommentDraft.updateMany({
      where: { id: draftId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    if (claim.count === 0) {
      throw new Error("Черновик уже не ждёт решения — обновите страницу");
    }

    revalidatePath(`/channels/${draft.channelId}`);
    return { ok: true };
  } catch (err) {
    console.error("skipTgCommentDraft failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}
