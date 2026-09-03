import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { exchangeCodeForTokens, fetchOwnChannelVideos } from "@/lib/integrations/youtube";

const YOUTUBE_CHANNEL_PATH = "/channels/channel-youtube";

export async function GET(req: Request) {
  await requireUser();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(`${url.origin}${YOUTUBE_CHANNEL_PATH}?youtube_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return Response.redirect(`${url.origin}${YOUTUBE_CHANNEL_PATH}?youtube_error=no_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google не отдаёт refresh_token, если пользователь уже давал согласие
      // раньше и prompt=consent почему-то не сработал — без него не сможем
      // обновлять access_token и через час коннект перестанет работать.
      return Response.redirect(
        `${url.origin}${YOUTUBE_CHANNEL_PATH}?youtube_error=no_refresh_token`
      );
    }

    const { channelTitle } = await fetchOwnChannelVideos(tokens.access_token, 1).catch(() => ({ channelTitle: null }));

    await prisma.youtubeConnection.upsert({
      where: { id: "singleton" },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        channelTitle: channelTitle ?? undefined,
      },
      create: {
        id: "singleton",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        channelTitle: channelTitle ?? undefined,
      },
    });

    return Response.redirect(`${url.origin}${YOUTUBE_CHANNEL_PATH}?youtube_connected=1`);
  } catch (err) {
    console.error("YouTube OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return Response.redirect(`${url.origin}${YOUTUBE_CHANNEL_PATH}?youtube_error=${encodeURIComponent(message)}`);
  }
}
