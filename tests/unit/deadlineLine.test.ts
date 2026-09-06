import { describe, it, expect } from "vitest";
import { weekSegment, chunkWeeks, colorForTaskId } from "@/lib/calendar/deadlineLine";

const week1 = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
const week2 = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];

describe("weekSegment", () => {
  it("returns null when the task range is entirely before the week", () => {
    expect(weekSegment(week1, { startDate: "2026-08-01", dueDate: "2026-09-06" })).toBeNull();
  });

  it("returns null when the task range is entirely after the week", () => {
    expect(weekSegment(week1, { startDate: "2026-09-14", dueDate: "2026-09-20" })).toBeNull();
  });

  it("clips to the week boundaries when the task spans multiple weeks", () => {
    expect(weekSegment(week1, { startDate: "2026-09-05", dueDate: "2026-09-16" })).toEqual({
      startCol: 0,
      endCol: 6,
    });
    expect(weekSegment(week2, { startDate: "2026-09-05", dueDate: "2026-09-16" })).toEqual({
      startCol: 0,
      endCol: 2,
    });
  });

  it("computes exact columns for a range fully inside one week", () => {
    expect(weekSegment(week1, { startDate: "2026-09-09", dueDate: "2026-09-11" })).toEqual({
      startCol: 2,
      endCol: 4,
    });
  });

  it("handles a single-day task", () => {
    expect(weekSegment(week1, { startDate: "2026-09-10", dueDate: "2026-09-10" })).toEqual({
      startCol: 3,
      endCol: 3,
    });
  });

  it("clips the start when the range began before the week (already clamped upstream)", () => {
    expect(weekSegment(week1, { startDate: "2026-09-01", dueDate: "2026-09-08" })).toEqual({
      startCol: 0,
      endCol: 1,
    });
  });
});

describe("chunkWeeks", () => {
  it("splits a flat list of days into weeks of 7", () => {
    const days = Array.from({ length: 21 }, (_, i) => i);
    expect(chunkWeeks(days)).toEqual([
      [0, 1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12, 13],
      [14, 15, 16, 17, 18, 19, 20],
    ]);
  });
});

describe("colorForTaskId", () => {
  it("is deterministic for the same id", () => {
    expect(colorForTaskId("abc")).toBe(colorForTaskId("abc"));
  });

  it("returns an hsl() color string", () => {
    expect(colorForTaskId("abc")).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  });
});
