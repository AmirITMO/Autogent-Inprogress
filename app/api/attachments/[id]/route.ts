import { existsSync, statSync, createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_ROOT } from "@/lib/uploadPaths";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
  if (!attachment) return new Response("Not found", { status: 404 });

  const filePath = path.join(UPLOAD_ROOT, "tasks", attachment.storageKey);
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });

  const size = statSync(filePath).size;
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
