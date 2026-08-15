import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-b2b-email-kb-key";
process.env.B2B_EMAIL_AGENT_API_KEY = API_KEY;

const { GET: kbGet } = await import("@/app/api/integrations/b2b-email-agent/knowledge-base/route");

afterAll(() => {
  delete process.env.B2B_EMAIL_AGENT_API_KEY;
});

function req(channelId: string | null, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  const url = new URL("http://localhost/api/integrations/b2b-email-agent/knowledge-base");
  if (channelId !== null) url.searchParams.set("channelId", channelId);
  return new Request(url, { headers });
}

let channelId: string;

beforeEach(async () => {
  await prisma.agentKnowledgeBase.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый B2B email-канал", type: "B2B_EMAIL" },
  });
  channelId = channel.id;
});

describe("GET /api/integrations/b2b-email-agent/knowledge-base", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await kbGet(req(channelId, null));
    expect(res.status).toBe(401);
  });

  it("отклоняет чужой X-Api-Key (не совпадает с B2B_EMAIL_AGENT_API_KEY)", async () => {
    const res = await kbGet(req(channelId, "wrong-key"));
    expect(res.status).toBe(401);
  });

  it("требует channelId", async () => {
    const res = await kbGet(req(null));
    expect(res.status).toBe(400);
  });

  it("возвращает сохранённый content", async () => {
    await prisma.agentKnowledgeBase.create({
      data: { channelId, content: "# Офферы\nСкидка 10% при оплате за год." },
    });

    const res = await kbGet(req(channelId));
    const body = await res.json();
    expect(body.content).toContain("Скидка 10%");
    expect(body.updatedAt).not.toBeNull();
  });
});
