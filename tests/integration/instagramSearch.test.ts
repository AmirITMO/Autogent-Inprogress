import { describe, it, expect, beforeEach, vi } from "vitest";
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

const { sendSearchSetupMessage, rerunSearchProfile } = await import("@/lib/actions/instagramSearch");

let channelId: string;

beforeEach(async () => {
  await prisma.instagramScrapeJob.deleteMany();
  await prisma.instagramSearchProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый Instagram-канал", type: "INSTAGRAM" },
  });
  channelId = channel.id;
});

describe("rerunSearchProfile", () => {
  it("создаёт новый job по существующему профилю без обращения к LLM", async () => {
    const profile = await prisma.instagramSearchProfile.create({
      data: { channelId, name: "Мебельщики", criteria: { niche: "мебель" } },
    });

    const result = await rerunSearchProfile(profile.id, 30);

    const job = await prisma.instagramScrapeJob.findUniqueOrThrow({ where: { id: result.jobId } });
    expect(job.requestedCount).toBe(30);
    expect(job.status).toBe("PENDING");
    expect(job.searchProfileId).toBe(profile.id);
  });

  it("отклоняет count >= 50", async () => {
    const profile = await prisma.instagramSearchProfile.create({
      data: { channelId, name: "Мебельщики", criteria: {} },
    });

    await expect(rerunSearchProfile(profile.id, 50)).rejects.toThrow(/1 до 49/);
    const jobs = await prisma.instagramScrapeJob.findMany({ where: { searchProfileId: profile.id } });
    expect(jobs).toHaveLength(0);
  });

  it("отклоняет count <= 0", async () => {
    const profile = await prisma.instagramSearchProfile.create({
      data: { channelId, name: "Мебельщики", criteria: {} },
    });

    await expect(rerunSearchProfile(profile.id, 0)).rejects.toThrow();
  });
});

describe("sendSearchSetupMessage — валидация count не полагается на LLM", () => {
  it("не создаёт job, если модель вызвала create_scrape_job со слишком большим count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const hasToolResult = body.messages.some((m: { role: string }) => m.role === "tool");

        if (!hasToolResult) {
          // Первый вызов: модель сразу сохраняет профиль и просит 100 аккаунтов —
          // граничный случай, а не реалистичный диалог, но так удобнее проверить
          // именно серверную защиту от количества.
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        function: {
                          name: "save_search_profile",
                          arguments: JSON.stringify({ name: "Мебельщики", criteria: { niche: "мебель" } }),
                        },
                      },
                      {
                        id: "call_2",
                        function: { name: "create_scrape_job", arguments: JSON.stringify({ count: 100 }) },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Хорошо, уточните число до 49." } }] }),
          { status: 200 }
        );
      })
    );
    process.env.OPENAI_API_KEY = "test-key";

    const result = await sendSearchSetupMessage(channelId, [], "Ищем мебельщиков в СПб, до 100 аккаунтов");

    expect(result.profileSaved).toBe(true);
    expect(result.jobId).toBeNull();
    const jobs = await prisma.instagramScrapeJob.findMany({ where: { channelId } });
    expect(jobs).toHaveLength(0);

    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });
});

describe("sendSearchSetupMessage — джоб привязывается к профилю ЭТОГО диалога, не к последнему в канале", () => {
  it("использует profileId, возвращённый на предыдущем ходу, а не самый свежий профиль канала", async () => {
    // Ловушка для регрессии: в канале уже есть более новый профиль от другого
    // диалога — если бы сервер угадывал профиль как "последний в канале",
    // джоб ошибочно приклеился бы сюда.
    await prisma.instagramSearchProfile.create({
      data: { channelId, name: "Чужой недавний профиль", criteria: { keywords: ["другое"] } },
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        function: {
                          name: "save_search_profile",
                          arguments: JSON.stringify({
                            name: "Мебельщики СПб",
                            criteria: { keywords: ["мебель"] },
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (call === 2) {
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "Сколько аккаунтов искать?" } }] }),
            { status: 200 }
          );
        }
        if (call === 3) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_2",
                        function: { name: "create_scrape_job", arguments: JSON.stringify({ count: 20 }) },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "Готово." } }] }), { status: 200 });
      })
    );
    process.env.OPENAI_API_KEY = "test-key";

    const first = await sendSearchSetupMessage(channelId, [], "Ищем мебельщиков в СПб", null);
    expect(first.profileSaved).toBe(true);
    expect(first.profileId).not.toBeNull();

    const second = await sendSearchSetupMessage(channelId, [], "20 аккаунтов", first.profileId);
    expect(second.jobId).not.toBeNull();

    const job = await prisma.instagramScrapeJob.findUniqueOrThrow({ where: { id: second.jobId! } });
    expect(job.searchProfileId).toBe(first.profileId);

    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });
});
