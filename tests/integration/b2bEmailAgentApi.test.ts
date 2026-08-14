import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { B2B_EMAIL_AGENT_USER_ID } from "@/lib/constants";

// См. scoutAgentApi.test.ts — createLeadCore тянет lib/roles -> next-auth,
// который под vitest не резолвится. Мокаем.
vi.mock("@/lib/roles", () => ({
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const API_KEY = "test-b2b-email-agent-key";
process.env.B2B_EMAIL_AGENT_API_KEY = API_KEY;

const { POST: contactsPost } = await import("@/app/api/integrations/b2b-email-agent/contacts/route");
const { POST: leadsPost } = await import("@/app/api/integrations/b2b-email-agent/leads/route");
const { POST: metricsPost } = await import("@/app/api/integrations/b2b-email-agent/metrics/route");

afterAll(() => {
  delete process.env.B2B_EMAIL_AGENT_API_KEY;
});

function req(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/b2b-email-agent", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let channelId: string;

beforeEach(async () => {
  await prisma.b2bEmailContact.deleteMany();
  await prisma.b2bEmailMetricSnapshot.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.trafficChannel.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      id: B2B_EMAIL_AGENT_USER_ID,
      name: "B2B Email-агент",
      email: "b2b-email-agent@test.local",
      passwordHash: "x",
      role: "EMPLOYEE",
      isBlocked: true,
      editCrm: true,
    },
  });

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый email-канал", type: "B2B_EMAIL" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/b2b-email-agent/contacts — авторизация", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1" }, null));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/b2b-email-agent/contacts", () => {
  it("требует channelId и externalId", async () => {
    expect((await contactsPost(req({ externalId: "c1" }))).status).toBe(400);
    expect((await contactsPost(req({ channelId }))).status).toBe(400);
  });

  it("отклоняет невалидный статус", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", status: "BOGUS" }));
    expect(res.status).toBe(400);
  });

  it("создаёт контакт со статусом WRITTEN по умолчанию и нулевым followUpCount", async () => {
    const res = await contactsPost(req({ channelId, externalId: "c1", companyName: "ООО Ромашка" }));
    const body = await res.json();
    expect(body.status).toBe("WRITTEN");

    const saved = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.followUpCount).toBe(0);
    expect(saved.nextFollowUpAt).toBeNull();
  });

  it("апсертит по (channelId, externalId), обновляя followUpCount/nextFollowUpAt", async () => {
    await contactsPost(req({ channelId, externalId: "c1", companyName: "ООО Ромашка" }));
    await contactsPost(
      req({
        channelId,
        externalId: "c1",
        followUpCount: 2,
        nextFollowUpAt: "2026-08-20T09:00:00.000Z",
      })
    );

    const all = await prisma.b2bEmailContact.findMany({ where: { channelId, externalId: "c1" } });
    expect(all).toHaveLength(1);
    expect(all[0].followUpCount).toBe(2);
    expect(all[0].nextFollowUpAt?.toISOString()).toBe("2026-08-20T09:00:00.000Z");
    // companyName не передан во втором вызове (undefined) — Prisma опускает такое
    // поле из SQL UPDATE целиком, а не пишет NULL, так что старое значение сохраняется.
    // Это важно: агенту не нужно каждый раз слать все поля заново, только изменившиеся.
    expect(all[0].companyName).toBe("ООО Ромашка");
  });
});

describe("POST /api/integrations/b2b-email-agent/leads", () => {
  it("создаёт лид с ownerId сервисного User email-агента", async () => {
    const res = await leadsPost(req({ title: "Ромашка — автоматизация", channelId }));
    const body = await res.json();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: body.id } });
    expect(lead.ownerId).toBe(B2B_EMAIL_AGENT_USER_ID);
    expect(lead.stage).toBe("SCHEDULED_CALL");
  });

  it("линкует контакт, проставляет LEAD_CREATED и подставляет company/contact из контакта", async () => {
    const contactRes = await contactsPost(
      req({ channelId, externalId: "c1", companyName: "ООО Ромашка", contactEmail: "info@romashka.ru" })
    );
    const contactId = (await contactRes.json()).id;

    const leadRes = await leadsPost(req({ title: "Ромашка — сделка", channelId, contactExternalId: "c1" }));
    const leadBody = await leadRes.json();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadBody.id } });
    expect(lead.company).toBe("ООО Ромашка");
    expect(lead.contact).toBe("info@romashka.ru");

    const contact = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.leadId).toBe(lead.id);
    expect(contact.status).toBe("LEAD_CREATED");
  });

  it("идемпотентна при повторном вызове с тем же contactExternalId", async () => {
    await contactsPost(req({ channelId, externalId: "c1" }));
    const first = await leadsPost(req({ title: "Сделка", channelId, contactExternalId: "c1" }));
    const second = await leadsPost(req({ title: "Сделка (ретрай)", channelId, contactExternalId: "c1" }));

    expect((await second.json()).id).toBe((await first.json()).id);
    expect(await prisma.lead.count({ where: { channelId } })).toBe(1);
  });

  it("отклоняет неизвестный contactExternalId", async () => {
    const res = await leadsPost(req({ title: "Тест", channelId, contactExternalId: "ghost" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/integrations/b2b-email-agent/metrics", () => {
  it("сохраняет payload", async () => {
    const res = await metricsPost(req({ channelId, companiesParsed: 300, emailsSent: 40 }));
    const body = await res.json();
    const saved = await prisma.b2bEmailMetricSnapshot.findUniqueOrThrow({ where: { id: body.id } });
    expect(saved.payload).toMatchObject({ companiesParsed: 300, emailsSent: 40 });
  });
});
