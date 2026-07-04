"use client";

import { useMemo, useState, useCallback } from "react";
import dagre from "dagre";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { statusOf, type NodeStatus } from "@/lib/taskNodeStatus";
import { TASK_PRIORITY_COLOR, DONE_COLUMN_NAME } from "@/lib/constants";
import { createTask } from "@/lib/actions/tasks";
import { TaskModal } from "./TaskModal";
import { blankTaskCard, type TaskCardData } from "./TaskCard";

export type TreeTask = TaskCardData & { columnName: string; columnId: string };

const NODE_STYLE = { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" };
const STATUS_STYLE: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  done: { bg: "#eafaf0", border: "#16a34a", text: "#166534" },
  overdue: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  pending: { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" },
};

function RootNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; count: number };
  return (
    <div
      className="min-w-[160px] rounded-xl border-2 px-4 py-2 text-center font-semibold shadow-sm"
      style={{ background: NODE_STYLE.bg, borderColor: NODE_STYLE.border, color: NODE_STYLE.text }}
    >
      <div className="text-sm">{d.label}</div>
      <div className="text-[11px] text-muted">{d.count} задач</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ColumnNode({ id, data }: NodeProps) {
  const d = data as unknown as {
    label: string;
    count: number;
    adding: boolean;
    onAdd: (columnId: string) => void;
  };
  return (
    <div
      className="group relative min-w-[160px] rounded-xl border-2 px-4 py-2 text-center font-medium shadow-sm"
      style={{ background: NODE_STYLE.bg, borderColor: NODE_STYLE.border, color: NODE_STYLE.text }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm">{d.label}</div>
      <div className="text-[11px] text-muted">{d.count} задач</div>
      <Handle type="source" position={Position.Bottom} />

      <button
        onClick={() => d.onAdd(id)}
        disabled={d.adding}
        title="Добавить задачу в эту колонку"
        className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-accent text-sm text-white group-hover:flex disabled:opacity-50"
      >
        +
      </button>
    </div>
  );
}

function TaskLeafNode({ data }: NodeProps) {
  const nd = data as unknown as {
    title: string;
    priority: string;
    isBug: boolean;
    dueDate: string | null;
    done: boolean;
    onOpen: () => void;
  };
  const status = statusOf({ dueDate: nd.dueDate, done: nd.done });
  const style = STATUS_STYLE[status];
  return (
    <button
      onClick={nd.onOpen}
      className="min-w-[180px] rounded-lg border-2 px-3 py-2 text-left shadow-sm"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-medium">{nd.title || "Без названия"}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-80">
        <span style={{ color: TASK_PRIORITY_COLOR[nd.priority] }}>{nd.priority}</span>
        {nd.isBug && <span className="text-danger">баг</span>}
        {nd.dueDate && <span>до {new Date(nd.dueDate).toLocaleDateString("ru-RU")}</span>}
      </div>
    </button>
  );
}

const nodeTypes = { root: RootNode, column: ColumnNode, taskLeaf: TaskLeafNode };

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 70 });

  for (const n of nodes) {
    g.setNode(n.id, { width: 190, height: 60 });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 } };
  });
}

function InnerTree({
  tasks,
  columns,
  users,
  projects,
}: {
  tasks: TreeTask[];
  columns: { id: string; title: string }[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null);
  const [activeColumnName, setActiveColumnName] = useState("");
  const [addingIn, setAddingIn] = useState<string | null>(null);

  const openLeaf = useCallback((task: TaskCardData, columnName: string) => {
    setActiveTask(task);
    setActiveColumnName(columnName);
  }, []);

  const handleAdd = useCallback(
    async (columnId: string) => {
      setAddingIn(columnId);
      const created = await createTask({ columnId, title: "" });
      setAddingIn(null);
      const column = columns.find((c) => c.id === columnId);
      openLeaf(blankTaskCard(created.id), column?.title ?? "");
    },
    [columns, openLeaf]
  );

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [
      {
        id: "root",
        type: "root",
        data: { label: "Задачи", count: tasks.length },
        position: { x: 0, y: 0 },
      },
    ];
    const edges: Edge[] = [];

    for (const column of columns) {
      const colNodeId = `col-${column.id}`;
      const colTasks = tasks.filter((t) => t.columnId === column.id);
      nodes.push({
        id: colNodeId,
        type: "column",
        data: {
          label: column.title,
          count: colTasks.length,
          adding: addingIn === column.id,
          onAdd: handleAdd,
        },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `e-root-${colNodeId}`, source: "root", target: colNodeId });

      for (const t of colTasks) {
        const taskNodeId = `task-${t.id}`;
        nodes.push({
          id: taskNodeId,
          type: "taskLeaf",
          data: {
            title: t.title,
            priority: t.priority,
            isBug: t.isBug,
            dueDate: t.dueDate,
            done: column.title === DONE_COLUMN_NAME,
            onOpen: () => openLeaf(t, column.title),
          },
          position: { x: 0, y: 0 },
        });
        edges.push({ id: `e-${colNodeId}-${taskNodeId}`, source: colNodeId, target: taskNodeId });
      }
    }

    return { nodes: layout(nodes, edges), edges };
  }, [tasks, columns, addingIn, handleAdd, openLeaf]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e8dfd3" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {activeTask && (
        <TaskModal
          task={activeTask}
          columnName={activeColumnName}
          users={users}
          projects={projects}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}

export function TaskTree(props: {
  tasks: TreeTask[];
  columns: { id: string; title: string }[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  return (
    <ReactFlowProvider>
      <InnerTree {...props} />
    </ReactFlowProvider>
  );
}
