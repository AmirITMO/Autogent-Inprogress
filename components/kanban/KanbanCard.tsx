"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function KanbanCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      className={disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
    >
      {children}
    </div>
  );
}
