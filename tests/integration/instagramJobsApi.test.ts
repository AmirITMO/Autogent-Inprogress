import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-instagram-jobs-key";
process.env.INSTAGRAM_AGENT_API_KEY = API_KEY;

const { GET: jobsGet } = await import("@/app/api/integrations/instagram-agent/jobs/route");
const { POST: completePost } = await import("@/app/api/integrations/instagram-agent/jobs/[id]/complete/route");
const { POST: contactsPost } = await import("@/app/api/integrations/instagram-agent/contacts/route");

afterAll(() => {
  delete process.env.INSTAGRAM_AGENT_API_KEY;
});

function getReq(status: string | null, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  const url = new URL("http://localhost/api/integrations/instagram-agent/jobs");
  if (status !== null) url.searchParams.set("status", status);
  return new Request(url, { headers });
}

function completeReq(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/instagram-agent/jobs/x/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function contactsReq(body: unknown) {
  return new Request("http://localhost/api/integrations/instagram-agent/contacts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
}

let channelId: string;
let profileId: string;

beforeEach(async () => {
  await prisma.instagramScrapeJob.deleteMany();
  await prisma.instagramSearchProfile.deleteMany();
  await prisma.instagramContact.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый Instagram-канал", type: "INSTAGRAM" },
  });
  channelId = channel.id;

  const profile = await prisma.instagramSearchProfile.create({
    data: { channelId, name: "Мебельщики СПб", criteria: { niche: "мебель", city: "СПб" } },
  });
  profileId = profile.id;
});

describe("GET /api/integrations/instagram-agent/jobs", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await jobsGet(getReq("PENDING", null));
    expect(res.status).toBe(401);
  });

  it("требует status", async () => {
    const res = await jobsGet(getReq(null));
    expect(res.status).toBe(400);
  });

  it("отклоняет невалидный status", async () => {
    const res = await jobsGet(getReq("NOT_A_STATUS"));
    expect(res.status).toBe(400);
  });

  it("возвращает пустой список, если заданий нет", async () => {
    const res = await jobsGet(getReq("PENDING"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });

  it("возвращает PENDING-задание с критериями профиля поиска", async () => {
    await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });

    const res = await jobsGet(getReq("PENDING"));
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].requestedCount).toBe(20);
    expect(body.jobs[0].searchProfile.criteria).toEqual({ niche: "мебель", city: "СПб" });
  });

  it("принимает status в любом регистре", async () => {
    await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });

    const res = await jobsGet(getReq("pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
  });

  it("claim on read: выдача PENDING переводит задание в IN_PROGRESS, повторный запрос его не возвращает", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });

    const first = await jobsGet(getReq("PENDING"));
    expect((await first.json()).jobs).toHaveLength(1);

    const updated = await prisma.instagramScrapeJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("IN_PROGRESS");

    const second = await jobsGet(getReq("PENDING"));
    expect((await second.json()).jobs).toHaveLength(0);
  });

  it("не возвращает DONE-задания при запросе PENDING", async () => {
    await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20, status: "DONE" },
    });

    const res = await jobsGet(getReq("PENDING"));
    const body = await res.json();
    expect(body.jobs).toEqual([]);
  });
});

describe("POST /api/integrations/instagram-agent/jobs/:id/complete", () => {
  it("требует foundCount", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(completeReq({}), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
  });

  it("отклоняет отрицательный foundCount", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(completeReq({ foundCount: -5 }), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
  });

  it("отклоняет дробный foundCount", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(completeReq({ foundCount: 1.5 }), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
  });

  it("404 на неизвестный job id", async () => {
    const res = await completePost(completeReq({ foundCount: 5 }), { params: Promise.resolve({ id: "ghost" }) });
    expect(res.status).toBe(404);
  });

  it("помечает DONE без errorMessage", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(completeReq({ foundCount: 18 }), { params: Promise.resolve({ id: job.id }) });
    const body = await res.json();
    expect(body.status).toBe("DONE");
    expect(body.foundCount).toBe(18);
  });

  it("помечает FAILED, если передан errorMessage", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(
      completeReq({ foundCount: 0, errorMessage: "login challenge" }),
      { params: Promise.resolve({ id: job.id }) }
    );
    const body = await res.json();
    expect(body.status).toBe("FAILED");
  });

  it("идемпотентна — повторный вызов не падает, перезаписывает результат", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    await completePost(completeReq({ foundCount: 10 }), { params: Promise.resolve({ id: job.id }) });
    const second = await completePost(completeReq({ foundCount: 15 }), { params: Promise.resolve({ id: job.id }) });
    expect(second.status).toBe(200);
    const updated = await prisma.instagramScrapeJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.foundCount).toBe(15);
  });

  // Регрессия: "status: body.errorMessage ? ... " (truthy-проверка) считала
  // пустую строку отсутствием ошибки — исключение без текста (str(e) === "")
  // молча помечало бы задание DONE вместо FAILED.
  it("помечает FAILED даже при errorMessage: '' (пустая строка — не 'ошибки нет')", async () => {
    const job = await prisma.instagramScrapeJob.create({
      data: { channelId, searchProfileId: profileId, requestedCount: 20 },
    });
    const res = await completePost(completeReq({ foundCount: 0, errorMessage: "" }), {
      params: Promise.resolve({ id: job.id }),
    });
    const body = await res.json();
    expect(body.status).toBe("FAILED");
  });
});

describe("POST /api/integrations/instagram-agent/contacts — draftMessage", () => {
  it("сохраняет draftMessage", async () => {
    const res = await contactsPost(
      contactsReq({ channelId, externalId: "acc1", username: "furniture_spb", draftMessage: "Добрый день! ..." })
    );
    const body = await res.json();
    const saved = await prisma.instagramContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.draftMessage).toBe("Добрый день! ...");
  });
});
