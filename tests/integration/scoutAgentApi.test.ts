import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { SCOUT_AGENT_USER_ID } from "@/lib/constants";

// createLeadCore зовёт assertCanEditCrm -> getPermissions из реального lib/roles,
// который тянет lib/auth.ts (next-auth) — а next-auth под vitest не резолвит
// свой "next/server" импорт. Мокаем roles, как это уже делают остальные тесты.
vi.mock("@/lib/roles", () => ({
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const API_KEY = "test-scout-agent-key";
process.env.SCOUT_AGENT_API_KEY = API_KEY;

const { POST: contactsPost } = await import("@/app/api/integrations/scout-agent/contacts/route");
const { POST: leadsPost } = await import("@/app/api/integrations/scout-agent/leads/route");
const { POST: metricsPost } = await import("@/app/api/integrations/scout-agent/metrics/route");

afterAll(() => {
  delete process.env.SCOUT_AGENT_API_KEY;
});

function req(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/scout-agent", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let channelId: string;

beforeEach(async () => {
  await prisma.scoutAgentContact.deleteMany();
  await prisma.scoutAgentMetricSnapshot.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.trafficChannel.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      id: SCOUT_AGENT_USER_ID,
      name: "Скаут-агент",
      email: "scout-agent@test.local",
      passwordHash: "x",
      role: "EMPLOYEE",
      isBlocked: true,
      editCrm: true,
    },
  });

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый канал скаута", type: "SCOUT_TELEGRAM" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/scout-agent/contacts — авторизация", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1" }, null));
    expect(res.status).toBe(401);
  });

  it("отклоняет запрос с неверным ключом", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1" }, "wrong-key"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/scout-agent/contacts", () => {
  it("требует channelId", async () => {
    const res = await contactsPost(req({ externalId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("требует externalId", async () => {
    const res = await contactsPost(req({ channelId }));
    expect(res.status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await contactsPost(req({ channelId: "does-not-exist", externalId: "c1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_channel");
  });

  it("отклоняет невалидный статус", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", status: "NOT_A_STATUS" }));
    expect(res.status).toBe(400);
  });

  it("создаёт контакт со статусом WRITTEN по умолчанию", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", name: "Иван" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("WRITTEN");

    const saved = await prisma.scoutAgentContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.name).toBe("Иван");
    expect(saved.channelId).toBe(channelId);
  });

  it("апсертит по (channelId, externalId) — повторный вызов обновляет, не дублирует", async () => {
    await contactsPost(req({ channelId, externalId: "c1", name: "Иван" }));
    await contactsPost(req({ channelId, externalId: "c1", name: "Иван Петров", status: "REPLIED" }));

    const all = await prisma.scoutAgentContact.findMany({ where: { channelId, externalId: "c1" } });
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Иван Петров");
    expect(all[0].status).toBe("REPLIED");
  });

  it("не даёт создать контакт под чужим/другим channelId с тем же externalId как отдельную запись", async () => {
    const other = await prisma.trafficChannel.create({ data: { name: "Другой канал", type: "SCOUT_TELEGRAM" } });
    await contactsPost(req({ channelId, externalId: "shared-id" }));
    await contactsPost(req({ channelId: other.id, externalId: "shared-id" }));

    const all = await prisma.scoutAgentContact.findMany({ where: { externalId: "shared-id" } });
    expect(all).toHaveLength(2); // разные каналы — разные контакты, уникальность per-channel
  });

  it("сохраняет dialogue целиком", async () => {
    const dialogue = [{ from: "scout", text: "Привет", at: "2026-08-14T10:00:00Z" }];
    const res = await contactsPost(req({ channelId, externalId: "c1", dialogue }));
    const body = await res.json();
    const saved = await prisma.scoutAgentContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.dialogue).toEqual(dialogue);
  });
});

describe("POST /api/integrations/scout-agent/leads", () => {
  it("требует title", async () => {
    const res = await leadsPost(req({ channelId }));
    expect(res.status).toBe(400);
  });

  it("требует channelId", async () => {
    const res = await leadsPost(req({ title: "Тест" }));
    expect(res.status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await leadsPost(req({ title: "Тест", channelId: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_channel");
  });

  it("создаёт лид с ownerId сервисного User скаута, на этапе SCHEDULED_CALL", async () => {
    const res = await leadsPost(req({ title: "Иван — кухня", channelId, contact: "@ivan" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: body.id } });
    expect(lead.ownerId).toBe(SCOUT_AGENT_USER_ID);
    expect(lead.stage).toBe("SCHEDULED_CALL");
    expect(lead.channelId).toBe(channelId);
  });

  it("отклоняет неизвестный contactExternalId", async () => {
    const res = await leadsPost(req({ title: "Тест", channelId, contactExternalId: "ghost" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_contact");
  });

  it("линкует контакт с лидом и проставляет LEAD_CREATED", async () => {
    const contactRes = await contactsPost(
      req({ channelId, externalId: "c1", name: "Иван", telegramUsername: "@ivan" })
    );
    const contactId = (await contactRes.json()).id;

    const leadRes = await leadsPost(req({ title: "Иван — кухня", channelId, contactExternalId: "c1" }));
    const leadBody = await leadRes.json();

    const contact = await prisma.scoutAgentContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.leadId).toBe(leadBody.id);
    expect(contact.status).toBe("LEAD_CREATED");
  });

  it("подставляет имя/контакт из связанного контакта, если явно не переданы", async () => {
    await contactsPost(req({ channelId, externalId: "c1", name: "Иван", telegramUsername: "@ivan" }));
    const leadRes = await leadsPost(req({ title: "Сделка", channelId, contactExternalId: "c1" }));
    const leadBody = await leadRes.json();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadBody.id } });
    expect(lead.contactName).toBe("Иван");
    expect(lead.contact).toBe("@ivan");
  });

  it("идемпотентна при повторном вызове с тем же contactExternalId — не плодит вторую сделку", async () => {
    await contactsPost(req({ channelId, externalId: "c1" }));

    const first = await leadsPost(req({ title: "Сделка", channelId, contactExternalId: "c1" }));
    const second = await leadsPost(
      req({ title: "Сделка (повтор из-за ретрая сети)", channelId, contactExternalId: "c1" })
    );

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);

    const allLeads = await prisma.lead.findMany({ where: { channelId } });
    expect(allLeads).toHaveLength(1);
  });
});

describe("POST /api/integrations/scout-agent/metrics", () => {
  it("требует channelId", async () => {
    const res = await metricsPost(req({ messagesScanned: 10 }));
    expect(res.status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await metricsPost(req({ channelId: "nope" }));
    expect(res.status).toBe(400);
  });

  it("сохраняет произвольный payload целиком", async () => {
    const payload = {
      channelId,
      messagesScanned: 100,
      triggersFound: 5,
      accounts: [{ name: "Амир", sentToday: 10, dailyLimit: 40 }],
    };
    const res = await metricsPost(req(payload));
    expect(res.status).toBe(200);
    const body = await res.json();

    const saved = await prisma.scoutAgentMetricSnapshot.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.payload).toMatchObject({ messagesScanned: 100, triggersFound: 5 });
  });

  it("хранит несколько снимков независимо (не перезаписывает)", async () => {
    await metricsPost(req({ channelId, messagesScanned: 10 }));
    await metricsPost(req({ channelId, messagesScanned: 20 }));

    const all = await prisma.scoutAgentMetricSnapshot.findMany({ where: { channelId } });
    expect(all).toHaveLength(2);
  });
});
