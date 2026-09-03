import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchAccountReels } from "@/lib/integrations/instagramReels";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(items: unknown[], status = 200) {
  global.fetch = vi.fn(async () => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(items),
    json: async () => items,
  })) as unknown as typeof fetch;
}

describe("fetchAccountReels", () => {
  it("возвращает только посты типа video/reel/clip, пропускает фото", async () => {
    mockFetch([
      {
        latestPosts: [
          { shortCode: "abc123", type: "video", videoViewCount: 5000, likesCount: 100, commentsCount: 10 },
          { shortCode: "photo1", type: "image", likesCount: 50 },
        ],
      },
    ]);

    const posts = await fetchAccountReels("test-token", "someaccount");

    expect(posts).toHaveLength(1);
    expect(posts[0].shortcode).toBe("abc123");
    expect(posts[0].viewCount).toBe(5000);
    expect(posts[0].likeCount).toBe(100);
  });

  it("собирает просмотры из разных вариантов имени поля", async () => {
    mockFetch([
      { latestPosts: [{ shortCode: "a", type: "reel", videoPlayCount: 777, likesCount: 1, commentsCount: 0 }] },
    ]);

    const posts = await fetchAccountReels("test-token", "someaccount");
    expect(posts[0].viewCount).toBe(777);
  });

  it("дедуплицирует посты по shortcode из нескольких полей (latestPosts+topPosts)", async () => {
    mockFetch([
      {
        latestPosts: [{ shortCode: "dup", type: "video", videoViewCount: 100 }],
        topPosts: [{ shortCode: "dup", type: "video", videoViewCount: 999 }],
      },
    ]);

    const posts = await fetchAccountReels("test-token", "someaccount");
    expect(posts).toHaveLength(1);
  });

  it("возвращает пустой массив, если профиль не найден", async () => {
    mockFetch([]);
    const posts = await fetchAccountReels("test-token", "unknown");
    expect(posts).toEqual([]);
  });

  it("пропускает посты без shortcode", async () => {
    mockFetch([{ latestPosts: [{ type: "video", videoViewCount: 100 }] }]);
    const posts = await fetchAccountReels("test-token", "someaccount");
    expect(posts).toEqual([]);
  });

  it("бросает понятную ошибку при неуспешном ответе Apify", async () => {
    mockFetch({ error: "unauthorized" } as unknown as unknown[], 401);
    await expect(fetchAccountReels("bad-token", "someaccount")).rejects.toThrow(/Apify вернул ошибку 401/);
  });
});
