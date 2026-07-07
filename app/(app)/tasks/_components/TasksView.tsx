"use client";

import { useState } from "react";
import { TasksBoard } from "./Board";
import { TaskTree, type TreeTask, type MindNodeRow } from "./TaskTree";
import { ArchivedTasksList } from "./ArchivedTasksList";
import type { TaskCardData } from "./TaskCard";
import type { TaskPermFlags } from "./TaskModal";

type ColumnData = { id: string; title: string; tasks: TaskCardData[] };

export function TasksView({
  columns,
  users,
  projects,
  treeTasks,
  nodesByTask,
  perms,
}: {
  columns: ColumnData[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  treeTasks: TreeTask[];
  nodesByTask: Record<string, MindNodeRow[]>;
  perms: TaskPermFlags;
}) {
  const [view, setView] = useState<"board" | "tree" | "archive">("board");

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
        <button
          onClick={() => setView("archive")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            view === "archive" ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          Архив
        </button>
      </div>

      {view === "board" && (
        <TasksBoard columns={columns} users={users} projects={projects} perms={perms} />
      )}
      {view === "tree" && (
        <div className="min-h-0 flex-1">
          <TaskTree
            tasks={treeTasks}
            columns={columns.map((c) => ({ id: c.id, title: c.title }))}
            users={users}
            projects={projects}
            nodesByTask={nodesByTask}
            perms={perms}
          />
        </div>
      )}
      {view === "archive" && <ArchivedTasksList users={users} projects={projects} perms={perms} />}
    </div>
  );
}
