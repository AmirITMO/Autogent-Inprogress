import { existsSync, statSync, createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { auth } from "@/lib/auth";
import { AVATAR_DIR } from "@/lib/uploadPaths";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { userId } = await params;
  // userId приходит из id пользователя (cuid), без слэшей и точек — путь безопасен.
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "");

  for (const ext of Object.keys(EXT_TO_MIME)) {
    const filePath = path.join(AVATAR_DIR, `${safeId}.${ext}`);
    if (existsSync(filePath)) {
      const size = statSync(filePath).size;
      const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
      return new Response(stream, {
        headers: {
          "Content-Type": EXT_TO_MIME[ext],
          "Content-Length": String(size),
          "Cache-Control": "private, no-cache",
        },
      });
    }
  }

  return new Response("Not found", { status: 404 });
}
