import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
  requireAdmin: async () => {
    if (testUser.role !== "ADMIN") throw new Error("Forbidden");
    return testUser;
  },
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const { createLead, moveLead, updateLead, getLeadActivity, reconcileAllLeadIncome } =
  await import("@/lib/actions/leads");

async function seedIncomeCategories() {
  await prisma.transactionCategory.createMany({
    data: [
      { id: "income-Предоплата", name: "Предоплата", type: "INCOME", isRecurring: false },
      { id: "income-Постоплата", name: "Постоплата", type: "INCOME", isRecurring: false },
      { id: "income-Подписка", name: "Подписка", type: "INCOME", isRecurring: true },
    ],
  });
}

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.leadActivity.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Test Admin", email: `admin-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  await seedIncomeCategories();
});

describe("createLead", () => {
  it("creates a lead in the SCHEDULED_CALL stage owned by the current user", async () => {
    const lead = await createLead({ title: "Новая сделка", company: "ООО Ромашка" });
    expect(lead.stage).toBe("SCHEDULED_CALL");
    expect(lead.ownerId).toBe(testUser.id);
    expect(lead.company).toBe("ООО Ромашка");
  });

  it("logs a creation activity entry", async () => {
    const lead = await createLead({ title: "Сделка 2" });
    const activity = await getLeadActivity(lead.id);
    expect(activity).toHaveLength(1);
    expect(activity[0].message).toMatch(/создан/);
  });

  it("places new leads after existing ones in the same stage (order increments)", async () => {
    const first = await createLead({ title: "Первая" });
    const second = await createLead({ title: "Вторая" });
    expect(second.order).toBeGreaterThan(first.order);
  });
});

describe("moveLead", () => {
  it("moves a lead into a target stage and updates its order", async () => {
    const lead = await createLead({ title: "Сделка" });
    await moveLead(lead.id, "IN_PROGRESS", 0);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.stage).toBe("IN_PROGRESS");
    expect(updated.order).toBe(0);
  });

  it("re-indexes siblings when inserted between them (no duplicate/skipped order values)", async () => {
    const a = await createLead({ title: "A" });
    const b = await createLead({ title: "B" });
    const c = await createLead({ title: "C" });
    // Move C to the front of the same SCHEDULED_CALL column.
    await moveLead(c.id, "SCHEDULED_CALL", 0);

    const siblings = await prisma.lead.findMany({
      where: { stage: "SCHEDULED_CALL" },
      orderBy: { order: "asc" },
    });
    expect(siblings.map((l) => l.id)).toEqual([c.id, a.id, b.id]);
    expect(siblings.map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it("logs a stage-change activity entry only when the stage actually changes", async () => {
    const lead = await createLead({ title: "Сделка" });
    await moveLead(lead.id, "SCHEDULED_CALL", 0); // same stage, just reordering
    let activity = await getLeadActivity(lead.id);
    expect(activity).toHaveLength(1); // only the creation entry

    await moveLead(lead.id, "CALL_DONE", 0);
    activity = await getLeadActivity(lead.id);
    expect(activity.some((a) => a.message.includes("Стадия изменена"))).toBe(true);
  });

  it("creates an INCOME transaction when a lead is moved to PAID with a prepay amount", async () => {
    const lead = await createLead({ title: "Оплаченная сделка" });
    await updateLead(lead.id, { prepay: 10000 });
    await moveLead(lead.id, "PAID", 0);

    const transactions = await prisma.transaction.findMany({ where: { leadId: lead.id } });
    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBe(10000);
    expect(transactions[0].type).toBe("INCOME");
  });
});

describe("updateLead", () => {
  it("updates fields and logs an activity entry", async () => {
    const lead = await createLead({ title: "Сделка" });
    await updateLead(lead.id, { notes: "Прочее: важный клиент" });

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.notes).toBe("Прочее: важный клиент");

    const activity = await getLeadActivity(lead.id);
    expect(activity.some((a) => a.message.includes("обновлена"))).toBe(true);
  });

  it("does not create income transactions before the deal reaches the PAID stage", async () => {
    const lead = await createLead({ title: "Сделка" });
    await updateLead(lead.id, { prepay: 1000, postpay: 2000, monthlySub: 500 });

    const transactions = await prisma.transaction.findMany({ where: { leadId: lead.id } });
    expect(transactions).toHaveLength(0);
  });

  it("creates income transactions for prepay, postpay and monthlySub once a lead reaches support", async () => {
    const lead = await createLead({ title: "Сделка" });
    await moveLead(lead.id, "SUPPORT", 0);
    await updateLead(lead.id, { prepay: 1000, postpay: 2000, monthlySub: 500 });

    const transactions = await prisma.transaction.findMany({
      where: { leadId: lead.id },
      orderBy: { amount: "asc" },
    });
    expect(transactions).toHaveLength(3);
    expect(transactions.map((t) => Number(t.amount))).toEqual([500, 1000, 2000]);
  });

  it("updates the existing transaction amount instead of duplicating it when a value changes", async () => {
    const lead = await createLead({ title: "Сделка" });
    await moveLead(lead.id, "PAID", 0);
    await updateLead(lead.id, { prepay: 1000 });
    await updateLead(lead.id, { prepay: 1500 });

    const transactions = await prisma.transaction.findMany({ where: { leadId: lead.id } });
    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBe(1500);
  });

  it("does not create a transaction for a zero amount", async () => {
    const lead = await createLead({ title: "Сделка" });
    await moveLead(lead.id, "PAID", 0);
    await updateLead(lead.id, { prepay: 0 });

    const transactions = await prisma.transaction.findMany({ where: { leadId: lead.id } });
    expect(transactions).toHaveLength(0);
  });
});

describe("reconcileAllLeadIncome", () => {
  it("removes income transactions left over from leads that never reached the eligible stage", async () => {
    // Simulates data created outside the normal flow (e.g. a one-off import script) that
    // bypassed the stage-gating rules — the ledger must be cleaned up regardless.
    const lead = await createLead({ title: "Импортированная сделка" });
    await prisma.lead.update({ where: { id: lead.id }, data: { prepay: 5000, postpay: 3000 } });

    const category = await prisma.transactionCategory.findFirstOrThrow({
      where: { name: "Предоплата", type: "INCOME" },
    });
    await prisma.transaction.create({
      data: {
        categoryId: category.id,
        leadId: lead.id,
        amount: 5000,
        type: "INCOME",
        description: "Предоплата (импорт, в обход правил)",
        createdById: testUser.id,
      },
    });

    await reconcileAllLeadIncome();

    const transactions = await prisma.transaction.findMany({ where: { leadId: lead.id } });
    expect(transactions).toHaveLength(0);
  });

  it("backfills the missing transaction for a lead that already sits at an eligible stage", async () => {
    const lead = await createLead({ title: "Сделка на постоплате" });
    await moveLead(lead.id, "POSTPAY", 0);
    await prisma.lead.update({ where: { id: lead.id }, data: { prepay: 1000, postpay: 2000 } });
    // Wipe transactions to simulate data that was never synced (e.g. stage set directly in the DB).
    await prisma.transaction.deleteMany({ where: { leadId: lead.id } });

    await reconcileAllLeadIncome();

    const transactions = await prisma.transaction.findMany({
      where: { leadId: lead.id },
      orderBy: { amount: "asc" },
    });
    expect(transactions.map((t) => Number(t.amount))).toEqual([1000, 2000]);
  });
});
