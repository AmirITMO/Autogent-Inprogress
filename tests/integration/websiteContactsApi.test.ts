import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

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
  requireUser: async () => ({ id: adminId, role: "ADMIN" as const }),
}));

const API_KEY = "test-website-key";
process.env.WEBSITE_API_KEY = API_KEY;

const { POST: contactsPost } = await import("@/app/api/integrations/website/contacts/route");
const { convertWebsiteContactToLead, declineWebsiteContact } = await import("@/lib/actions/websiteContacts");

afterAll(() => {
  delete process.env.WEBSITE_API_KEY;
});

function req(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/integrations/website/contacts", {
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
  await prisma.websiteContact.deleteMany();
  await prisma.trafficChannel.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: { name: "Админ", email: "admin@test.local", passwordHash: "x", role: "ADMIN" },
  });
  adminId = admin.id;

  const channel = await prisma.trafficChannel.create({
    data: { id: "channel-website", name: "Сайт", type: "WEBSITE" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/website/contacts — авторизация", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId, externalId: "s1" }, null));
    expect(res.status).toBe(401);
  });

  it("отклоняет запрос с неверным X-Api-Key", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId, externalId: "s1" }, "wrong-key"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/website/contacts — валидация", () => {
  it("требует title", async () => {
    const res = await contactsPost(req({ channelId, externalId: "s1" }));
    expect(res.status).toBe(400);
  });

  it("требует channelId", async () => {
    const res = await contactsPost(req({ title: "Заявка", externalId: "s1" }));
    expect(res.status).toBe(400);
  });

  it("требует externalId", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId }));
    expect(res.status).toBe(400);
  });

  it("отклоняет несуществующий channelId", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId: "ghost-channel", externalId: "s1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_channel");
  });
});

describe("POST /api/integrations/website/contacts — создание, без сделки в CRM", () => {
  it("создаёт WebsiteContact, но НЕ создаёт Lead", async () => {
    const res = await contactsPost(
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

    const contact = await prisma.websiteContact.findUniqueOrThrow({ where: { id: body.id } });
    expect(contact.status).toBe("NEW");
    expect(contact.leadId).toBeNull();
    expect(await prisma.lead.count()).toBe(0);
  });

  it("ретрай с тем же externalId обновляет ту же карточку, а не плодит вторую", async () => {
    await contactsPost(req({ title: "Черновик", channelId, externalId: "session-abc" }));
    const res2 = await contactsPost(req({ title: "ООО Ромашка (уточнили)", channelId, externalId: "session-abc" }));
    expect(res2.status).toBe(200);

    const contacts = await prisma.websiteContact.findMany({ where: { channelId, externalId: "session-abc" } });
    expect(contacts).toHaveLength(1);
    expect(contacts[0].title).toBe("ООО Ромашка (уточнили)");
  });

  it("уведомляет всех админов без ПДн в тексте — только заголовок и ссылка на канал", async () => {
    const res = await contactsPost(
      req({
        title: "ООО Ромашка",
        contactName: "Иван Приватный",
        contact: "+79990001122",
        description: "Секретные детали клиента",
        channelId,
        externalId: "session-xyz",
      })
    );
    await res.json();

    const notifications = await prisma.notification.findMany({ where: { userId: adminId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("NEW_LEAD");
    expect(notifications[0].link).toBe(`/channels/${channelId}`);

    const text = `${notifications[0].title} ${notifications[0].body ?? ""}`;
    expect(text).not.toContain("+79990001122");
    expect(text).not.toContain("Иван Приватный");
    expect(text).not.toContain("Секретные детали клиента");
  });

  it("повторный пуш того же externalId не шлёт уведомление повторно", async () => {
    await contactsPost(req({ title: "Заявка", channelId, externalId: "session-dup" }));
    await contactsPost(req({ title: "Заявка (обновили)", channelId, externalId: "session-dup" }));

    const notifications = await prisma.notification.findMany({ where: { userId: adminId } });
    expect(notifications).toHaveLength(1);
  });
});

describe("convertWebsiteContactToLead — сотрудник вручную заводит сделку", () => {
  it("создаёт Lead от лица сотрудника и привязывает контакт", async () => {
    const res = await contactsPost(
      req({
        title: "ООО Ромашка",
        company: "ООО Ромашка",
        contact: "+79990001122",
        channelId,
        externalId: "session-abc",
      })
    );
    const { id: contactId } = await res.json();

    const lead = await convertWebsiteContactToLead(contactId);
    expect(lead.channelId).toBe(channelId);
    expect(lead.ownerId).toBe(adminId);

    const contact = await prisma.websiteContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.leadId).toBe(lead.id);
    expect(contact.status).toBe("LEAD_CREATED");
  });

  it("не даёт повторно создать сделку из уже привязанного контакта", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId, externalId: "session-abc" }));
    const { id: contactId } = await res.json();
    await convertWebsiteContactToLead(contactId);

    await expect(convertWebsiteContactToLead(contactId)).rejects.toThrow("уже привязан");
  });
});

describe("declineWebsiteContact", () => {
  it("помечает контакт отклонённым, сделку не создаёт", async () => {
    const res = await contactsPost(req({ title: "Заявка", channelId, externalId: "session-abc" }));
    const { id: contactId } = await res.json();

    await declineWebsiteContact(contactId);

    const contact = await prisma.websiteContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.status).toBe("DECLINED");
    expect(contact.leadId).toBeNull();
  });
});
