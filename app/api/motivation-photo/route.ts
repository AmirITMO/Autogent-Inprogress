import { existsSync, statSync, createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_ROOT } from "@/lib/uploadPaths";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

// Всегда отдаёт фото мотивации ТЕКУЩЕГО пользователя — без id в пути,
// поэтому чужое фото посмотреть невозможно даже зная ссылку.
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { motivationPhotoKey: true },
  });
  if (!user?.motivationPhotoKey) return new Response("Not found", { status: 404 });

  const filePath = path.join(UPLOAD_ROOT, "motivation", user.motivationPhotoKey);
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });

  const ext = user.motivationPhotoKey.split(".").pop() ?? "";
  const size = statSync(filePath).size;
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": EXT_TO_MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "private, no-cache",
    },
  });
}
