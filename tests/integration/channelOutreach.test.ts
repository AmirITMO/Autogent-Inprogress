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

const { addOutreachBatch } = await import("@/lib/actions/channelOutreach");

let channelId: string;

beforeEach(async () => {
  await prisma.channelOutreachBatch.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Рассылки по hh", type: "MANUAL" },
  });
  channelId = channel.id;
});

describe("addOutreachBatch", () => {
  it("создаёт запись с корректными числами", async () => {
    const result = await addOutreachBatch(channelId, 50, 8, "неделя 1-7 сентября");

    expect(result.ok).toBe(true);
    const batches = await prisma.channelOutreachBatch.findMany({ where: { channelId } });
    expect(batches).toHaveLength(1);
    expect(batches[0].sentCount).toBe(50);
    expect(batches[0].positiveCount).toBe(8);
    expect(batches[0].note).toBe("неделя 1-7 сентября");
    expect(batches[0].createdById).toBe(testUser.id);
  });

  it("отклоняет sentCount <= 0", async () => {
    const result = await addOutreachBatch(channelId, 0, 0);
    expect(result.ok).toBe(false);
    expect(await prisma.channelOutreachBatch.count()).toBe(0);
  });

  it("отклоняет отрицательный positiveCount", async () => {
    const result = await addOutreachBatch(channelId, 10, -1);
    expect(result.ok).toBe(false);
  });

  it("отклоняет positiveCount больше sentCount", async () => {
    const result = await addOutreachBatch(channelId, 10, 11);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/не может быть больше/);
  });

  it("не бросает исключение — возвращает ok:false", async () => {
    const result = await addOutreachBatch("unknown-channel-id", 10, 5);
    expect(result.ok).toBe(false);
  });
});
