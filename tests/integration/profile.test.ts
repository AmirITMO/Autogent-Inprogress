import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
}));

const { updateProfile } = await import("@/lib/actions/profile");

beforeEach(async () => {
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "EMPLOYEE" },
  });
  testUser.id = user.id;
});

describe("updateProfile", () => {
  it("updates name and email without touching the password when none is given", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });

    const result = await updateProfile({ name: "Новое имя", email: "new@test.local" });

    expect(result.error).toBeUndefined();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });
    expect(after.name).toBe("Новое имя");
    expect(after.email).toBe("new@test.local");
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("returns an error instead of throwing when the new password is weak", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });

    const result = await updateProfile({ name: "Тест", email: before.email, password: "11112222" });

    expect(result.error).toBeTruthy();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: testUser.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("returns an error instead of throwing when the email is already taken", async () => {
    const other = await prisma.user.create({
      data: { name: "Другой", email: "taken@test.local", passwordHash: "x", role: "EMPLOYEE" },
    });

    const result = await updateProfile({ name: "Тест", email: other.email });

    expect(result.error).toBeTruthy();
  });
});
