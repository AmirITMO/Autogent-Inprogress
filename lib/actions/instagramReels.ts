"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";
import { fetchAccountReels } from "@/lib/integrations/instagramReels";

const REELS_CHANNEL_PATH = "/channels/channel-reels";

export async function addReelsAccount(label: string, username: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    const cleanUsername = username.trim().replace(/^@/, "");
    if (!label.trim()) throw new Error("Имя (подпись) обязательно");
    if (!cleanUsername) throw new Error("Юзернейм Instagram обязателен");

    await prisma.instagramReelsAccount.create({ data: { label: label.trim(), username: cleanUsername } });
    revalidatePath(REELS_CHANNEL_PATH);
    return { ok: true };
  } catch (err) {
    console.error("addReelsAccount failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export async function removeReelsAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);
    await prisma.instagramReelsAccount.delete({ where: { id: accountId } });
    revalidatePath(REELS_CHANNEL_PATH);
    return { ok: true };
  } catch (err) {
    console.error("removeReelsAccount failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export async function syncReelsAccount(accountId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);

    const apifyToken = process.env.APIFY_TOKEN;
    if (!apifyToken) throw new Error("APIFY_TOKEN не задан на сервере CRM — обратитесь к администратору");

    const account = await prisma.instagramReelsAccount.findUniqueOrThrow({ where: { id: accountId } });
    const posts = await fetchAccountReels(apifyToken, account.username);

    await prisma.$transaction(
      posts.map((p) =>
        prisma.instagramReelsPost.upsert({
          where: { accountId_shortcode: { accountId, shortcode: p.shortcode } },
          update: {
            caption: p.caption,
            postedAt: p.postedAt ? new Date(p.postedAt) : null,
            viewCount: p.viewCount,
            likeCount: p.likeCount,
            commentCount: p.commentCount,
            thumbnailUrl: p.thumbnailUrl,
          },
          create: {
            accountId,
            shortcode: p.shortcode,
            caption: p.caption,
            postedAt: p.postedAt ? new Date(p.postedAt) : null,
            viewCount: p.viewCount,
            likeCount: p.likeCount,
            commentCount: p.commentCount,
            thumbnailUrl: p.thumbnailUrl,
          },
        })
      )
    );

    revalidatePath(REELS_CHANNEL_PATH);
    return { ok: true, count: posts.length };
  } catch (err) {
    console.error("syncReelsAccount failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export type ReelsAccountWithPosts = {
  id: string;
  label: string;
  username: string;
  posts: {
    id: string;
    shortcode: string;
    caption: string | null;
    postedAt: string | null;
    viewCount: number | null;
    likeCount: number;
    commentCount: number;
    thumbnailUrl: string | null;
  }[];
};

export async function listReelsAccounts(): Promise<ReelsAccountWithPosts[]> {
  const accounts = await prisma.instagramReelsAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { posts: { orderBy: { viewCount: "desc" } } },
  });
  return accounts.map((a) => ({
    id: a.id,
    label: a.label,
    username: a.username,
    posts: a.posts.map((p) => ({
      id: p.id,
      shortcode: p.shortcode,
      caption: p.caption,
      postedAt: p.postedAt?.toISOString() ?? null,
      viewCount: p.viewCount,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      thumbnailUrl: p.thumbnailUrl,
    })),
  }));
}
