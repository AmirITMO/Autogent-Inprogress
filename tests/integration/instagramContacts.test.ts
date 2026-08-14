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

const { convertInstagramContactToLead, markInstagramContactStatus } = await import(
  "@/lib/actions/instagramContacts"
);

let channelId: string;
let contactId: string;

beforeEach(async () => {
  await prisma.instagramContact.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.trafficChannel.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Сотрудник", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "EMPLOYEE" },
  });
  testUser.id = user.id;
  testUser.role = "EMPLOYEE";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Instagram-канал", type: "INSTAGRAM" },
  });
  channelId = channel.id;

  const contact = await prisma.instagramContact.create({
    data: {
      channelId,
      externalId: "ig-1",
      username: "furniture_spb",
      fullName: "Мебель СПб",
    },
  });
  contactId = contact.id;
});

describe("convertInstagramContactToLead", () => {
  it("создаёт лид с owner = реальный сотрудник (не сервисный аккаунт)", async () => {
    const lead = await convertInstagramContactToLead(contactId);
    expect(lead.ownerId).toBe(testUser.id);
    expect(lead.channelId).toBe(channelId);
    expect(lead.contact).toBe("@furniture_spb");
  });

  it("по умолчанию создаёт лид на этапе SCHEDULED_CALL", async () => {
    const lead = await convertInstagramContactToLead(contactId);
    expect(lead.stage).toBe("SCHEDULED_CALL");
  });

  it("создаёт лид сразу на указанном этапе", async () => {
    const lead = await convertInstagramContactToLead(contactId, "CALL_DONE");
    expect(lead.stage).toBe("CALL_DONE");
  });

  it("линкует контакт с лидом и проставляет LEAD_CREATED", async () => {
    const lead = await convertInstagramContactToLead(contactId);
    const contact = await prisma.instagramContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.leadId).toBe(lead.id);
    expect(contact.status).toBe("LEAD_CREATED");
  });

  it("бросает ошибку при повторном вызове на уже привязанном контакте (защита от двойного клика)", async () => {
    await convertInstagramContactToLead(contactId);
    await expect(convertInstagramContactToLead(contactId)).rejects.toThrow();

    // и не создаёт вторую сделку при этом
    const leads = await prisma.lead.count({ where: { channelId } });
    expect(leads).toBe(1);
  });

  it("бросает ошибку для несуществующего контакта", async () => {
    await expect(convertInstagramContactToLead("does-not-exist")).rejects.toThrow();
  });
});

describe("markInstagramContactStatus", () => {
  it("обновляет статус на CONTACTED", async () => {
    await markInstagramContactStatus(contactId, "CONTACTED");
    const contact = await prisma.instagramContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.status).toBe("CONTACTED");
  });

  it("обновляет статус на DECLINED", async () => {
    await markInstagramContactStatus(contactId, "DECLINED");
    const contact = await prisma.instagramContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.status).toBe("DECLINED");
  });
});
