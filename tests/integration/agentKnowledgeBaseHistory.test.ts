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

const { sendManagementMessage } = await import("@/lib/actions/agentKnowledgeBase");

let channelId: string;

beforeEach(async () => {
  await prisma.agentKbMessage.deleteMany();
  await prisma.agentKnowledgeBase.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый канал скаута", type: "SCOUT_TELEGRAM" },
  });
  channelId = channel.id;
});

// Регрессия: orderBy "asc" + take:40 брал 40 САМЫХ СТАРЫХ сообщений, а не
// последних — после 40-го сообщения модель переставала видеть весь
// недавний контекст. Проверяем, что в запрос к OpenAI попадают недавние
// сообщения, а не только первые 40.
describe("sendManagementMessage — окно истории", () => {
  it("отправляет модели последние сообщения, а не первые 40", async () => {
    for (let i = 0; i < 45; i++) {
      await prisma.agentKbMessage.create({
        data: { channelId, role: i % 2 === 0 ? "user" : "assistant", content: `сообщение-${i}` },
      });
    }

    let sentMessages: { role: string; content: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        sentMessages = body.messages;
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
      })
    );
    process.env.OPENAI_API_KEY = "test-key";

    await sendManagementMessage(channelId, "новое сообщение");

    const contents = sentMessages.map((m) => m.content);
    expect(contents).toContain("сообщение-44"); // самое недавнее — должно попасть в окно
    expect(contents).not.toContain("сообщение-0"); // самое старое — должно быть вытеснено

    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });
});

// Регрессия из прода: тройной клик по "Пройти опрос по продукту" (UI-гонка,
// починена в AgentManagementPanel через ref) породил три параллельных
// sendManagementMessage на канал без ещё существующей AgentKnowledgeBase —
// два параллельных upsert.create() на один channelId столкнулись конфликтом
// первичного ключа (P2002), необработанным исключением уронив рендер
// Server Component. Здесь бьём по этому же сценарию напрямую.
describe("sendManagementMessage — параллельная запись базы знаний на свежий канал", () => {
  it("два одновременных вызова, оба обновляющие KB, не падают", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const isFollowUp = body.messages.some((m: { role: string }) => m.role === "tool");

        if (!isFollowUp) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        function: {
                          name: "update_knowledge_base",
                          arguments: JSON.stringify({ content: "Продукт: CRM", change_summary: "старт" }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "Записал." } }] }), { status: 200 });
      })
    );
    process.env.OPENAI_API_KEY = "test-key";

    // На чистом канале строки AgentKnowledgeBase ещё нет — ровно условие гонки.
    const existing = await prisma.agentKnowledgeBase.findUnique({ where: { channelId } });
    expect(existing).toBeNull();

    const results = await Promise.allSettled([
      sendManagementMessage(channelId, "Давай начнём опрос", "interview"),
      sendManagementMessage(channelId, "Давай начнём опрос", "interview"),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const kb = await prisma.agentKnowledgeBase.findUnique({ where: { channelId } });
    expect(kb?.content).toBe("Продукт: CRM");

    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });
});
