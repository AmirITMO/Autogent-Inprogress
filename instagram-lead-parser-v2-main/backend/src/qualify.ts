import { RawProfile, PostSnippet } from './types';

const CREATIVE_KEYWORDS = [
  'visual artist', 'creative director', 'art director', 'creative dir',
  'художественный руководитель', 'filmmaker', 'storyteller',
  'videographer', 'photographer', 'designer', 'vfx', 'режиссер',
  'редактор', 'content creator', 'автор', 'видеограф', 'фотограф',
  'creative', 'film', 'video', 'cinema', 'motion', 'production',
  'director', 'producer', 'editor', 'reels', 'content',
  'cinematographer', 'visual', 'storytell', 'digital creator',
  'визуал', 'видео', 'контент', 'монтаж', 'съёмка', 'съемка',
  'ads', 'marketing', 'campaign', 'brand',
];

const HARD_EXCLUDE_KEYWORDS = [
  'интернет-магазин', 'оптом от', 'wildberries', 'ozon', 'франшиза',
  'доставка заказ', 'купить в', 'заказать онлайн',
];

function getReelsViews(posts: PostSnippet[]): number[] {
  // Приоритет — настоящие Reels/Video посты
  const reelPosts = posts.filter(p => {
    const t = (p.type || '').toLowerCase();
    return t === 'video' || t === 'reel' || t === 'clip';
  });

  const source = reelPosts.length >= 3 ? reelPosts : posts;
  return source
    .map(p => p.videoViewCount || 0)
    .filter(v => v > 0);
}

export type QualReason = 'lowFollowers' | 'excluded' | 'noReels' | 'lowReelsViews' | 'lowScore';

export interface QualData {
  isCreative: boolean;
  avgReelsViews: number;
  minReelsViews: number;
  score: number;
  tier: 'A' | 'B' | 'C';
}

export type QualResult =
  | { ok: true; data: QualData }
  | { ok: false; reason: QualReason };

export function qualifyProfile(
  profile: RawProfile,
  minReelsViews: number,
  minScore: number,
  minFollowers: number
): QualResult {
  // 1) Hard gate: minimum followers
  if (profile.followersCount < minFollowers) {
    return { ok: false, reason: 'lowFollowers' };
  }

  const bioLower = profile.bio.toLowerCase();
  const nameLower = profile.fullName.toLowerCase();
  const categoryLower = (profile.businessCategory || '').toLowerCase();

  // 2) Hard exclusions (clear non-creative commerce)
  for (const kw of HARD_EXCLUDE_KEYWORDS) {
    if (bioLower.includes(kw)) return { ok: false, reason: 'excluded' };
  }

  // 3) Creative detection (bio + name + category)
  let isCreative = false;
  let creativeMatches = 0;
  for (const kw of CREATIVE_KEYWORDS) {
    if (bioLower.includes(kw) || nameLower.includes(kw) || categoryLower.includes(kw)) {
      isCreative = true;
      creativeMatches++;
    }
  }

  // 4) Reels views analysis — берём последние Reels (тип Video/Reel), fallback на все посты
  const views = getReelsViews(profile.latestPosts);
  const avgViews = views.length > 0 ? Math.round(views.reduce((s: number, v: number) => s + v, 0) / views.length) : 0;
  const minViewsActual = views.length > 0 ? Math.min(...views) : 0;

  // 5) Hard gate: reels filter (if enabled).
  // Требование: среднее по последним Reels >= порог AND минимум 3 видео.
  // Это реалистичный фильтр: у крупных креаторов бывают отдельные провальные ролики,
  // но в среднем они держат планку.
  if (minReelsViews > 0) {
    if (views.length < 3) return { ok: false, reason: 'noReels' };
    if (avgViews < minReelsViews) return { ok: false, reason: 'lowReelsViews' };
  }

  // 6) Score calculation
  let score = 0;
  if (isCreative) score += 30;
  score += Math.min(creativeMatches * 3, 15);

  if (profile.followersCount >= 100000) score += 20;
  else if (profile.followersCount >= 50000) score += 15;
  else if (profile.followersCount >= 20000) score += 10;
  else if (profile.followersCount >= 10000) score += 5;

  if (avgViews >= 100000) score += 25;
  else if (avgViews >= 50000) score += 20;
  else if (avgViews >= 20000) score += 15;
  else if (avgViews >= 10000) score += 10;
  else if (avgViews >= 5000) score += 5;

  if (profile.isBusinessAccount) score += 5;
  if (profile.externalUrl) score += 5;
  if (views.length >= 5) score += 5;  // active video creator

  // 7) Minimum score gate
  if (score < minScore) return { ok: false, reason: 'lowScore' };

  const tier: 'A' | 'B' | 'C' =
    score >= 75 ? 'A' : score >= 55 ? 'B' : 'C';

  return {
    ok: true,
    data: { isCreative, avgReelsViews: avgViews, minReelsViews: minViewsActual, score, tier },
  };
}

export function extractContacts(bio: string, externalUrl: string | null) {
  let telegram: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  // Telegram: t.me/username or @username after "telegram"/"tg"/"тг"
  const tgMatch = bio.match(/t\.me\/([a-zA-Z0-9_]{5,})/i)
    || bio.match(/telegram[:\s]+@?([a-zA-Z0-9_]{5,})/i)
    || bio.match(/\btg[:\s@]+([a-zA-Z0-9_]{5,})/i)
    || bio.match(/\bтг[:\s@]+([a-zA-Z0-9_]{5,})/i);
  if (tgMatch) telegram = `https://t.me/${tgMatch[1]}`;

  if (!telegram && externalUrl && (externalUrl.includes('t.me/') || externalUrl.toLowerCase().includes('telegram'))) {
    telegram = externalUrl;
  }

  // Email
  const emailMatch = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  // Phone: international with +, or regional 8/7 starts. Handles spaces/dashes/parens.
  // Matches: +1 (555) 123-4567, +7 999 123 45 67, 8-999-123-45-67, +49 176 12345678, etc.
  const phoneRegexes = [
    /\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,4}/,        // +N... generic
    /\b[87][\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/,                 // RU: 8-999-123-45-67
  ];
  for (const rx of phoneRegexes) {
    const m = bio.match(rx);
    if (m) {
      // Validate: at least 10 digits total
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        phone = m[0].trim();
        break;
      }
    }
  }

  return { telegram, email, phone };
}
