import { ApifyClient } from 'apify-client';
import { RawProfile, PostSnippet } from './types';

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function normalizePost(p: Record<string, unknown>): PostSnippet {
  // Apify returns various shapes; try every known variant
  const vv = num(p.videoViewCount) || num(p.videoPlayCount) || num(p.playsCount)
    || num(p.view_count) || num(p.video_view_count) || num(p.play_count)
    || num(p.viewCount) || num(p.plays);

  const type = str(p.type || p.productType || p.media_type || p.mediaType || '').toLowerCase();

  return {
    caption: str(p.caption || p.text || p.edge_media_to_caption || ''),
    likesCount: num(p.likesCount) || num(p.likes) || num(p.like_count) || num(p.edge_liked_by),
    commentsCount: num(p.commentsCount) || num(p.comments) || num(p.comment_count),
    videoViewCount: vv,
    timestamp: str(p.timestamp || p.taken_at || p.takenAt || p.created_time || ''),
    type,
  };
}

function normalizeProfile(raw: Record<string, unknown>): RawProfile | null {
  const username = str(raw.username || raw.ownerUsername || raw.user_name);
  if (!username) return null;

  // Followers: handle many variants
  const followersCount =
    num(raw.followersCount) ||
    num(raw.followers) ||
    num(raw.edge_followed_by) ||
    num((raw.edge_followed_by as Record<string, unknown>)?.count) ||
    num(raw.follower_count);

  const followingCount =
    num(raw.followingCount) ||
    num(raw.following) ||
    num(raw.edge_follow) ||
    num((raw.edge_follow as Record<string, unknown>)?.count) ||
    num(raw.following_count);

  const postsCount =
    num(raw.postsCount) ||
    num(raw.mediaCount) ||
    num((raw.edge_owner_to_timeline_media as Record<string, unknown>)?.count) ||
    num(raw.media_count);

  const bio = str(raw.biography || raw.bio || raw.description || '');

  // Collect posts from various fields Apify might use
  const postsRaw: Record<string, unknown>[] = [];
  const candidateFields = [
    'latestPosts', 'topPosts', 'posts', 'edge_owner_to_timeline_media',
    'latestIgtvVideos', 'reels', 'latestReels',
  ];
  for (const field of candidateFields) {
    const arr = raw[field];
    if (Array.isArray(arr)) {
      postsRaw.push(...(arr as Record<string, unknown>[]));
    } else if (arr && typeof arr === 'object') {
      const edges = (arr as Record<string, unknown>).edges;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          const node = (edge as Record<string, unknown>).node;
          if (node) postsRaw.push(node as Record<string, unknown>);
        }
      }
    }
  }

  // Dedupe posts by id/shortCode
  const seen = new Set<string>();
  const latestPosts: PostSnippet[] = [];
  for (const p of postsRaw.slice(0, 24)) {
    const key = str(p.id || p.shortCode || p.pk || p.caption || '').slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    latestPosts.push(normalizePost(p));
    if (latestPosts.length >= 12) break;
  }

  return {
    username,
    fullName: str(raw.fullName || raw.full_name || raw.name || ''),
    bio,
    followersCount,
    followingCount,
    postsCount,
    isBusinessAccount: Boolean(raw.isBusinessAccount || raw.businessAccount || raw.is_business_account || false),
    businessCategory: (raw.businessCategoryName || raw.category || raw.business_category_name || null) as string | null,
    externalUrl: (raw.externalUrl || raw.website || raw.external_url || null) as string | null,
    profileUrl: `https://www.instagram.com/${username}/`,
    latestPosts,
  };
}

export async function scrapeHashtag(
  client: ApifyClient,
  hashtag: string,
  limit: number
): Promise<string[]> {
  const clean = hashtag.replace(/^#/, '');
  const run = await client.actor('apify/instagram-hashtag-scraper').call(
    { hashtags: [clean], resultsLimit: limit, resultsType: 'posts' },
    { waitSecs: 90 }
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const usernames = new Set<string>();
  // Pre-filter by likes to skip obviously small accounts
  for (const item of items as Record<string, unknown>[]) {
    const u = str(item.ownerUsername || item.username);
    const likes = num(item.likesCount) || num(item.likes);
    // Skip posts with <500 likes — almost certainly tiny account
    if (u && likes >= 500) usernames.add(u.toLowerCase());
  }
  return Array.from(usernames);
}

export interface PreFilteredUser {
  username: string;
  followersCount: number;
  fullName?: string;
}

export async function scrapeSearch(
  client: ApifyClient,
  keyword: string,
  limit: number,
  minFollowersPrefilter: number = 0
): Promise<PreFilteredUser[]> {
  // Search USERS — returns actual Instagram user profiles with follower counts
  const run = await client.actor('apify/instagram-search-scraper').call(
    { searchType: 'user', search: keyword, searchLimit: limit, resultsLimit: limit, searchQueries: [keyword] },
    { waitSecs: 90 }
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const users = new Map<string, PreFilteredUser>();
  for (const item of items as Record<string, unknown>[]) {
    const u = str(item.username || item.ownerUsername || item.name).toLowerCase();
    if (!u) continue;
    const followers = num(item.followersCount) || num(item.followers);
    if (minFollowersPrefilter > 0 && followers > 0 && followers < minFollowersPrefilter) continue;
    users.set(u, {
      username: u,
      followersCount: followers,
      fullName: str(item.fullName || item.full_name || ''),
    });
  }
  return Array.from(users.values());
}

async function enrichBatch(client: ApifyClient, usernames: string[]): Promise<RawProfile[]> {
  const run = await client.actor('apify/instagram-profile-scraper').call(
    { usernames, resultsLimit: usernames.length },
    { waitSecs: 180 }
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // DEBUG first item once per batch
  if (items.length > 0) {
    const first = items[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const firstPost = ((first.latestPosts as Record<string, unknown>[]) || [])[0];
    console.log(`[APIFY] batch=${usernames.length} got=${items.length} | firstKeys=[${keys.slice(0, 20).join(',')}] | user=${first.username} followers=${first.followersCount ?? first.followers ?? first.edge_followed_by} posts=${(first.latestPosts as unknown[] || []).length}`);
    if (firstPost) {
      console.log(`[APIFY] post keys: [${Object.keys(firstPost).slice(0, 15).join(',')}] | views=${firstPost.videoViewCount ?? firstPost.videoPlayCount ?? firstPost.playsCount ?? firstPost.view_count} type=${firstPost.type || firstPost.productType}`);
    }
  }

  const profiles: RawProfile[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const p = normalizeProfile(item);
    if (p) profiles.push(p);
  }
  return profiles;
}

export async function enrichProfiles(
  client: ApifyClient,
  usernames: string[],
  onProgress?: (done: number, total: number) => void
): Promise<RawProfile[]> {
  const BATCH = 30;
  const PARALLEL = 5;

  const batches: string[][] = [];
  for (let i = 0; i < usernames.length; i += BATCH) {
    batches.push(usernames.slice(i, i + BATCH));
  }

  const profiles: RawProfile[] = [];
  let done = 0;

  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(chunk.map(b => enrichBatch(client, b)));
    for (const r of results) {
      if (r.status === 'fulfilled') profiles.push(...r.value);
      else {
        const msg = r.reason?.message || String(r.reason);
        console.log('[APIFY] batch failed:', msg);
        // Early-exit on quota error — no point continuing
        if (msg.toLowerCase().includes('monthly usage') || msg.toLowerCase().includes('insufficient funds')) {
          throw new Error('APIFY_QUOTA_EXHAUSTED');
        }
      }
    }
    done += chunk.reduce((s, b) => s + b.length, 0);
    onProgress?.(Math.min(done, usernames.length), usernames.length);
  }

  return profiles;
}
