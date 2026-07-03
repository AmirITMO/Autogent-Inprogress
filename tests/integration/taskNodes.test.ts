import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
  requireAdmin: async () => testUser,
}));

const { createTask } = await import("@/lib/actions/tasks");
const { listTaskNodes, createTaskNode, updateTaskNode, moveTaskNode, deleteTaskNode } =
  await import("@/lib/actions/taskNodes");

let taskId: string;

beforeEach(async () => {
  await prisma.taskNode.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskColumn.deleteMany();
  await prisma.taskBoard.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Test Admin", email: `admin-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const board = await prisma.taskBoard.create({ data: { name: "ЗАДАЧИ" } });
  const column = await prisma.taskColumn.create({ data: { boardId: board.id, name: "Бэклог", order: 0 } });
  const task = await createTask({ columnId: column.id, title: "Родительская задача" });
  taskId = task.id;
});

describe("createTaskNode", () => {
  it("creates a child node attached to the task's root node", async () => {
    const root = (await listTaskNodes(taskId)).find((n) => n.parentId === null)!;
    const child = await createTaskNode({ taskId, parentId: root.id, title: "Подзадача 1", x: 100, y: 160 });

    expect(child.parentId).toBe(root.id);
    const nodes = await listTaskNodes(taskId);
    expect(nodes).toHaveLength(2);
  });

  it("stores an optional dueDate that is null by default", async () => {
    const node = await createTaskNode({ taskId, parentId: null, title: "Без дедлайна", x: 0, y: 0 });
    expect(node.dueDate).toBeNull();
  });
});

describe("updateTaskNode", () => {
  it("toggles done and updates the title", async () => {
    const node = await createTaskNode({ taskId, parentId: null, title: "Старое имя", x: 0, y: 0 });
    await updateTaskNode(node.id, { title: "Новое имя", done: true });

    const updated = await prisma.taskNode.findUniqueOrThrow({ where: { id: node.id } });
    expect(updated.title).toBe("Новое имя");
    expect(updated.done).toBe(true);
  });

  it("can clear a previously set dueDate", async () => {
    const node = await createTaskNode({
      taskId,
      parentId: null,
      title: "Узел",
      x: 0,
      y: 0,
      dueDate: "2025-01-01",
    });
    await updateTaskNode(node.id, { dueDate: null });
    const updated = await prisma.taskNode.findUniqueOrThrow({ where: { id: node.id } });
    expect(updated.dueDate).toBeNull();
  });
});

describe("moveTaskNode", () => {
  it("persists new x/y coordinates", async () => {
    const node = await createTaskNode({ taskId, parentId: null, title: "Узел", x: 0, y: 0 });
    await moveTaskNode(node.id, 240, 480);

    const updated = await prisma.taskNode.findUniqueOrThrow({ where: { id: node.id } });
    expect(updated.x).toBe(240);
    expect(updated.y).toBe(480);
  });
});

describe("deleteTaskNode", () => {
  it("cascades deletion to child nodes (grandchildren too)", async () => {
    const root = (await listTaskNodes(taskId)).find((n) => n.parentId === null)!;
    const child = await createTaskNode({ taskId, parentId: root.id, title: "Ребёнок", x: 0, y: 100 });
    const grandchild = await createTaskNode({
      taskId,
      parentId: child.id,
      title: "Внук",
      x: 0,
      y: 200,
    });

    await deleteTaskNode(child.id);

    const remaining = await prisma.taskNode.findMany({ where: { taskId } });
    const remainingIds = remaining.map((n) => n.id);
    expect(remainingIds).not.toContain(child.id);
    expect(remainingIds).not.toContain(grandchild.id);
    expect(remainingIds).toContain(root.id);
  });
});
