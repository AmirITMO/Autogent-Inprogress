"use client";

import { useDroppable } from "@dnd-kit/core";
import type { KanbanColumnData, KanbanItem } from "./KanbanBoard";
import { KanbanCard } from "./KanbanCard";

export function KanbanColumn<T extends KanbanItem>({
  column,
  renderCard,
}: {
  column: KanbanColumnData<T>;
  renderCard: (item: T) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {column.accent && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: column.accent }}
            />
          )}
          <span className="text-sm font-medium text-foreground">
            {column.title}
          </span>
          <span className="text-xs text-muted">{column.items.length}</span>
        </div>
      </div>
      {column.summary && (
        <div className="border-b border-border px-3 py-1.5 text-xs text-muted">
          {column.summary}
        </div>
      )}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition ${
          isOver ? "bg-surface-2/60" : ""
        }`}
      >
        {column.items.map((item) => (
          <KanbanCard key={item.id} id={item.id}>
            {renderCard(item)}
          </KanbanCard>
        ))}
      </div>
    </div>
  );
}
