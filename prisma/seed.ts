import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { DEFAULT_TASK_COLUMNS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants";

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
