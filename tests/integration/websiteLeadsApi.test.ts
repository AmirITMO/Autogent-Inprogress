import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { WEBSITE_AGENT_USER_ID } from "@/lib/constants";

// createLeadCore тянет lib/roles -> next-auth, который под vitest не резолвится
// (см. b2bEmailAgentApi.test.ts) — мокаем.
vi.mock("@/lib/roles", () => ({
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const API_KEY = "test-website-key";
process.env.WEBSITE_API_KEY = API_KEY;

const { POST: leadsPost } = await import("@/app/api/integrations/website/leads/route");

afterAll(() => {
  delete process.env.WEBSITE_API_KEY;
});

function req(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/website/leads", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let channelId: string;
let adminId: string;

beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.trafficChannel.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      id: WEBSITE_AGENT_USER_ID,
      name: "Сайт (лендинг)",
      email: "website-agent@test.local",
      passwordHash: "x",
      role: "EMPLOYEE",
      isBlocked: true,
      editCrm: true,
    },
  });
  const admin = await prisma.user.create({
    data: { name: "Админ", email: "admin@test.local", passwordHash: "x", role: "ADMIN" },
  });
  adminId = admin.id;

  const channel = await prisma.trafficChannel.create({
    data: { id: "channel-website", name: "Сайт", type: "MANUAL" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/website/leads — авторизация", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await leadsPost(req({ title: "Заявка", channelId }, null));
    expect(res.status).toBe(401);
  });

  it("отклоняет запрос с неверным X-Api-Key", async () => {
    const res = await leadsPost(req({ title: "Заявка", channelId }, "wrong-key"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/website/leads — валидация", () => {
  it("требует title", async () => {
    const res = await leadsPost(req({ channelId }));
    expect(res.status).toBe(400);
  });

  it("требует channelId", async () => {
    const res = await leadsPost(req({ title: "Заявка" }));
    expect(res.status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await leadsPost(req({ title: "Заявка", channelId: "ghost-channel" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_channel");
  });
});

describe("POST /api/integrations/website/leads — успешное создание", () => {
  it("создаёт лид с ownerId сервисного User и указанным channelId", async () => {
    const res = await leadsPost(
      req({
        title: "ООО Ромашка",
        company: "ООО Ромашка",
        description: "Хочет автоматизацию продаж",
        contactName: "Иван",
        contact: "+79990001122",
        channelId,
        externalId: "session-abc",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: body.id } });
    expect(lead.ownerId).toBe(WEBSITE_AGENT_USER_ID);
    expect(lead.channelId).toBe(channelId);
    expect(lead.contact).toBe("+79990001122");
  });

  it("уведомляет всех админов без ПДн в тексте — только заголовок и ссылка на карточку", async () => {
    const res = await leadsPost(
      req({
        title: "ООО Ромашка",
        contactName: "Иван Приватный",
        contact: "+79990001122",
        description: "Секретные детали клиента",
        channelId,
      })
    );
    const body = await res.json();

    const notifications = await prisma.notification.findMany({ where: { userId: adminId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("NEW_LEAD");
    expect(notifications[0].link).toBe(`/crm?lead=${body.id}`);

    const text = `${notifications[0].title} ${notifications[0].body ?? ""}`;
    expect(text).not.toContain("+79990001122");
    expect(text).not.toContain("Иван Приватный");
    expect(text).not.toContain("Секретные детали клиента");
  });
});
