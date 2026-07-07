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

const { createTransaction, deleteTransaction } = await import("@/lib/actions/transactions");

let expenseCategoryId: string;
let incomeCategoryId: string;

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Test Admin", email: `admin-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const expenseCategory = await prisma.transactionCategory.create({
    data: { name: "Реклама", type: "EXPENSE", isRecurring: false },
  });
  expenseCategoryId = expenseCategory.id;

  const incomeCategory = await prisma.transactionCategory.create({
    data: { name: "Предоплата", type: "INCOME", isRecurring: false },
  });
  incomeCategoryId = incomeCategory.id;
});

describe("createTransaction", () => {
  it("creates an EXPENSE transaction attributed to the current user", async () => {
    await createTransaction({
      type: "EXPENSE",
      categoryId: expenseCategoryId,
      amount: 5000,
      description: "Таргет ВК",
    });

    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("EXPENSE");
    expect(Number(transactions[0].amount)).toBe(5000);
    expect(transactions[0].createdById).toBe(testUser.id);
  });

  it("creates an INCOME transaction", async () => {
    await createTransaction({ type: "INCOME", categoryId: incomeCategoryId, amount: 12000 });
    const [tx] = await prisma.transaction.findMany();
    expect(tx.type).toBe("INCOME");
    expect(Number(tx.amount)).toBe(12000);
  });

  it("defaults the date to now when not provided", async () => {
    const before = Date.now();
    await createTransaction({ type: "EXPENSE", categoryId: expenseCategoryId, amount: 100 });
    const [tx] = await prisma.transaction.findMany();
    expect(tx.date.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("rejects a non-positive amount", async () => {
    const result = await createTransaction({ type: "EXPENSE", categoryId: expenseCategoryId, amount: 0 });
    expect(result.error).toBeDefined();
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("is allowed for regular employees (accounting is open to the whole team)", async () => {
    testUser.role = "EMPLOYEE";
    await createTransaction({ type: "EXPENSE", categoryId: expenseCategoryId, amount: 100 });
    expect(await prisma.transaction.count()).toBe(1);
  });
});

describe("deleteTransaction", () => {
  it("removes the transaction", async () => {
    await createTransaction({ type: "EXPENSE", categoryId: expenseCategoryId, amount: 100 });
    const [tx] = await prisma.transaction.findMany();
    await deleteTransaction(tx.id);
    expect(await prisma.transaction.count()).toBe(0);
  });
});
