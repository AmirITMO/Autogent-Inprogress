import { prisma } from "@/lib/prisma";
import type { ReminderThreshold } from "@prisma/client";
import { DONE_COLUMN_NAME, IN_PROGRESS_COLUMN_NAME, PAUSED_COLUMN_NAME } from "@/lib/constants";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { escapeHtml, taskLink } from "@/lib/telegram/format";

const DUE_TODAY_DIGEST_TIME = "09:00";

const EVENT_REMINDER_THRESHOLDS: { key: ReminderThreshold; ms: number; hours: number }[] = [
  { key: "H48", ms: 48 * 60 * 60 * 1000, hours: 48 },
  { key: "H24", ms: 24 * 60 * 60 * 1000, hours: 24 },
  { key: "H6", ms: 6 * 60 * 60 * 1000, hours: 6 },
  { key: "H1", ms: 1 * 60 * 60 * 1000, hours: 1 },
];

const TASK_DEADLINE_THRESHOLDS = EVENT_REMINDER_THRESHOLDS.filter((t) => t.key === "H48" || t.key === "H24");

function pluralHours(hours: number) {
  const mod100 = hours % 100;
  const mod10 = hours % 10;
  if (mod100 >= 11 && mod100 <= 14) return "часов";
  if (mod10 === 1) return "час";
  if (mod10 >= 2 && mod10 <= 4) return "часа";
  return "часов";
}

function isUniqueConflict(err: unknown) {
  return (err as { code?: string } | null)?.code === "P2002";
}

const SOON_DUE_MS = 2 * 24 * 60 * 60 * 1000; // "горящие" в утреннем отчёте — дедлайн в ближайшие 2 дня

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

function formatMoscowTime(d: Date) {
  return d.toLocaleTimeString("ru-RU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

export function startBotCron() {
  if (!process.env.BOT_PUSH_URL) return;
  setInterval(() => {
    tick().catch((err) => console.error("telegramCron tick failed", err));
  }, TICK_MS);
}

async function tick() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings) return;

  const { date, time } = nowInMoscow();

  if (time === settings.morningSummaryTime) {
    await sendMorningReports(date);
  }
  if (time === settings.eveningSummaryTime) {
    await sendEveningSummary(date);
  }
  if (time === DUE_TODAY_DIGEST_TIME) {
    await sendDueTodayDigest(date);
  }

  await sendEventReminders();
  await sendTaskDeadlineReminders();
}

// Утренний отчёт — два отдельных сообщения на каждого привязанного сотрудника:
// 1) личный статус (сделано / в работе / сложности), 2) общий срез по всей команде.
async function sendMorningReports(today: string) {
  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ telegramMorningSentDate: null }, { telegramMorningSentDate: { not: today } }],
    },
    select: { id: true, name: true, telegramChatId: true },
  });
  if (!users.length) return;

  const yesterdayStart = new Date(`${today}T00:00:00`);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const soonDue = new Date(Date.now() + SOON_DUE_MS);

  const teamText = await buildTeamPlanText();

  for (const user of users) {
    const [doneYesterday, inProgress, paused, urgentDue] = await Promise.all([
      prisma.taskCompletion.findMany({
        where: { userId: user.id, completedAt: { gte: yesterdayStart } },
        select: { taskId: true, taskTitle: true },
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, archived: false, column: { name: IN_PROGRESS_COLUMN_NAME } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, archived: false, column: { name: PAUSED_COLUMN_NAME } },
      }),
      prisma.task.findMany({
        where: {
          assigneeId: user.id,
          archived: false,
          column: { name: { notIn: [DONE_COLUMN_NAME, PAUSED_COLUMN_NAME] } },
          dueDate: { not: null, lte: soonDue },
        },
      }),
    ]);

    const personal = [
      `☀️ <b>Доброе утро, ${escapeHtml(user.name)}!</b>`,
      "",
      "<b>1) Что сделал(а) за вчера</b>",
      doneYesterday.length
        ? doneYesterday.map((t) => `• ${t.taskId ? taskLink(t.taskId, t.taskTitle) : escapeHtml(t.taskTitle)}`).join("\n")
        : "— пусто —",
      "",
      "<b>2) Сейчас в работе</b>",
      inProgress.length ? inProgress.map((t) => `• ${taskLink(t.id, t.title)}`).join("\n") : "— пусто —",
      "",
      "<b>3) Сложности / горящее</b>",
      formatUrgentSection(paused, urgentDue),
    ].join("\n");

    await sendTelegramMessage(user.telegramChatId!, personal);
    if (teamText) await sendTelegramMessage(user.telegramChatId!, teamText);
    await prisma.user.update({ where: { id: user.id }, data: { telegramMorningSentDate: today } });
  }
}

function formatUrgentSection(
  paused: { id: string; title: string }[],
  urgentDue: { id: string; title: string; dueDate: Date | null }[]
) {
  const lines: string[] = [];
  if (paused.length) {
    lines.push(`⏸ На паузе:`, ...paused.map((t) => `• ${taskLink(t.id, t.title)}`));
  }
  if (urgentDue.length) {
    if (lines.length) lines.push("");
    lines.push(
      `🔥 Горящие дедлайны:`,
      ...urgentDue.map((t) => {
        const due = t.dueDate ? ` — до ${t.dueDate.toLocaleDateString("ru-RU")}` : "";
        return `• ${taskLink(t.id, t.title)}${due}`;
      })
    );
  }
  return lines.length ? lines.join("\n") : "— всё спокойно —";
}

const TEAM_PLAN_MAX_MEMBERS = 15;
const TEAM_PLAN_MAX_TASKS_PER_MEMBER = 3;

async function buildTeamPlanText(): Promise<string | null> {
  const members = await prisma.user.findMany({
    where: { isBlocked: false, tasks: { some: { archived: false, column: { name: { not: DONE_COLUMN_NAME } } } } },
    select: {
      name: true,
      tasks: {
        where: { archived: false, column: { name: { not: DONE_COLUMN_NAME } } },
        orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
        select: { id: true, title: true },
      },
    },
    take: TEAM_PLAN_MAX_MEMBERS,
  });
  if (!members.length) return null;

  const lines = members.map((m) => {
    const shown = m.tasks.slice(0, TEAM_PLAN_MAX_TASKS_PER_MEMBER);
    const rest = m.tasks.length - shown.length;
    const taskLines = shown.map((t) => `   • ${taskLink(t.id, t.title)}`).join("\n");
    const more = rest > 0 ? `\n   …и ещё ${rest}` : "";
    return `<b>${escapeHtml(m.name)}</b> — ${m.tasks.length} активных\n${taskLines}${more}`;
  });

  return `👥 <b>Команда сегодня</b>\n\n${lines.join("\n\n")}`;
}

// Вечерняя сводка — одно общее сообщение для всей команды (не персональное):
// что выполнено сегодня и что осталось открытым.
async function sendEveningSummary(today: string) {
  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ telegramEveningSentDate: null }, { telegramEveningSentDate: { not: today } }],
    },
    select: { id: true, telegramChatId: true },
  });
  if (!users.length) return;

  const startOfDay = new Date(`${today}T00:00:00`);

  const [completedToday, openTasks] = await Promise.all([
    prisma.taskCompletion.findMany({
      where: { completedAt: { gte: startOfDay } },
      select: { taskId: true, taskTitle: true, user: { select: { name: true } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.task.findMany({
      where: { archived: false, column: { name: { not: DONE_COLUMN_NAME } } },
      select: { id: true, title: true, dueDate: true, assignee: { select: { name: true } } },
    }),
  ]);

  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < new Date());

  const parts = [`🌙 <b>Итоги дня — вся команда</b>`, ""];
  parts.push(
    `<b>✅ Выполнено сегодня (${completedToday.length})</b>`,
    completedToday.length
      ? completedToday
          .map((t) => {
            const who = t.user?.name ? ` — ${escapeHtml(t.user.name)}` : "";
            return `• ${t.taskId ? taskLink(t.taskId, t.taskTitle) : escapeHtml(t.taskTitle)}${who}`;
          })
          .join("\n")
      : "— пусто —",
    "",
    `<b>📋 Осталось открытых задач: ${openTasks.length}</b>`
  );
  if (overdue.length) {
    parts.push(
      "",
      `<b>🔥 Просрочено (${overdue.length})</b>`,
      overdue
        .map((t) => {
          const who = t.assignee?.name ? ` — ${escapeHtml(t.assignee.name)}` : "";
          return `• ${taskLink(t.id, t.title)}${who}`;
        })
        .join("\n")
    );
  }

  const text = parts.join("\n");
  for (const user of users) {
    await sendTelegramMessage(user.telegramChatId!, text);
    await prisma.user.update({ where: { id: user.id }, data: { telegramEveningSentDate: today } });
  }
}

// Напоминания о созвонах всем участникам — за 48/24/6/1 час до начала,
// дедуп через EventReminderLog (по одной записи на событие+порог).
async function sendEventReminders() {
  const now = Date.now();
  const events = await prisma.calendarEvent.findMany({
    where: { startAt: { gt: new Date() } },
    include: { attendees: true, reminderLogs: true },
  });

  for (const event of events) {
    for (const threshold of EVENT_REMINDER_THRESHOLDS) {
      if (now < event.startAt.getTime() - threshold.ms) continue;
      if (event.reminderLogs.some((l) => l.threshold === threshold.key)) continue;

      const text = `⏰ Через ${threshold.hours} ${pluralHours(threshold.hours)} созвон: «${escapeHtml(event.title)}» в ${formatMoscowTime(event.startAt)}`;
      for (const attendee of event.attendees) {
        if (attendee.telegramChatId) await sendTelegramMessage(attendee.telegramChatId, text);
      }

      try {
        await prisma.eventReminderLog.create({ data: { eventId: event.id, threshold: threshold.key } });
      } catch (err) {
        if (!isUniqueConflict(err)) throw err;
      }
    }
  }
}

// Напоминания о дедлайне задачи лично исполнителю — за 48/24 часа,
// дедуп через TaskDeadlineReminderLog (заменяет старую sendDeadlineWarnings()).
async function sendTaskDeadlineReminders() {
  const now = Date.now();
  const tasks = await prisma.task.findMany({
    where: {
      archived: false,
      dueDate: { not: null, gt: new Date() },
      column: { name: { not: DONE_COLUMN_NAME } },
      assignee: { telegramChatId: { not: null } },
    },
    include: { assignee: true, deadlineReminderLogs: true },
  });

  for (const task of tasks) {
    if (!task.dueDate || !task.assignee?.telegramChatId) continue;
    for (const threshold of TASK_DEADLINE_THRESHOLDS) {
      if (now < task.dueDate.getTime() - threshold.ms) continue;
      if (task.deadlineReminderLogs.some((l) => l.threshold === threshold.key)) continue;

      const text = `🔔 Через ${threshold.hours} ${pluralHours(threshold.hours)} дедлайн: «${taskLink(task.id, task.title)}»`;
      await sendTelegramMessage(task.assignee.telegramChatId, text);

      try {
        await prisma.taskDeadlineReminderLog.create({ data: { taskId: task.id, threshold: threshold.key } });
      } catch (err) {
        if (!isUniqueConflict(err)) throw err;
      }
    }
  }
}

// Ежедневный дайджест в 09:00 МСК — отдельный продуктовый пункт, время
// зафиксировано и не связано с settings.morningSummaryTime. Дедуп по дате,
// как у telegramMorningSentDate.
async function sendDueTodayDigest(today: string) {
  const startOfDay = new Date(`${today}T00:00:00+03:00`);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      OR: [{ telegramDueTodaySentDate: null }, { telegramDueTodaySentDate: { not: today } }],
      tasks: {
        some: { archived: false, dueDate: { gte: startOfDay, lt: endOfDay }, column: { name: { not: DONE_COLUMN_NAME } } },
      },
    },
    select: {
      id: true,
      telegramChatId: true,
      tasks: {
        where: { archived: false, dueDate: { gte: startOfDay, lt: endOfDay }, column: { name: { not: DONE_COLUMN_NAME } } },
        select: { id: true, title: true },
      },
    },
  });

  for (const user of users) {
    if (!user.telegramChatId || !user.tasks.length) continue;
    const text = [
      "📌 Сегодня дедлайн — проверь/сдай/актуализируй:",
      ...user.tasks.map((t) => `• ${taskLink(t.id, t.title)}`),
    ].join("\n");
    await sendTelegramMessage(user.telegramChatId, text);
    await prisma.user.update({ where: { id: user.id }, data: { telegramDueTodaySentDate: today } });
  }
}
