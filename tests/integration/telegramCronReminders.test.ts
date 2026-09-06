import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { toMoscowParts } from "@/lib/moscowTime";
import { updateTaskCore } from "@/lib/actions/tasksCore";

const sendTelegramMessage = vi.fn(async (_chatId: bigint | string, _text: string) => {});
vi.mock("@/lib/telegram/send", () => ({
  sendTelegramMessage: (chatId: bigint | string, text: string) => sendTelegramMessage(chatId, text),
}));

// tasksCore импортирует getPermissions/assertCanEditTask из lib/roles, а тот
// модуль тянет next-auth (next/server) — под vitest (не Next.js runtime) это
// не резолвится. Мокаем как в tests/integration/tasks.test.ts.
vi.mock("@/lib/roles", () => ({
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
    viewSupport: true,
  }),
  assertCanEditTask: async () => {},
}));

const { sendEventReminders, sendTaskDeadlineReminders, sendDueTodayDigest } = await import(
  "@/lib/cron/telegramCron"
);

let columnId: string;
let doneColumnId: string;
let userA: { id: string; telegramChatId: bigint };
let userB: { id: string; telegramChatId: bigint };

beforeEach(async () => {
  sendTelegramMessage.mockClear();
  await prisma.eventReminderLog.deleteMany();
  await prisma.taskDeadlineReminderLog.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskColumn.deleteMany();
  await prisma.taskBoard.deleteMany();
  await prisma.user.deleteMany();

  const board = await prisma.taskBoard.create({ data: { name: "ЗАДАЧИ" } });
  const col = await prisma.taskColumn.create({ data: { boardId: board.id, name: "В работе", order: 0 } });
  const doneCol = await prisma.taskColumn.create({ data: { boardId: board.id, name: "Выполнено", order: 1 } });
  columnId = col.id;
  doneColumnId = doneCol.id;

  const a = await prisma.user.create({
    data: { name: "Исполнитель", email: `a-${Date.now()}@test.local`, passwordHash: "x", telegramChatId: BigInt(111) },
  });
  const b = await prisma.user.create({
    data: { name: "Коллега", email: `b-${Date.now()}@test.local`, passwordHash: "x", telegramChatId: BigInt(222) },
  });
  userA = { id: a.id, telegramChatId: BigInt(111) };
  userB = { id: b.id, telegramChatId: BigInt(222) };
});

describe("sendEventReminders", () => {
  it("sends a 48h reminder to all attendees once the threshold is crossed and logs it", async () => {
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000 - 60_000);
    const event = await prisma.calendarEvent.create({
      data: {
        title: "Синк по спринту",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        createdById: userA.id,
        attendees: { connect: [{ id: userA.id }, { id: userB.id }] },
      },
    });

    await sendEventReminders();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
    const texts = sendTelegramMessage.mock.calls.map((c) => c[1] as string);
    expect(texts.every((t) => t.includes("Через 48 часов созвон"))).toBe(true);

    const logs = await prisma.eventReminderLog.findMany({ where: { eventId: event.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].threshold).toBe("H48");
  });

  it("does not duplicate a reminder on a second run — simulates a container restart re-running the same tick", async () => {
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000 - 60_000);
    await prisma.calendarEvent.create({
      data: {
        title: "Синк",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        createdById: userA.id,
        attendees: { connect: [{ id: userA.id }] },
      },
    });

    await sendEventReminders();
    sendTelegramMessage.mockClear();
    await sendEventReminders();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("fires every threshold already crossed by the current moment (48h and 24h at once)", async () => {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    const event = await prisma.calendarEvent.create({
      data: {
        title: "Синк",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        createdById: userA.id,
        attendees: { connect: [{ id: userA.id }] },
      },
    });

    await sendEventReminders();

    const logs = await prisma.eventReminderLog.findMany({ where: { eventId: event.id } });
    expect(logs.map((l) => l.threshold).sort()).toEqual(["H24", "H48"]);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
  });
});

describe("sendTaskDeadlineReminders", () => {
  it("notifies only the assignee personally, not the whole team", async () => {
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    await prisma.task.create({
      data: { columnId, title: "Сдать отчёт", assigneeId: userA.id, dueDate, archived: false },
    });

    await sendTaskDeadlineReminders();

    // Дедлайн уже ближе 24ч, значит оба порога (48ч и 24ч) считаются
    // одновременно пройденными и уходят вместе одним прогоном.
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
    for (const call of sendTelegramMessage.mock.calls) {
      expect(call[0]).toBe(userA.telegramChatId);
    }
    const texts = sendTelegramMessage.mock.calls.map((c) => c[1] as string);
    expect(texts.some((t) => t.includes("Через 48 часов дедлайн"))).toBe(true);
    expect(texts.some((t) => t.includes("Через 24 часа дедлайн"))).toBe(true);
  });

  it("does not duplicate on repeated runs", async () => {
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    await prisma.task.create({
      data: { columnId, title: "Сдать отчёт", assigneeId: userA.id, dueDate, archived: false },
    });

    await sendTaskDeadlineReminders();
    sendTelegramMessage.mockClear();
    await sendTaskDeadlineReminders();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("skips tasks already in the done column", async () => {
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    await prisma.task.create({
      data: { columnId: doneColumnId, title: "Уже сдано", assigneeId: userA.id, dueDate, archived: false },
    });

    await sendTaskDeadlineReminders();

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("resets already-sent threshold logs on reassignment, so the new assignee gets reminded too", async () => {
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    const task = await prisma.task.create({
      data: { columnId, title: "Сдать отчёт", assigneeId: userA.id, dueDate, archived: false },
    });
    await sendTaskDeadlineReminders();
    expect(sendTelegramMessage).toHaveBeenCalledTimes(2); // оба порога (48ч и 24ч) сразу
    expect(await prisma.taskDeadlineReminderLog.count({ where: { taskId: task.id } })).toBe(2);

    await updateTaskCore({ id: "test-admin", role: "ADMIN" }, task.id, { assigneeId: userB.id });

    expect(await prisma.taskDeadlineReminderLog.count({ where: { taskId: task.id } })).toBe(0);

    sendTelegramMessage.mockClear();
    await sendTaskDeadlineReminders();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
    for (const call of sendTelegramMessage.mock.calls) {
      expect(call[0]).toBe(userB.telegramChatId);
    }
  });

  it("does not touch threshold logs when the task is updated without changing the assignee", async () => {
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000 - 60_000);
    const task = await prisma.task.create({
      data: { columnId, title: "Сдать отчёт", assigneeId: userA.id, dueDate, archived: false },
    });
    await sendTaskDeadlineReminders();
    expect(await prisma.taskDeadlineReminderLog.count({ where: { taskId: task.id } })).toBe(2);

    await updateTaskCore({ id: "test-admin", role: "ADMIN" }, task.id, { title: "Сдать отчёт (правки)" });

    expect(await prisma.taskDeadlineReminderLog.count({ where: { taskId: task.id } })).toBe(2);
  });
});

describe("sendDueTodayDigest", () => {
  it("sends a personal digest with only today's (MSK) due tasks in a not-done column", async () => {
    const today = toMoscowParts(new Date()).dateKey;
    const startOfDay = new Date(`${today}T00:00:00+03:00`);
    const dueToday = new Date(startOfDay.getTime() + 10 * 60 * 60 * 1000);
    const dueTomorrow = new Date(startOfDay.getTime() + 30 * 60 * 60 * 1000);

    await prisma.task.create({
      data: { columnId, title: "Сегодняшний дедлайн", assigneeId: userA.id, dueDate: dueToday, archived: false },
    });
    await prisma.task.create({
      data: { columnId, title: "Завтрашний дедлайн", assigneeId: userA.id, dueDate: dueTomorrow, archived: false },
    });
    await prisma.task.create({
      data: { columnId: doneColumnId, title: "Сегодня, но выполнено", assigneeId: userA.id, dueDate: dueToday, archived: false },
    });
    await prisma.task.create({
      data: { columnId, title: "Чужой сегодняшний дедлайн", assigneeId: userB.id, dueDate: dueToday, archived: false },
    });

    await sendDueTodayDigest(today);

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2); // по одному личному сообщению каждому
    const callToA = sendTelegramMessage.mock.calls.find((c) => c[0] === userA.telegramChatId)!;
    expect(callToA[1]).toContain("Сегодняшний дедлайн");
    expect(callToA[1]).not.toContain("Завтрашний дедлайн");
    expect(callToA[1]).not.toContain("Сегодня, но выполнено");

    const userAFresh = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(userAFresh.telegramDueTodaySentDate).toBe(today);
  });

  it("does not resend the same day's digest twice", async () => {
    const today = toMoscowParts(new Date()).dateKey;
    const startOfDay = new Date(`${today}T00:00:00+03:00`);
    await prisma.task.create({
      data: {
        columnId,
        title: "Сегодняшний дедлайн",
        assigneeId: userA.id,
        dueDate: new Date(startOfDay.getTime() + 10 * 60 * 60 * 1000),
        archived: false,
      },
    });

    await sendDueTodayDigest(today);
    sendTelegramMessage.mockClear();
    await sendDueTodayDigest(today);

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
