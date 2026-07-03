import { describe, it, expect } from "vitest";
import { statusOf } from "@/lib/taskNodeStatus";

describe("statusOf", () => {
  it("is 'done' whenever done=true, regardless of dueDate", () => {
    expect(statusOf({ done: true, dueDate: null })).toBe("done");
    expect(statusOf({ done: true, dueDate: "2000-01-01" })).toBe("done");
  });

  it("is 'pending' when not done and there is no dueDate", () => {
    expect(statusOf({ done: false, dueDate: null })).toBe("pending");
  });

  it("is 'pending' when not done and dueDate is in the future", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(statusOf({ done: false, dueDate: future })).toBe("pending");
  });

  it("is 'overdue' when not done and dueDate is in the past", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(statusOf({ done: false, dueDate: past })).toBe("overdue");
  });

  it("prioritizes 'done' over an overdue dueDate", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(statusOf({ done: true, dueDate: past })).toBe("done");
  });

  it("accepts a Date object as well as a string", () => {
    const past = new Date(Date.now() - 1000);
    expect(statusOf({ done: false, dueDate: past })).toBe("overdue");
  });
});
