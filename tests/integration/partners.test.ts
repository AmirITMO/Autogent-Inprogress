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

const { createPartner, deactivatePartner, listPartnersWithStats } = await import("@/lib/actions/partners");

beforeEach(async () => {
  await prisma.lead.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";
});

describe("createPartner", () => {
  it("создаёт партнёра с уникальным реферальным кодом", async () => {
    const result = await createPartner({ name: "Иван", commissionType: "PERCENT", commissionValue: 10 });
    expect(result.ok).toBe(true);
    const partner = await prisma.partner.findUniqueOrThrow({ where: { id: result.id } });
    expect(partner.referralCode).toHaveLength(8);
  });

  it("отклоняет пустое имя", async () => {
    const result = await createPartner({ name: "  ", commissionType: "PERCENT", commissionValue: 10 });
    expect(result.ok).toBe(false);
  });

  it("отклоняет процент больше 100", async () => {
    const result = await createPartner({ name: "Иван", commissionType: "PERCENT", commissionValue: 150 });
    expect(result.ok).toBe(false);
  });

  it("допускает FIXED больше 100 (это сумма в рублях, не процент)", async () => {
    const result = await createPartner({ name: "Иван", commissionType: "FIXED", commissionValue: 5000 });
    expect(result.ok).toBe(true);
  });

  it("отклоняет отрицательную комиссию", async () => {
    const result = await createPartner({ name: "Иван", commissionType: "FIXED", commissionValue: -100 });
    expect(result.ok).toBe(false);
  });
});

describe("listPartnersWithStats", () => {
  it("считает комиссию PERCENT только с оплаченных лидов", async () => {
    const created = await createPartner({ name: "Иван", commissionType: "PERCENT", commissionValue: 10 });
    await prisma.lead.create({
      data: { title: "Сделка 1", ownerId: testUser.id, partnerId: created.id, stage: "PAID", prepay: 10000, postpay: 5000 },
    });
    await prisma.lead.create({
      data: { title: "Сделка 2 (не оплачена)", ownerId: testUser.id, partnerId: created.id, stage: "FIRST_TOUCH" },
    });

    const [partner] = await listPartnersWithStats();
    expect(partner.leadsCount).toBe(2);
    expect(partner.commissionOwed).toBe(1500); // 10% от (10000+5000)
  });

  it("считает комиссию FIXED за каждого оплатившего лида", async () => {
    const created = await createPartner({ name: "Пётр", commissionType: "FIXED", commissionValue: 3000 });
    await prisma.lead.create({
      data: { title: "Сделка 1", ownerId: testUser.id, partnerId: created.id, stage: "PAID" },
    });
    await prisma.lead.create({
      data: { title: "Сделка 2", ownerId: testUser.id, partnerId: created.id, stage: "POSTPAY" },
    });

    const [partner] = await listPartnersWithStats();
    expect(partner.commissionOwed).toBe(6000); // 3000 * 2 оплативших
  });

  it("не считает отказавшихся (lost) лидов в комиссию", async () => {
    const created = await createPartner({ name: "Анна", commissionType: "FIXED", commissionValue: 1000 });
    await prisma.lead.create({
      data: { title: "Сделка", ownerId: testUser.id, partnerId: created.id, stage: "PAID", lost: true },
    });

    const [partner] = await listPartnersWithStats();
    expect(partner.commissionOwed).toBe(0);
  });
});

describe("deactivatePartner", () => {
  it("помечает партнёра неактивным", async () => {
    const created = await createPartner({ name: "Иван", commissionType: "PERCENT", commissionValue: 10 });
    await deactivatePartner(created.id!);
    const [partner] = await listPartnersWithStats();
    expect(partner.isActive).toBe(false);
  });
});
