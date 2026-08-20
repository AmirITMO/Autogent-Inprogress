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

const sentMails: unknown[] = [];
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail: unknown) => {
        sentMails.push(mail);
        return { messageId: "test" };
      },
    }),
  },
}));

const { approveAndSendB2bEmail, declineB2bEmail, requestB2bEmailSearch } = await import(
  "@/lib/actions/b2bEmailSend"
);

let channelId: string;

beforeEach(async () => {
  sentMails.length = 0;
  await prisma.b2bEmailSearchJob.deleteMany();
  await prisma.b2bEmailContact.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый email-канал", type: "B2B_EMAIL" },
  });
  channelId = channel.id;

  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "bot@example.com";
  process.env.SMTP_PASSWORD = "secret";
});

describe("approveAndSendB2bEmail", () => {
  it("отправляет письмо и переводит контакт в SENT", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: {
        channelId,
        externalId: "romashka.ru",
        companyName: "ООО Ромашка",
        contactEmail: "info@romashka.ru",
        draftMessage: "Добрый день!",
        status: "FOUND",
      },
    });

    const result = await approveAndSendB2bEmail(contact.id);

    expect(result.ok).toBe(true);
    expect(sentMails).toHaveLength(1);
    expect((sentMails[0] as { to: string }).to).toBe("info@romashka.ru");

    const updated = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.sentAt).not.toBeNull();
    expect(updated.sentById).toBe(testUser.id);
  });

  it("использует отредактированный текст вместо исходного черновика", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: {
        channelId,
        externalId: "romashka.ru",
        contactEmail: "info@romashka.ru",
        draftMessage: "Черновик от агента",
        status: "FOUND",
      },
    });

    await approveAndSendB2bEmail(contact.id, "Отредактированный сотрудником текст");

    expect((sentMails[0] as { text: string }).text).toBe("Отредактированный сотрудником текст");
    const updated = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.draftMessage).toBe("Отредактированный сотрудником текст");
  });

  it("не отправляет повторно уже отправленное письмо", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: { channelId, externalId: "c1", contactEmail: "a@b.com", draftMessage: "текст", status: "SENT" },
    });

    const result = await approveAndSendB2bEmail(contact.id);

    expect(result.ok).toBe(false);
    expect(sentMails).toHaveLength(0);
  });

  it("отказывает, если у контакта нет email", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: { channelId, externalId: "c1", draftMessage: "текст", status: "FOUND" },
    });

    const result = await approveAndSendB2bEmail(contact.id);

    expect(result.ok).toBe(false);
    expect(sentMails).toHaveLength(0);
  });

  // Регрессия по образцу "Пройти опрос по продукту" (тройной клик уронил
  // прод) — двойной клик "Одобрить и отправить" на одном контакте не должен
  // отправить письмо дважды. Проверяем сам сценарий гонки напрямую.
  it("два одновременных вызова на один контакт отправляют письмо только один раз", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: {
        channelId,
        externalId: "romashka.ru",
        contactEmail: "info@romashka.ru",
        draftMessage: "Добрый день!",
        status: "FOUND",
      },
    });

    const results = await Promise.all([
      approveAndSendB2bEmail(contact.id),
      approveAndSendB2bEmail(contact.id),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(sentMails).toHaveLength(1);

    const updated = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.status).toBe("SENT");
  });

  it("откатывает статус в FOUND, если реальная отправка упала после захвата claim'а", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: {
        channelId,
        externalId: "romashka.ru",
        contactEmail: "info@romashka.ru",
        draftMessage: "Добрый день!",
        status: "FOUND",
      },
    });
    delete process.env.SMTP_HOST; // getTransport() бросит "SMTP не настроен"

    const result = await approveAndSendB2bEmail(contact.id);

    expect(result.ok).toBe(false);
    const updated = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.status).toBe("FOUND");
  });

  // Регрессия по образцу sendManagementMessage/sendSearchSetupMessage — action
  // никогда не бросает наружу, даже если SMTP не настроен на сервере.
  it("не бросает исключение, если SMTP не настроен — возвращает ok:false", async () => {
    delete process.env.SMTP_HOST;
    const contact = await prisma.b2bEmailContact.create({
      data: { channelId, externalId: "c1", contactEmail: "a@b.com", draftMessage: "текст", status: "FOUND" },
    });

    const result = await approveAndSendB2bEmail(contact.id);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("declineB2bEmail", () => {
  it("переводит контакт в DECLINED", async () => {
    const contact = await prisma.b2bEmailContact.create({
      data: { channelId, externalId: "c1", draftMessage: "текст", status: "FOUND" },
    });

    const result = await declineB2bEmail(contact.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updated.status).toBe("DECLINED");
  });
});

describe("requestB2bEmailSearch", () => {
  it("создаёт задание с указанным количеством", async () => {
    const result = await requestB2bEmailSearch(channelId, 20);
    expect(result.jobId).toBeTruthy();
    const job = await prisma.b2bEmailSearchJob.findUniqueOrThrow({ where: { id: result.jobId } });
    expect(job.requestedCount).toBe(20);
    expect(job.status).toBe("PENDING");
  });

  it("отклоняет количество больше 49", async () => {
    const result = await requestB2bEmailSearch(channelId, 100);
    expect(result.jobId).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});
