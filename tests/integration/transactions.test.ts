import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
  requireAdmin: async () => {
    if (testUser.role !== "ADMIN") throw new Error("Forbidden");
    return testUser;
  },
}));

const { createExpense } = await import("@/lib/actions/transactions");

let expenseCategoryId: string;

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Test Admin", email: `admin-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const category = await prisma.transactionCategory.create({
    data: { name: "Реклама", type: "EXPENSE", isRecurring: false },
  });
  expenseCategoryId = category.id;
});

describe("createExpense", () => {
  it("creates an EXPENSE transaction attributed to the current admin", async () => {
    await createExpense({ categoryId: expenseCategoryId, amount: 5000, description: "Таргет ВК" });

    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("EXPENSE");
    expect(Number(transactions[0].amount)).toBe(5000);
    expect(transactions[0].createdById).toBe(testUser.id);
  });

  it("defaults the date to now when not provided", async () => {
    const before = Date.now();
    await createExpense({ categoryId: expenseCategoryId, amount: 100 });
    const [tx] = await prisma.transaction.findMany();
    expect(tx.date.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("is rejected when the caller is not an admin", async () => {
    testUser.role = "EMPLOYEE";
    await expect(
      createExpense({ categoryId: expenseCategoryId, amount: 100 })
    ).rejects.toThrow();

    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(0);
  });
});
