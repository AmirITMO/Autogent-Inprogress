import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-b2b-email-jobs-key";
process.env.B2B_EMAIL_AGENT_API_KEY = API_KEY;

const { GET: jobsGet } = await import("@/app/api/integrations/b2b-email-agent/jobs/route");
const { POST: completePost } = await import("@/app/api/integrations/b2b-email-agent/jobs/[id]/complete/route");

afterAll(() => {
  delete process.env.B2B_EMAIL_AGENT_API_KEY;
});

function getReq(status: string | null, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  const url = new URL("http://localhost/api/integrations/b2b-email-agent/jobs");
  if (status !== null) url.searchParams.set("status", status);
  return new Request(url, { headers });
}

function completeReq(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/b2b-email-agent/jobs/x/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let channelId: string;

beforeEach(async () => {
  await prisma.b2bEmailSearchJob.deleteMany();
  await prisma.b2bEmailContact.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый email-канал", type: "B2B_EMAIL" },
  });
  channelId = channel.id;
});

describe("GET /api/integrations/b2b-email-agent/jobs", () => {
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

  it("возвращает PENDING-задание без профиля — только requestedCount", async () => {
    await prisma.b2bEmailSearchJob.create({ data: { channelId, requestedCount: 25 } });

    const res = await jobsGet(getReq("PENDING"));
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].requestedCount).toBe(25);
    expect(body.jobs[0].channelId).toBe(channelId);
  });

  it("claim on read: выдача PENDING переводит задание в IN_PROGRESS", async () => {
    const job = await prisma.b2bEmailSearchJob.create({ data: { channelId, requestedCount: 25 } });

    const first = await jobsGet(getReq("PENDING"));
    expect((await first.json()).jobs).toHaveLength(1);

    const updated = await prisma.b2bEmailSearchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("IN_PROGRESS");

    const second = await jobsGet(getReq("PENDING"));
    expect((await second.json()).jobs).toHaveLength(0);
  });
});

describe("POST /api/integrations/b2b-email-agent/jobs/:id/complete", () => {
  it("требует foundCount", async () => {
    const job = await prisma.b2bEmailSearchJob.create({ data: { channelId, requestedCount: 25 } });
    const res = await completePost(completeReq({}), { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(400);
  });

  it("404 на неизвестный job id", async () => {
    const res = await completePost(completeReq({ foundCount: 5 }), { params: Promise.resolve({ id: "ghost" }) });
    expect(res.status).toBe(404);
  });

  it("помечает DONE без errorMessage", async () => {
    const job = await prisma.b2bEmailSearchJob.create({ data: { channelId, requestedCount: 25 } });
    const res = await completePost(completeReq({ foundCount: 12 }), { params: Promise.resolve({ id: job.id }) });
    const body = await res.json();
    expect(body.status).toBe("DONE");
    expect(body.foundCount).toBe(12);
  });

  it("помечает FAILED, если передан errorMessage", async () => {
    const job = await prisma.b2bEmailSearchJob.create({ data: { channelId, requestedCount: 25 } });
    const res = await completePost(completeReq({ foundCount: 0, errorMessage: "нет описания ICP в базе знаний" }), {
      params: Promise.resolve({ id: job.id }),
    });
    const body = await res.json();
    expect(body.status).toBe("FAILED");
  });
});
