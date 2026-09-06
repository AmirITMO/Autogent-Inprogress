import { describe, it, expect, beforeEach, vi } from "vitest";
import { startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
}));

const { listPersonalDeadlineTasks } = await import("@/lib/actions/calendar");

let columnId: string;
let otherUserId: string;

beforeEach(async () => {
  await prisma.task.deleteMany();
  await prisma.taskColumn.deleteMany();
  await prisma.taskBoard.deleteMany();
  await prisma.user.deleteMany();

  const board = await prisma.taskBoard.create({ data: { name: "ЗАДАЧИ" } });
  const col = await prisma.taskColumn.create({ data: { boardId: board.id, name: "В работе", order: 0 } });
  columnId = col.id;

  const me = await prisma.user.create({
    data: { name: "Я", email: `me-${Date.now()}@test.local`, passwordHash: "x" },
  });
  const other = await prisma.user.create({
    data: { name: "Коллега", email: `other-${Date.now()}@test.local`, passwordHash: "x" },
  });
  testUser.id = me.id;
  testUser.role = "ADMIN";
  otherUserId = other.id;
});

describe("listPersonalDeadlineTasks", () => {
  it("returns only the current user's own tasks — a colleague's deadline never leaks into the personal line", async () => {
    const monthStart = startOfMonth(new Date());
    const monthEnd = new Date(endOfMonth(new Date()));
    monthEnd.setDate(monthEnd.getDate() + 1);
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.task.create({
      data: { columnId, title: "Моя задача", assigneeId: testUser.id, dueDate, archived: false },
    });
    await prisma.task.create({
      data: { columnId, title: "Чужая задача", assigneeId: otherUserId, dueDate, archived: false },
    });

    const result = await listPersonalDeadlineTasks(monthStart.toISOString(), monthEnd.toISOString());

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Моя задача");
  });

  it("excludes archived tasks and tasks without a due date", async () => {
    const monthStart = startOfMonth(new Date());
    const monthEnd = new Date(endOfMonth(new Date()));
    monthEnd.setDate(monthEnd.getDate() + 1);
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.task.create({
      data: { columnId, title: "Без дедлайна", assigneeId: testUser.id, archived: false },
    });
    await prisma.task.create({
      data: { columnId, title: "Архивная", assigneeId: testUser.id, dueDate, archived: true },
    });

    const result = await listPersonalDeadlineTasks(monthStart.toISOString(), monthEnd.toISOString());

    expect(result).toHaveLength(0);
  });
});
