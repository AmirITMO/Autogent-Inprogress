"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";

export type KanbanItem = { id: string };
export type KanbanColumnData<T extends KanbanItem> = {
  id: string;
  title: string;
  items: T[];
  accent?: string;
  summary?: string;
  headerExtra?: React.ReactNode;
};

export function KanbanBoard<T extends KanbanItem>({
  columns,
  renderCard,
  onMove,
}: {
  columns: KanbanColumnData<T>[];
  renderCard: (item: T, dragging?: boolean) => React.ReactNode;
  onMove: (itemId: string, toColumnId: string, toIndex: number) => void;
}) {
  const [prevColumns, setPrevColumns] = useState(columns);
  const [cols, setCols] = useState(columns);
  const [activeItem, setActiveItem] = useState<T | null>(null);

  if (columns !== prevColumns) {
    setPrevColumns(columns);
    setCols(columns);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function findColumnOf(itemId: string) {
    return cols.find((c) => c.items.some((i) => i.id === itemId));
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const col = findColumnOf(id);
    setActiveItem(col?.items.find((i) => i.id === id) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const fromCol = findColumnOf(activeId);
    const toCol = cols.find((c) => c.id === overId) ?? findColumnOf(overId);
    if (!fromCol || !toCol || fromCol.id === toCol.id) return;

    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const from = next.find((c) => c.id === fromCol.id)!;
      const to = next.find((c) => c.id === toCol.id)!;
      const idx = from.items.findIndex((i) => i.id === activeId);
      const [moved] = from.items.splice(idx, 1);
      const overIdx = to.items.findIndex((i) => i.id === overId);
      to.items.splice(overIdx >= 0 ? overIdx : to.items.length, 0, moved);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const fromCol = findColumnOf(activeId);
    if (!fromCol) return;

    const toCol = cols.find((c) => c.id === overId) ?? findColumnOf(overId);
    if (!toCol) return;

    let toIndex = toCol.items.findIndex((i) => i.id === overId);
    if (toIndex < 0) toIndex = toCol.items.length;

    if (fromCol.id === toCol.id && activeId !== overId) {
      setCols((prev) =>
        prev.map((c) =>
          c.id === toCol.id
            ? {
                ...c,
                items: arrayMove(
                  c.items,
                  c.items.findIndex((i) => i.id === activeId),
                  toIndex
                ),
              }
            : c
        )
      );
    }

    onMove(activeId, toCol.id, toIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {cols.map((col) => (
          <SortableContext
            key={col.id}
            items={col.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <KanbanColumn column={col} renderCard={renderCard} />
          </SortableContext>
        ))}
      </div>
      <DragOverlay>
        {activeItem ? renderCard(activeItem, true) : null}
      </DragOverlay>
    </DndContext>
  );
}
