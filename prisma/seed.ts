import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  DEFAULT_TASK_COLUMNS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SCOUT_AGENT_USER_ID,
  B2B_EMAIL_AGENT_USER_ID,
} from "../lib/constants";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@autogentgroup.ru";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Админ",
      email: adminEmail,
      passwordHash: await hash(adminPassword, 10),
      role: "ADMIN",
    },
  });

  console.log(`Admin ready: ${adminEmail} / ${adminPassword}`);

  // Сервисный аккаунт для лидов от скаут-агента: не логинится (isBlocked),
  // но editCrm нужен, т.к. роль EMPLOYEE проходит проверку прав на создание лида.
  await prisma.user.upsert({
    where: { id: SCOUT_AGENT_USER_ID },
    update: {},
    create: {
      id: SCOUT_AGENT_USER_ID,
      name: "Скаут-агент",
      email: "scout-agent@autogentgroup.ru",
      passwordHash: await hash(randomUUID(), 10),
      role: "EMPLOYEE",
      isBlocked: true,
      editCrm: true,
    },
  });

  // Сервисный аккаунт для лидов от B2B email-агента — та же логика, что у скаута:
  // рассылка полностью автоматическая, реального сотрудника-инициатора нет.
  await prisma.user.upsert({
    where: { id: B2B_EMAIL_AGENT_USER_ID },
    update: {},
    create: {
      id: B2B_EMAIL_AGENT_USER_ID,
      name: "B2B Email-агент",
      email: "b2b-email-agent@autogentgroup.ru",
      passwordHash: await hash(randomUUID(), 10),
      role: "EMPLOYEE",
      isBlocked: true,
      editCrm: true,
    },
  });

  // Скрыты из упрощённого списка «Каналы трафика» (архивированы по просьбе
  // пользователя) — сами каналы и вся история/автоматика по ним не тронуты,
  // страницы /channels/[id] продолжают работать как раньше.
  await prisma.trafficChannel.upsert({
    where: { id: "channel-scout-agent-marketai" },
    update: { type: "SCOUT_TELEGRAM", isActive: false },
    create: { id: "channel-scout-agent-marketai", name: "Скаут-агент", type: "SCOUT_TELEGRAM", isActive: false },
  });

  await prisma.trafficChannel.upsert({
    where: { id: "channel-instagram-marketai" },
    update: { type: "INSTAGRAM", isActive: false },
    create: { id: "channel-instagram-marketai", name: "Instagram — холодная база", type: "INSTAGRAM", isActive: false },
  });

  await prisma.trafficChannel.upsert({
    where: { id: "channel-b2b-email-marketai" },
    update: { type: "B2B_EMAIL", isActive: false },
    create: { id: "channel-b2b-email-marketai", name: "B2B email-рассылки", type: "B2B_EMAIL", isActive: false },
  });

  await prisma.trafficChannel.upsert({
    where: { id: "channel-tg-autocomment" },
    update: { type: "TG_AUTOCOMMENT" },
    create: { id: "channel-tg-autocomment", name: "Автокомментинг в Telegram", type: "TG_AUTOCOMMENT" },
  });

  // Упрощённый список «Каналы трафика» — просто именованные бакеты без
  // отдельного агента/автоматики за ними (пока), порядок сверху вниз задан
  // полем order. Переход на детальную страницу каждого канала — отдельная
  // задача на будущее.
  const SIMPLE_TRAFFIC_CHANNELS = [
    { id: "channel-reels", name: "Рилс" },
    { id: "channel-youtube", name: "Ютуб" },
    { id: "channel-hh-mailings", name: "Рассылки по hh" },
    { id: "channel-email-mailings", name: "Рассылки по email" },
    { id: "channel-instagram-mailings", name: "Рассылки по инсте" },
    { id: "channel-events", name: "Мероприятия" },
    { id: "channel-chat-scout", name: "Скаут в чатах" },
    { id: "channel-partnerships", name: "Партнёрство" },
    { id: "channel-word-of-mouth", name: "Сарафан" },
    { id: "channel-sales-dept", name: "Отдел продаж" },
  ];
  for (let i = 0; i < SIMPLE_TRAFFIC_CHANNELS.length; i++) {
    const { id, name } = SIMPLE_TRAFFIC_CHANNELS[i];
    await prisma.trafficChannel.upsert({
      where: { id },
      update: { name, order: i },
      create: { id, name, type: "MANUAL", order: i },
    });
  }

  for (const cat of INCOME_CATEGORIES) {
    await prisma.transactionCategory.upsert({
      where: { id: `income-${cat.name}` },
      update: {},
      create: { id: `income-${cat.name}`, name: cat.name, type: "INCOME", isRecurring: cat.isRecurring },
    });
  }
  for (const cat of EXPENSE_CATEGORIES) {
    await prisma.transactionCategory.upsert({
      where: { id: `expense-${cat.name}` },
      update: {},
      create: { id: `expense-${cat.name}`, name: cat.name, type: "EXPENSE", isRecurring: cat.isRecurring },
    });
  }

  const board = await prisma.taskBoard.upsert({
    where: { id: "board-zadachi" },
    update: {},
    create: { id: "board-zadachi", name: "ЗАДАЧИ" },
  });

  for (let i = 0; i < DEFAULT_TASK_COLUMNS.length; i++) {
    await prisma.taskColumn.upsert({
      where: { id: `col-${i}` },
      update: { name: DEFAULT_TASK_COLUMNS[i] },
      create: { id: `col-${i}`, boardId: board.id, name: DEFAULT_TASK_COLUMNS[i], order: i },
    });
  }

  await prisma.project.upsert({
    where: { id: "project-general" },
    update: {},
    create: { id: "project-general", name: "Общий", order: 0 },
  });

  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
