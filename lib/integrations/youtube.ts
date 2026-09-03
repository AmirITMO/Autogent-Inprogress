// Google OAuth 2.0 + YouTube Data API v3 — один общий коннект на компанию
// (YoutubeConnection, id="singleton"), не привязан к конкретному User CRM.
// Именно Data API v3 (не YouTube Analytics API): даёт views/likes/comments
// по видео стабильно задокументированной, хорошо известной схемой ответа —
// в отличие от Analytics Reporting API (табличный {columnHeaders, rows}
// формат под конкретные dimensions/metrics), которую лучше не угадывать
// вслепую без реального прогона (см. дискуссию про Apify-акторы в этой же сессии).

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

function redirectUri(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL не задан на сервере CRM — нужен для OAuth redirect_uri");
  return `${appUrl.replace(/\/+$/, "")}/api/integrations/youtube/callback`;
}

export function buildAuthUrl(): string {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) throw new Error("YOUTUBE_CLIENT_ID не задан на сервере CRM");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // иначе Google не всегда отдаёт refresh_token при повторном подключении
  });
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET не заданы на сервере CRM");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token exchange вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET не заданы на сервере CRM");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Обновление токена Google вернуло ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as TokenResponse;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export type YoutubeVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

async function youtubeGet(accessToken: string, path: string, params: Record<string, string>) {
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API (${path}) вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// channels.list(mine=true) -> uploads playlist -> playlistItems.list -> videos.list(statistics)
// Стандартная трёхшаговая цепочка YouTube Data API v3 для "все видео своего канала со статистикой" —
// videos.list не поддерживает mine=true напрямую, нужен playlist с загрузками.
export async function fetchOwnChannelVideos(accessToken: string, maxVideos = 50): Promise<{ channelTitle: string; videos: YoutubeVideo[] }> {
  const channelsData = await youtubeGet(accessToken, "/channels", {
    part: "snippet,contentDetails",
    mine: "true",
  });
  const channel = channelsData.items?.[0];
  if (!channel) throw new Error("Не найден канал, привязанный к этому Google-аккаунту");
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  const channelTitle = channel.snippet?.title ?? "";
  if (!uploadsPlaylistId) return { channelTitle, videos: [] };

  const videoIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtubeGet(accessToken, "/playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) videoIds.push(id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && videoIds.length < maxVideos);

  const trimmedIds = videoIds.slice(0, maxVideos);
  const videos: YoutubeVideo[] = [];
  for (let i = 0; i < trimmedIds.length; i += 50) {
    const batch = trimmedIds.slice(i, i + 50);
    const data = await youtubeGet(accessToken, "/videos", {
      part: "snippet,statistics",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      videos.push({
        videoId: item.id,
        title: item.snippet?.title ?? "(без названия)",
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
        publishedAt: item.snippet?.publishedAt ?? null,
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: Number(item.statistics?.likeCount ?? 0),
        commentCount: Number(item.statistics?.commentCount ?? 0),
      });
    }
  }

  return { channelTitle, videos };
}
