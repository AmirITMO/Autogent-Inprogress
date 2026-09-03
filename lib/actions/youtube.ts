"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";
import { fetchOwnChannelVideos, refreshAccessToken } from "@/lib/integrations/youtube";

export async function getYoutubeConnectionStatus(): Promise<{ connected: boolean; channelTitle: string | null }> {
  const connection = await prisma.youtubeConnection.findUnique({ where: { id: "singleton" } });
  return { connected: !!connection, channelTitle: connection?.channelTitle ?? null };
}

export async function syncYoutubeStats(): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    const connection = await prisma.youtubeConnection.findUnique({ where: { id: "singleton" } });
    if (!connection) throw new Error("YouTube не подключён — нажмите «Подключить YouTube»");

    // access_token живёт ~1 час — на всякий случай обновляем заранее, а не
    // ждём 401 от API, чтобы не усложнять код повторной попыткой после отказа.
    let accessToken = connection.accessToken;
    if (connection.expiresAt.getTime() < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(connection.refreshToken);
      accessToken = refreshed.accessToken;
      await prisma.youtubeConnection.update({
        where: { id: "singleton" },
        data: { accessToken, expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000) },
      });
    }

    const { channelTitle, videos } = await fetchOwnChannelVideos(accessToken);

    await prisma.$transaction(
      videos.map((v) =>
        prisma.youtubeVideoStat.upsert({
          where: { videoId: v.videoId },
          update: {
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
          },
          create: {
            videoId: v.videoId,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
          },
        })
      )
    );

    if (channelTitle) {
      await prisma.youtubeConnection.update({ where: { id: "singleton" }, data: { channelTitle } });
    }

    revalidatePath("/channels/channel-youtube");
    return { ok: true, count: videos.length };
  } catch (err) {
    console.error("syncYoutubeStats failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}
