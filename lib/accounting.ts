import { LEAD_STAGES, type LeadStageId } from "./constants";

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  LEAD_STAGES.map((s, i) => [s.id, i])
);

export function stageAtOrAfter(stage: string, target: LeadStageId): boolean {
  return (STAGE_INDEX[stage] ?? -1) >= STAGE_INDEX[target];
}

// Number of calendar months between two dates, counting the starting month, minimum 1.
export function monthsElapsed(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months) + 1;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
