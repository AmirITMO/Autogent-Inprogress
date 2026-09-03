// Instagram Reels-аналитика через Apify (apify/instagram-profile-scraper —
// тот же актор, что уже используется instagram_scout_service, с проверенным
// на практике полем latestPosts). Только публичные метрики: без бизнес-
// аккаунта/Meta API нет impressions/reach/retention, только то, что видно
// в самом посте — views/likes/comments.
//
// Разбор полей — прямой перенос _extract_account/normalizePost из
// instagram_scout_service/scraper.py (там же объяснение, зачем нужны все
// варианты имён полей: разные версии актора отдают по-разному).

const APIFY_BASE_URL = "https://api.apify.com/v2";
const PROFILE_ACTOR = "apify/instagram-profile-scraper";

export type ReelPost = {
  shortcode: string;
  caption: string | null;
  postedAt: string | null;
  viewCount: number | null;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function isReelType(item: Record<string, unknown>): boolean {
  const type = str(item.type || item.productType || item.mediaType).toLowerCase();
  return type === "video" || type === "reel" || type === "clip";
}

function extractPost(item: Record<string, unknown>): ReelPost | null {
  if (!isReelType(item)) return null;
  const shortcode = str(item.shortCode || item.shortcode || item.code || item.id);
  if (!shortcode) return null;

  const viewCount =
    num(item.videoViewCount) ||
    num(item.videoPlayCount) ||
    num(item.playsCount) ||
    num(item.viewCount) ||
    num(item.video_view_count) ||
    num(item.playCount) ||
    null;

  return {
    shortcode,
    caption: str(item.caption || item.text).slice(0, 2000) || null,
    postedAt: str(item.timestamp || item.takenAt || item.taken_at) || null,
    viewCount: viewCount || null,
    likeCount: num(item.likesCount) || num(item.likes) || num(item.like_count),
    commentCount: num(item.commentsCount) || num(item.comments) || num(item.comment_count),
    thumbnailUrl: str(item.displayUrl || item.thumbnailUrl || item.thumbnail_src) || null,
  };
}

export async function fetchAccountReels(apifyToken: string, username: string): Promise<ReelPost[]> {
  const actorPath = PROFILE_ACTOR.replace("/", "~");
  const url = `${APIFY_BASE_URL}/acts/${actorPath}/run-sync-get-dataset-items`;
  const res = await fetch(`${url}?token=${encodeURIComponent(apifyToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], resultsLimit: 1 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  const items = (await res.json()) as Record<string, unknown>[];
  const profile = items[0];
  if (!profile) return [];

  const postsRaw: Record<string, unknown>[] = [];
  for (const field of ["latestPosts", "topPosts", "posts", "latestReels", "reels"]) {
    const arr = profile[field];
    if (Array.isArray(arr)) postsRaw.push(...(arr as Record<string, unknown>[]));
  }

  const seen = new Set<string>();
  const posts: ReelPost[] = [];
  for (const raw of postsRaw) {
    const post = extractPost(raw);
    if (!post || seen.has(post.shortcode)) continue;
    seen.add(post.shortcode);
    posts.push(post);
  }
  return posts;
}
