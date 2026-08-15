import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-scout-agent-kb-key";
process.env.SCOUT_AGENT_API_KEY = API_KEY;

const { GET: kbGet } = await import("@/app/api/integrations/scout-agent/knowledge-base/route");

afterAll(() => {
  delete process.env.SCOUT_AGENT_API_KEY;
});

function req(channelId: string | null, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  const url = new URL("http://localhost/api/integrations/scout-agent/knowledge-base");
  if (channelId !== null) url.searchParams.set("channelId", channelId);
  return new Request(url, { headers });
}

let channelId: string;

beforeEach(async () => {
  await prisma.agentKnowledgeBase.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый канал скаута", type: "SCOUT_TELEGRAM" },
  });
  channelId = channel.id;
});

describe("GET /api/integrations/scout-agent/knowledge-base", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await kbGet(req(channelId, null));
    expect(res.status).toBe(401);
  });

  it("требует channelId", async () => {
    const res = await kbGet(req(null));
    expect(res.status).toBe(400);
  });

  it("возвращает пустой content, если база знаний ещё не заводилась", async () => {
    const res = await kbGet(req(channelId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("");
    expect(body.updatedAt).toBeNull();
  });

  it("возвращает сохранённый content, если он есть", async () => {
    await prisma.agentKnowledgeBase.create({
      data: { channelId, content: "# Продукт\nАвтоматизация CRM для агентств." },
    });

    const res = await kbGet(req(channelId));
    const body = await res.json();
    expect(body.content).toContain("Автоматизация CRM");
    expect(body.updatedAt).not.toBeNull();
  });

  it("не требует существования канала — просто вернёт пустой content для неизвестного channelId", async () => {
    // Намеренно: агент может обратиться раньше, чем UI-сторона это заметит,
    // 400 тут не нужен — эндпоинт не создающий, только читающий.
    const res = await kbGet(req("does-not-exist"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("");
  });
});
