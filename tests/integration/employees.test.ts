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

const { createEmployee, toggleEmployeeBlocked, deleteEmployee, setProjectAccess } =
  await import("@/lib/actions/employees");

const DEFAULT_PERMISSIONS = {
  editTasksSelf: true,
  viewAccounting: true,
  viewChannels: true,
  editCrm: false,
  editTasksOthers: false,
};

beforeEach(async () => {
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  testUser.role = "ADMIN";
});

describe("createEmployee", () => {
  it("creates a user with a hashed password (not the plaintext)", async () => {
    await createEmployee({
      name: "Иван",
      email: "ivan@test.local",
      password: "hunter22",
      role: "EMPLOYEE",
      permissions: DEFAULT_PERMISSIONS,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ivan@test.local" } });
    expect(user.passwordHash).not.toBe("hunter22");
    expect(user.role).toBe("EMPLOYEE");
    expect(user.isBlocked).toBe(false);
    expect(user.editTasksSelf).toBe(true);
    expect(user.editCrm).toBe(false);
  });

  it("is rejected when the caller is not an admin", async () => {
    testUser.role = "EMPLOYEE";
    await expect(
      createEmployee({
        name: "X",
        email: "x@test.local",
        password: "p",
        role: "EMPLOYEE",
        permissions: DEFAULT_PERMISSIONS,
      })
    ).rejects.toThrow();
  });

  it("is rejected when the password is weak or commonly leaked", async () => {
    const weak = await createEmployee({
      name: "X",
      email: "x@test.local",
      password: "123456",
      role: "EMPLOYEE",
      permissions: DEFAULT_PERMISSIONS,
    });
    expect(weak.error).toBeTruthy();
    expect(await prisma.user.findUnique({ where: { email: "x@test.local" } })).toBeNull();

    const short = await createEmployee({
      name: "X",
      email: "x2@test.local",
      password: "short",
      role: "EMPLOYEE",
      permissions: DEFAULT_PERMISSIONS,
    });
    expect(short.error).toBeTruthy();
  });

  it("is rejected when the email is already taken", async () => {
    await createEmployee({
      name: "Первый",
      email: "dup@test.local",
      password: "hunter22",
      role: "EMPLOYEE",
      permissions: DEFAULT_PERMISSIONS,
    });
    const result = await createEmployee({
      name: "Второй",
      email: "dup@test.local",
      password: "hunter22",
      role: "EMPLOYEE",
      permissions: DEFAULT_PERMISSIONS,
    });
    expect(result.error).toBeTruthy();
  });
});

describe("toggleEmployeeBlocked", () => {
  it("flips the isBlocked flag", async () => {
    const user = await prisma.user.create({
      data: { name: "Пётр", email: "petr@test.local", passwordHash: "x", role: "EMPLOYEE" },
    });

    await toggleEmployeeBlocked(user.id, true);
    let updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isBlocked).toBe(true);

    await toggleEmployeeBlocked(user.id, false);
    updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isBlocked).toBe(false);
  });
});

describe("deleteEmployee", () => {
  it("removes the user", async () => {
    const user = await prisma.user.create({
      data: { name: "Удаляемый", email: "del@test.local", passwordHash: "x", role: "EMPLOYEE" },
    });
    await deleteEmployee(user.id);
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();
  });
});

describe("setProjectAccess", () => {
  it("replaces the full set of project grants on each call", async () => {
    const user = await prisma.user.create({
      data: { name: "Сотрудник", email: "emp@test.local", passwordHash: "x", role: "EMPLOYEE" },
    });
    const p1 = await prisma.project.create({ data: { name: "Проект 1", order: 0 } });
    const p2 = await prisma.project.create({ data: { name: "Проект 2", order: 1 } });

    await setProjectAccess(user.id, [p1.id, p2.id]);
    let grants = await prisma.projectMember.findMany({ where: { userId: user.id } });
    expect(grants.map((g) => g.projectId).sort()).toEqual([p1.id, p2.id].sort());

    await setProjectAccess(user.id, [p2.id]);
    grants = await prisma.projectMember.findMany({ where: { userId: user.id } });
    expect(grants.map((g) => g.projectId)).toEqual([p2.id]);

    await setProjectAccess(user.id, []);
    grants = await prisma.projectMember.findMany({ where: { userId: user.id } });
    expect(grants).toHaveLength(0);
  });
});
