"use client";

import { useDroppable } from "@dnd-kit/core";
import type { KanbanColumnData, KanbanItem } from "./KanbanBoard";
import { KanbanCard } from "./KanbanCard";

export function KanbanColumn<T extends KanbanItem>({
  column,
  renderCard,
  canDrag,
}: {
  column: KanbanColumnData<T>;
  renderCard: (item: T) => React.ReactNode;
  canDrag?: (item: T) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {column.accent && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: column.accent }}
            />
          )}
          <span className="text-sm font-semibold text-foreground">
            {column.title}
          </span>
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
            {column.items.length}
          </span>
        </div>
        {column.headerExtra}
      </div>
      {column.summary && (
        <div className="border-b border-border bg-surface-2/50 px-4 py-1.5 text-xs font-medium text-muted">
          {column.summary}
        </div>
      )}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 transition ${
          isOver ? "bg-accent-soft/40" : ""
        }`}
      >
        {column.items.map((item) => (
          <KanbanCard key={item.id} id={item.id} disabled={canDrag ? !canDrag(item) : false}>
            {renderCard(item)}
          </KanbanCard>
        ))}
        {column.items.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted/60">
            Пусто
          </div>
        )}
      </div>
    </div>
  );
}
