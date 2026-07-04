"use client";

import { useState } from "react";
import { TasksBoard } from "./Board";
import { TaskTree, type TreeTask } from "./TaskTree";
import type { TaskCardData } from "./TaskCard";

type ColumnData = { id: string; title: string; tasks: TaskCardData[] };

export function TasksView({
  columns,
  users,
  projects,
  treeTasks,
}: {
  columns: ColumnData[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  treeTasks: TreeTask[];
}) {
  const [view, setView] = useState<"board" | "tree">("board");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-border px-5 py-2">
        <button
          onClick={() => setView("board")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            view === "board" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Доска
        </button>
        <button
          onClick={() => setView("tree")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            view === "tree" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Дерево задач
        </button>
      </div>

      {view === "board" ? (
        <TasksBoard columns={columns} users={users} projects={projects} />
      ) : (
        <div className="min-h-0 flex-1">
          <TaskTree
            tasks={treeTasks}
            columns={columns.map((c) => ({ id: c.id, title: c.title }))}
            users={users}
            projects={projects}
          />
        </div>
      )}
    </div>
  );
}
