import { prisma } from "@/lib/prisma";
import { DONE_COLUMN_NAME, TASK_PRIORITY_LABEL } from "@/lib/constants";
import { sendTelegramMessage } from "@/lib/telegram/send";

const TIMEZONE = "Europe/Moscow";
const TICK_MS = 60_000;

function nowInMoscow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let lastDeadlineCheckAt = 0;

export function startBotCron() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  setInterval(() => {
    tick().catch((err) => console.error("telegramCron tick failed", err));
  }, TICK_MS);
}

async function tick() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings) return;

  const { date, time } = nowInMoscow();

  if (time === settings.morningSummaryTime) {
    await sendMorningReminders(date);
  }
  if (time === settings.eveningSummaryTime) {
    await sendEveningSummaries(date);
  }

  const intervalMs = settings.deadlineCheckInterval * 60_000;
  if (Date.now() - lastDeadlineCheckAt >= intervalMs) {
    lastDeadlineCheckAt = Date.now();
    await sendDeadlineWarnings();
  }
}

async function sendMorningReminders(today: string) {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, telegramMorningSentDate: { not: today } },
    select: { id: true, telegramChatId: true },
  });
  if (!users.length) return;

  for (const user of users) {
    const tasks = await prisma.task.findMany({
      where: { assigneeId: user.id, archived: false, column: { name: { not: DONE_COLUMN_NAME } } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: 15,
    });

    const lines = tasks.map((t) => {
      const due = t.dueDate ? ` — до ${t.dueDate.toLocaleDateString("ru-RU")}` : "";
      return `• ${escapeHtml(t.title)} [${TASK_PRIORITY_LABEL[t.priority]}]${due}`;
    });

    const text = tasks.length
      ? `☀️ <b>Доброе утро!</b> Задачи на сегодня:\n\n${lines.join("\n")}`
      : `☀️ <b>Доброе утро!</b> Открытых задач нет.`;

    await sendTelegramMessage(user.telegramChatId!, text);
    await prisma.user.update({ where: { id: user.id }, data: { telegramMorningSentDate: today } });
  }
}

async function sendEveningSummaries(today: string) {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, telegramEveningSentDate: { not: today } },
    select: { id: true, telegramChatId: true },
  });
  if (!users.length) return;

  const startOfDay = new Date(`${today}T00:00:00`);

  for (const user of users) {
    const [completedToday, openTasks] = await Promise.all([
      prisma.taskCompletion.findMany({
        where: { userId: user.id, completedAt: { gte: startOfDay } },
        select: { taskTitle: true },
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, archived: false, column: { name: { not: DONE_COLUMN_NAME } } },
        select: { title: true, dueDate: true },
      }),
    ]);

    const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < new Date());

    const parts = [`🌙 <b>Итоги дня</b>`];
    parts.push(
      completedToday.length
        ? `\n✅ Выполнено сегодня (${completedToday.length}):\n${completedToday.map((t) => `• ${escapeHtml(t.taskTitle)}`).join("\n")}`
        : `\n✅ Сегодня ничего не отмечено выполненным.`
    );
    parts.push(`\n📋 Осталось открытых задач: ${openTasks.length}`);
    if (overdue.length) {
      parts.push(`\n🔥 Просрочено: ${overdue.length}\n${overdue.map((t) => `• ${escapeHtml(t.title)}`).join("\n")}`);
    }

    await sendTelegramMessage(user.telegramChatId!, parts.join(""));
    await prisma.user.update({ where: { id: user.id }, data: { telegramEveningSentDate: today } });
  }
}

async function sendDeadlineWarnings() {
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tasks = await prisma.task.findMany({
    where: {
      archived: false,
      deadlineReminderSentAt: null,
      dueDate: { not: null, lte: in24h, gte: new Date() },
      column: { name: { not: DONE_COLUMN_NAME } },
      assignee: { telegramChatId: { not: null } },
    },
    include: { assignee: true },
  });

  for (const task of tasks) {
    if (!task.assignee?.telegramChatId) continue;
    const due = task.dueDate ? task.dueDate.toLocaleString("ru-RU") : "";
    await sendTelegramMessage(
      task.assignee.telegramChatId,
      `🔥 <b>Горит дедлайн!</b>\n«${escapeHtml(task.title)}» — срок до ${due} (${TASK_PRIORITY_LABEL[task.priority]})`
    );
    await prisma.task.update({ where: { id: task.id }, data: { deadlineReminderSentAt: new Date() } });
  }
}
