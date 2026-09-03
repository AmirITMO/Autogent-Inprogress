import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const { buildAuthUrl } = await import("@/lib/integrations/youtube");
const { getYoutubeConnectionStatus, syncYoutubeStats } = await import("@/lib/actions/youtube");

beforeEach(async () => {
  await prisma.youtubeVideoStat.deleteMany();
  await prisma.youtubeConnection.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  process.env.YOUTUBE_CLIENT_ID = "test-client-id";
  process.env.YOUTUBE_CLIENT_SECRET = "test-client-secret";
  process.env.APP_URL = "https://crm.example.com";
});

afterEach(() => {
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;
  delete process.env.APP_URL;
});

describe("buildAuthUrl", () => {
  it("включает client_id, offline-доступ и правильный redirect_uri", () => {
    const url = new URL(buildAuthUrl());
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("redirect_uri")).toBe("https://crm.example.com/api/integrations/youtube/callback");
  });

  it("бросает понятную ошибку без YOUTUBE_CLIENT_ID", () => {
    delete process.env.YOUTUBE_CLIENT_ID;
    expect(() => buildAuthUrl()).toThrow(/YOUTUBE_CLIENT_ID/);
  });
});

describe("getYoutubeConnectionStatus", () => {
  it("connected:false, если коннекта ещё нет", async () => {
    const status = await getYoutubeConnectionStatus();
    expect(status).toEqual({ connected: false, channelTitle: null });
  });

  it("connected:true с названием канала после подключения", async () => {
    await prisma.youtubeConnection.create({
      data: {
        id: "singleton",
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: new Date(Date.now() + 3600_000),
        channelTitle: "Мой канал",
      },
    });
    const status = await getYoutubeConnectionStatus();
    expect(status).toEqual({ connected: true, channelTitle: "Мой канал" });
  });
});

describe("syncYoutubeStats", () => {
  it("возвращает понятную ошибку, если YouTube не подключён — не бросает исключение", async () => {
    const result = await syncYoutubeStats();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/не подключён/);
  });
});
