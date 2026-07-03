export type NodeStatus = "done" | "overdue" | "pending";

export function statusOf(n: { dueDate: string | Date | null; done: boolean }): NodeStatus {
  if (n.done) return "done";
  if (n.dueDate && new Date(n.dueDate) < new Date()) return "overdue";
  return "pending";
}
