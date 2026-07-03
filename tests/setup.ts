import { beforeAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("autogent_test")) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL does not point at the autogent_test database."
    );
  }

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TaskNode", "TaskComment", "Task", "TaskColumn", "TaskBoard",
      "LeadActivity", "Transaction", "TransactionCategory", "Lead",
      "ProjectMember", "Project", "User", "Settings"
    RESTART IDENTITY CASCADE;
  `);
});
