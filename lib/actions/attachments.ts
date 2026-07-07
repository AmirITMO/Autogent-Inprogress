"use server";

import { randomUUID } from "crypto";
import { mkdir, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, assertCanEditTask } from "@/lib/roles";
import { UPLOAD_ROOT } from "@/lib/uploadPaths";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 МБ — общий лимит
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1 ГБ — лимит для видео

function sanitizeFileName(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(-150) || "file";
}

type UploadedAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

export async function uploadTaskAttachment(
  taskId: string,
  formData: FormData
): Promise<{ error: string; attachment?: undefined } | { error?: undefined; attachment: UploadedAttachment }> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Файл не выбран" };
  }

  const isVideo = file.type.startsWith("video/");
  const limit = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
  if (file.size > limit) {
    return {
      error: isVideo
        ? "Видео больше 1 ГБ — уменьшите размер файла"
        : "Файл больше 100 МБ — уменьшите размер файла",
    };
  }

  const dir = path.join(UPLOAD_ROOT, "tasks", taskId);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}-${sanitizeFileName(file.name)}`;

  await pipeline(
    Readable.fromWeb(file.stream() as unknown as import("stream/web").ReadableStream),
    createWriteStream(path.join(dir, storedName))
  );

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey: `${taskId}/${storedName}`,
      uploadedById: user.id,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/my");
  return {
    attachment: {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt,
    },
  };
}

export async function listTaskAttachments(taskId: string) {
  await requireUser();
  return prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteTaskAttachment(id: string) {
  const user = await requireUser();
  const existing = await prisma.taskAttachment.findUniqueOrThrow({
    where: { id },
    include: { task: { select: { assigneeId: true } } },
  });

  // Свой ещё не отправленный файл (вставлен при наборе комментария, но комментарий
  // не отправлен) можно отозвать без права редактировать саму задачу — это часть
  // комментирования, доступного всем. В остальных случаях удаление файла требует
  // того же права, что и редактирование задачи, иначе любой пользователь мог бы
  // стереть чужие вложения в обход режима "только просмотр".
  const isOwnPendingUpload = existing.uploadedById === user.id && existing.commentId === null;
  if (!isOwnPendingUpload) {
    await assertCanEditTask(user.id, user.role, existing.task.assigneeId);
  }

  const attachment = await prisma.taskAttachment.delete({ where: { id } });
  await rm(path.join(UPLOAD_ROOT, "tasks", attachment.storageKey), { force: true });
  revalidatePath("/tasks");
  revalidatePath("/my");
}
