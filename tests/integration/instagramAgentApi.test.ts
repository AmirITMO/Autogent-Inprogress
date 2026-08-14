import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-instagram-agent-key";
process.env.INSTAGRAM_AGENT_API_KEY = API_KEY;

const { POST: contactsPost } = await import("@/app/api/integrations/instagram-agent/contacts/route");
const { POST: metricsPost } = await import("@/app/api/integrations/instagram-agent/metrics/route");

afterAll(() => {
  delete process.env.INSTAGRAM_AGENT_API_KEY;
});

function req(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/instagram-agent", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let channelId: string;

beforeEach(async () => {
  await prisma.instagramContact.deleteMany();
  await prisma.instagramMetricSnapshot.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый Instagram-канал", type: "INSTAGRAM" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/instagram-agent/contacts — авторизация", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", username: "test" }, null));
    expect(res.status).toBe(401);
  });

  it("отклоняет запрос с неверным ключом", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", username: "test" }, "wrong"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/instagram-agent/contacts", () => {
  it("требует channelId, externalId и username", async () => {
    expect((await contactsPost(req({ externalId: "c1", username: "t" }))).status).toBe(400);
    expect((await contactsPost(req({ channelId, username: "t" }))).status).toBe(400);
    expect((await contactsPost(req({ channelId, externalId: "c1" }))).status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await contactsPost(req({ channelId: "nope", externalId: "c1", username: "t" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_channel");
  });

  it("создаёт контакт со статусом FOUND — агент не может выставить статус сам", async () => {
    const res = await contactsPost(
      req({ channelId, externalId: "c1", username: "furniture_spb", status: "LEAD_CREATED" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // status в теле запроса должен быть полностью проигнорирован — это поле
    // управляется только сотрудником через CRM (см. design: агент не пишет сам).
    expect(body.status).toBe("FOUND");

    const saved = await prisma.instagramContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.status).toBe("FOUND");
  });

  it("апсертит по (channelId, externalId), не создавая дубликат, и не трогает статус при обновлении", async () => {
    const first = await contactsPost(req({ channelId, externalId: "c1", username: "furniture_spb" }));
    const firstId = (await first.json()).id;

    // Сотрудник вручную поменял статус в CRM между двумя приходами от агента.
    await prisma.instagramContact.update({ where: { id: firstId }, data: { status: "CONTACTED" } });

    await contactsPost(req({ channelId, externalId: "c1", username: "furniture_spb", followers: 5000 }));

    const all = await prisma.instagramContact.findMany({ where: { channelId, externalId: "c1" } });
    expect(all).toHaveLength(1);
    expect(all[0].followers).toBe(5000);
    // Повторный приход от агента не должен затирать статус, выставленный сотрудником.
    expect(all[0].status).toBe("CONTACTED");
  });
});

describe("POST /api/integrations/instagram-agent/metrics", () => {
  it("требует channelId", async () => {
    const res = await metricsPost(req({ accountsScanned: 10 }));
    expect(res.status).toBe(400);
  });

  it("сохраняет payload", async () => {
    const res = await metricsPost(req({ channelId, accountsScanned: 500, accountsFound: 12 }));
    const body = await res.json();
    const saved = await prisma.instagramMetricSnapshot.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.payload).toMatchObject({ accountsScanned: 500, accountsFound: 12 });
  });
});
