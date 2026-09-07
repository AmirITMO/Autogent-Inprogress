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
  assertCanEditTask: async () => {},
}));

const { createTask, moveTask, updateTask, deleteTask, addTaskComment, getTaskComments } =
  await import("@/lib/actions/tasks");

let columnA: string;
let columnB: string;

beforeEach(async () => {
  await prisma.taskComment.deleteMany();
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
  const colA = await prisma.taskColumn.create({ data: { boardId: board.id, name: "Бэклог", order: 0 } });
  const colB = await prisma.taskColumn.create({ data: { boardId: board.id, name: "В работе", order: 1 } });
  columnA = colA.id;
  columnB = colB.id;
});

describe("createTask", () => {
  it("creates a task in the given column without any mind-map nodes yet", async () => {
    const task = await createTask({ columnId: columnA, title: "Починить баг" });
    expect(task.columnId).toBe(columnA);

    // The root of the mind-map is synthesized on the frontend from the task
    // itself; no TaskNode row should be created automatically.
    const nodes = await prisma.taskNode.findMany({ where: { taskId: task.id } });
    expect(nodes).toHaveLength(0);
  });

  it("defaults to P2 priority and isBug=false", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.priority).toBe("P2");
    expect(stored.isBug).toBe(false);
  });
});

describe("moveTask", () => {
  it("moves a task to another column and re-indexes the destination column", async () => {
    const t1 = await createTask({ columnId: columnB, title: "T1" });
    const t2 = await createTask({ columnId: columnA, title: "T2" });

    await moveTask(t2.id, columnB, 0);

    const inColumnB = await prisma.task.findMany({
      where: { columnId: columnB },
      orderBy: { order: "asc" },
    });
    expect(inColumnB.map((t) => t.id)).toEqual([t2.id, t1.id]);
    expect(inColumnB.map((t) => t.order)).toEqual([0, 1]);
  });

  it("does not touch updatedAt of tasks already sitting in the destination column", async () => {
    const t1 = await createTask({ columnId: columnB, title: "T1" });
    const t2 = await createTask({ columnId: columnA, title: "T2" });
    const t1Before = await prisma.task.findUniqueOrThrow({ where: { id: t1.id } });

    await moveTask(t2.id, columnB, 0);

    const t1After = await prisma.task.findUniqueOrThrow({ where: { id: t1.id } });
    expect(t1After.updatedAt.getTime()).toBe(t1Before.updatedAt.getTime());
  });

  it("bumps updatedAt of the moved task only when its column actually changes", async () => {
    const task = await createTask({ columnId: columnA, title: "T1" });
    const before = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

    await moveTask(task.id, columnB, 0);

    const afterColumnChange = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(afterColumnChange.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("does not bump updatedAt when reordering within the same column", async () => {
    const t1 = await createTask({ columnId: columnA, title: "T1" });
    const t2 = await createTask({ columnId: columnA, title: "T2" });
    const t2Before = await prisma.task.findUniqueOrThrow({ where: { id: t2.id } });

    // Переставляем t2 перед t1 внутри той же колонки — статус (columnId) не меняется.
    await moveTask(t2.id, columnA, 0);

    const t2After = await prisma.task.findUniqueOrThrow({ where: { id: t2.id } });
    expect(t2After.order).toBe(0);
    expect(t2After.updatedAt.getTime()).toBe(t2Before.updatedAt.getTime());
  });
});

describe("updateTask", () => {
  it("updates priority, bug flag and estimate hours", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    await updateTask(task.id, { priority: "P0", isBug: true, estimateHours: 4 });

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe("P0");
    expect(updated.isBug).toBe(true);
    expect(Number(updated.estimateHours)).toBe(4);
  });

  it("clears the due date when explicitly set to null", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    await updateTask(task.id, { dueDate: "2030-01-01" });
    let updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.dueDate).not.toBeNull();

    await updateTask(task.id, { dueDate: null });
    updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.dueDate).toBeNull();
  });

  it("rejects a due date in the past", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    const result = await updateTask(task.id, { dueDate: "2000-01-01" });
    expect(result.error).toBeTruthy();

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.dueDate).toBeNull();
  });

  it("rejects a fractional, negative or too large estimate", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });

    expect((await updateTask(task.id, { estimateHours: 4.5 })).error).toBeTruthy();
    expect((await updateTask(task.id, { estimateHours: -1 })).error).toBeTruthy();
    expect((await updateTask(task.id, { estimateHours: 99999999 })).error).toBeTruthy();

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.estimateHours).toBeNull();
  });
});

describe("deleteTask", () => {
  it("cascades to its comments and mind-map nodes", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    await addTaskComment(task.id, "первый комментарий");

    await deleteTask(task.id);

    const remainingTask = await prisma.task.findUnique({ where: { id: task.id } });
    const remainingComments = await prisma.taskComment.findMany({ where: { taskId: task.id } });
    const remainingNodes = await prisma.taskNode.findMany({ where: { taskId: task.id } });
    expect(remainingTask).toBeNull();
    expect(remainingComments).toHaveLength(0);
    expect(remainingNodes).toHaveLength(0);
  });
});

describe("comments", () => {
  it("adds a comment with an optional attachment and returns it with the author", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    const comment = await addTaskComment(task.id, "смотри вложение", "https://example.com/file.pdf");
    expect(comment.text).toBe("смотри вложение");
    expect(comment.attachmentUrl).toBe("https://example.com/file.pdf");
    expect(comment.user.id).toBe(testUser.id);

    const all = await getTaskComments(task.id);
    expect(all).toHaveLength(1);
  });

  it("links previously uploaded attachments to the comment", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача" });
    const file = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        fileName: "screenshot.png",
        mimeType: "image/png",
        size: 1234,
        storageKey: `${task.id}/screenshot.png`,
        uploadedById: testUser.id,
      },
    });

    const comment = await addTaskComment(task.id, "скриншот бага", undefined, [file.id]);
    expect(comment.attachments).toHaveLength(1);
    expect(comment.attachments[0].fileName).toBe("screenshot.png");

    const updated = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: file.id } });
    expect(updated.commentId).toBe(comment.id);
  });

  it("notifies the assignee about a new comment, but not the commenter about their own", async () => {
    const assignee = await prisma.user.create({
      data: { name: "Исполнитель", email: `assignee-${Date.now()}@test.local`, passwordHash: "x" },
    });
    // createTask сам уже шлёт TASK_ASSIGNED назначенному — комментарий должен
    // добавить ровно одно новое уведомление именно типа TASK_COMMENT.
    const task = await createTask({ columnId: columnA, title: "Задача", assigneeId: assignee.id });

    await addTaskComment(task.id, "проверь, пожалуйста");

    const commentNotifications = await prisma.notification.findMany({
      where: { userId: assignee.id, type: "TASK_COMMENT" },
    });
    expect(commentNotifications).toHaveLength(1);
    expect(commentNotifications[0].link).toBe(`/tasks?task=${task.id}`);
    expect(commentNotifications[0].body).toContain("проверь, пожалуйста");

    const selfNotifications = await prisma.notification.findMany({
      where: { userId: testUser.id, type: "TASK_COMMENT" },
    });
    expect(selfNotifications).toHaveLength(0);
  });

  it("does not notify anyone when the assignee comments on their own task", async () => {
    const task = await createTask({ columnId: columnA, title: "Задача", assigneeId: testUser.id });

    await addTaskComment(task.id, "себе на заметку");

    const notifications = await prisma.notification.findMany({ where: { userId: testUser.id } });
    expect(notifications).toHaveLength(0);
  });
});
