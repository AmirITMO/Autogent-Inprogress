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

const { updateSettings } = await import("@/lib/actions/settings");

beforeEach(async () => {
  await prisma.settings.deleteMany();
  testUser.role = "ADMIN";
});

describe("updateSettings", () => {
  it("creates the singleton row when it does not exist yet", async () => {
    await updateSettings({
      morningSummaryTime: "08:30",
      eveningSummaryTime: "20:00",
      deadlineCheckInterval: 30,
      timezone: "Europe/Moscow",
    });

    const settings = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(settings.morningSummaryTime).toBe("08:30");
    expect(settings.deadlineCheckInterval).toBe(30);
  });

  it("updates the same singleton row on subsequent calls (never creates a second row)", async () => {
    await updateSettings({
      morningSummaryTime: "09:00",
      eveningSummaryTime: "19:00",
      deadlineCheckInterval: 60,
      timezone: "Europe/Moscow",
    });
    await updateSettings({
      morningSummaryTime: "10:00",
      eveningSummaryTime: "19:00",
      deadlineCheckInterval: 60,
      timezone: "Europe/Moscow",
    });

    const all = await prisma.settings.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].morningSummaryTime).toBe("10:00");
  });

  it("is rejected when the caller is not an admin", async () => {
    testUser.role = "EMPLOYEE";
    await expect(
      updateSettings({
        morningSummaryTime: "09:00",
        eveningSummaryTime: "19:00",
        deadlineCheckInterval: 60,
        timezone: "Europe/Moscow",
      })
    ).rejects.toThrow();
  });
});
