"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dagre from "dagre";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { statusOf, type NodeStatus } from "@/lib/taskNodeStatus";
import { TASK_PRIORITY_COLOR, DONE_COLUMN_NAME } from "@/lib/constants";
import { createTask } from "@/lib/actions/tasks";
import { createTaskNode, updateTaskNode, deleteTaskNode, moveTaskNode } from "@/lib/actions/taskNodes";
import { TaskModal } from "./TaskModal";
import { blankTaskCard, type TaskCardData } from "./TaskCard";

export type TreeTask = TaskCardData & { columnName: string; columnId: string };
export type MindNodeRow = {
  id: string;
  parentId: string | null;
  title: string;
  dueDate: string | null;
  done: boolean;
  x: number;
  y: number;
};

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

function ColumnNode({ data }: NodeProps) {
  const d = data as unknown as {
    columnId: string;
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
        onClick={() => d.onAdd(d.columnId)}
        disabled={d.adding}
        title="Добавить задачу в эту колонку"
        className="nodrag absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-accent text-sm text-white group-hover:flex disabled:opacity-50"
      >
        +
      </button>
    </div>
  );
}

function TaskLeafNode({ data }: NodeProps) {
  const nd = data as unknown as {
    taskId: string;
    title: string;
    priority: string;
    isBug: boolean;
    dueDate: string | null;
    done: boolean;
    onOpen: () => void;
    onAddSubtask: (taskId: string) => void;
  };
  const status = statusOf({ dueDate: nd.dueDate, done: nd.done });
  const style = STATUS_STYLE[status];
  return (
    <div
      className="group relative min-w-[180px] rounded-lg border-2 shadow-sm"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      <Handle type="target" position={Position.Top} />
      <button onClick={nd.onOpen} className="w-full px-3 py-2 text-left">
        <div className="text-sm font-medium">{nd.title || "Без названия"}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-80">
          <span style={{ color: TASK_PRIORITY_COLOR[nd.priority] }}>{nd.priority}</span>
          {nd.isBug && <span className="text-danger">баг</span>}
          {nd.dueDate && <span>до {new Date(nd.dueDate).toLocaleDateString("ru-RU")}</span>}
        </div>
      </button>
      <Handle type="source" position={Position.Bottom} />
      <button
        onClick={() => nd.onAddSubtask(nd.taskId)}
        title="Добавить подзадачу (мини-карта под задачей)"
        className="nodrag absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-accent text-sm text-white group-hover:flex"
      >
        +
      </button>
    </div>
  );
}

type MindNodeData = {
  taskId: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  onToggleDone: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSetDueDate: (id: string, date: string) => void;
  onAddChild: (taskId: string, parentId: string) => void;
  onDelete: (id: string) => void;
};

function SubtaskNode({ id, data }: NodeProps) {
  const d = data as unknown as MindNodeData;
  const status = statusOf(d);
  const style = STATUS_STYLE[status];
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(d.title);

  return (
    <div
      className="group relative min-w-[160px] rounded-xl border-2 px-3 py-2 shadow-sm"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            setEditing(false);
            d.onRename(id, title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              d.onRename(id, title);
            }
          }}
          className="nodrag w-full rounded border border-border bg-white px-1 py-0.5 text-sm text-foreground outline-none"
        />
      ) : (
        <div onDoubleClick={() => setEditing(true)} className="text-sm font-medium">
          {d.title}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-[11px] opacity-80">
        <label className="nodrag flex items-center gap-1">
          <input type="checkbox" checked={d.done} onChange={() => d.onToggleDone(id)} />
          готово
        </label>
        <input
          type="date"
          value={d.dueDate ? d.dueDate.slice(0, 10) : ""}
          onChange={(e) => d.onSetDueDate(id, e.target.value)}
          className="nodrag rounded border border-transparent bg-transparent text-[11px] outline-none hover:border-border"
        />
      </div>

      <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
        <button
          onClick={() => d.onAddChild(d.taskId, id)}
          title="Добавить подзадачу"
          className="nodrag flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-white"
        >
          +
        </button>
        <button
          onClick={() => d.onDelete(id)}
          title="Удалить"
          className="nodrag flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}

const nodeTypes = { root: RootNode, column: ColumnNode, taskLeaf: TaskLeafNode, subtask: SubtaskNode };

const SKELETON_WIDTH = 190;
const SKELETON_HEIGHT = 60;

function layoutSkeleton(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 70 });

  for (const n of nodes) {
    g.setNode(n.id, { width: SKELETON_WIDTH, height: SKELETON_HEIGHT });
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

function buildGraph(
  tasks: TreeTask[],
  columns: { id: string; title: string }[],
  nodesByTask: Record<string, MindNodeRow[]>
) {
  const skeletonNodes: Node[] = [
    { id: "root", type: "root", data: { label: "Задачи", count: tasks.length }, position: { x: 0, y: 0 } },
  ];
  const edges: Edge[] = [];

  for (const column of columns) {
    const colNodeId = `col-${column.id}`;
    const colTasks = tasks.filter((t) => t.columnId === column.id);
    skeletonNodes.push({
      id: colNodeId,
      type: "column",
      data: { columnId: column.id, label: column.title, count: colTasks.length },
      position: { x: 0, y: 0 },
    });
    edges.push({ id: `e-root-${colNodeId}`, source: "root", target: colNodeId });

    for (const t of colTasks) {
      const taskNodeId = `task-${t.id}`;
      skeletonNodes.push({
        id: taskNodeId,
        type: "taskLeaf",
        data: {
          taskId: t.id,
          title: t.title,
          priority: t.priority,
          isBug: t.isBug,
          dueDate: t.dueDate,
          done: column.title === DONE_COLUMN_NAME,
        },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `e-${colNodeId}-${taskNodeId}`, source: colNodeId, target: taskNodeId });
    }
  }

  const laidOut = layoutSkeleton(skeletonNodes, edges);
  const nodes: Node[] = [...laidOut];

  for (const n of laidOut) {
    if (n.type !== "taskLeaf") continue;
    const taskId = (n.data as { taskId: string }).taskId;
    const rows = nodesByTask[taskId];
    if (!rows || rows.length === 0) continue;

    const anchorX = n.position.x;
    const anchorY = n.position.y + SKELETON_HEIGHT + 60;

    for (const row of rows) {
      nodes.push({
        id: row.id,
        type: "subtask",
        position: { x: anchorX + row.x, y: anchorY + row.y },
        data: { taskId, title: row.title, dueDate: row.dueDate, done: row.done },
      });
      edges.push({
        id: row.parentId ? `e-${row.parentId}-${row.id}` : `e-task-${taskId}-${row.id}`,
        source: row.parentId ?? n.id,
        target: row.id,
      });
    }
  }

  return { nodes, edges };
}

function InnerTree({
  tasks,
  columns,
  users,
  projects,
  nodesByTask,
}: {
  tasks: TreeTask[];
  columns: { id: string; title: string }[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  nodesByTask: Record<string, MindNodeRow[]>;
}) {
  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null);
  const [activeColumnName, setActiveColumnName] = useState("");
  const [addingIn, setAddingIn] = useState<string | null>(null);

  const openLeaf = useCallback((task: TaskCardData, columnName: string) => {
    setActiveTask(task);
    setActiveColumnName(columnName);
  }, []);

  const initial = useMemo(
    () => buildGraph(tasks, columns, nodesByTask),
    [tasks, columns, nodesByTask]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial, setNodes, setEdges]);

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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

  const patchData = useCallback(
    (id: string, patch: Partial<MindNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  const onToggleDone = useCallback(
    (id: string) => {
      const target = nodesRef.current.find((n) => n.id === id);
      const newDone = !(target?.data as unknown as MindNodeData)?.done;
      updateTaskNode(id, { done: newDone });
      patchData(id, { done: newDone });
    },
    [patchData]
  );

  const onRename = useCallback(
    (id: string, title: string) => {
      patchData(id, { title });
      updateTaskNode(id, { title });
    },
    [patchData]
  );

  const onSetDueDate = useCallback(
    (id: string, date: string) => {
      patchData(id, { dueDate: date || null });
      updateTaskNode(id, { dueDate: date || null });
    },
    [patchData]
  );

  const onDelete = useCallback(
    (id: string) => {
      deleteTaskNode(id);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges]
  );

  const onAddChild = useCallback(
    async (taskId: string, parentId: string) => {
      const parent = nodesRef.current.find((n) => n.id === parentId);
      const taskLeaf = nodesRef.current.find((n) => n.id === `task-${taskId}`);
      const siblingCount = edges.filter((e) => e.source === parentId).length;
      const anchor = taskLeaf?.position ?? { x: 0, y: 0 };
      const x = (parent?.position.x ?? anchor.x) + siblingCount * 200 - 100;
      const y = (parent?.position.y ?? anchor.y) + 140;

      const created = await createTaskNode({
        taskId,
        parentId,
        title: "Новая подзадача",
        x: x - anchor.x,
        y: y - anchor.y,
      });

      setNodes((nds) => [
        ...nds,
        {
          id: created.id,
          type: "subtask",
          position: { x, y },
          data: { taskId, title: created.title, dueDate: null, done: false },
        },
      ]);
      setEdges((eds) => [...eds, { id: `e-${parentId}-${created.id}`, source: parentId, target: created.id }]);
    },
    [edges, setNodes, setEdges]
  );

  const onAddSubtask = useCallback(
    async (taskId: string) => {
      const taskLeaf = nodesRef.current.find((n) => n.id === `task-${taskId}`);
      const anchor = taskLeaf?.position ?? { x: 0, y: 0 };
      const x = anchor.x;
      const y = anchor.y + SKELETON_HEIGHT + 60;

      const created = await createTaskNode({
        taskId,
        parentId: null,
        title: "Новая подзадача",
        x: 0,
        y: SKELETON_HEIGHT + 60,
      });

      setNodes((nds) => [
        ...nds,
        {
          id: created.id,
          type: "subtask",
          position: { x, y },
          data: { taskId, title: created.title, dueDate: null, done: false },
        },
      ]);
      setEdges((eds) => [
        ...eds,
        { id: `e-task-${taskId}-${created.id}`, source: `task-${taskId}`, target: created.id },
      ]);
    },
    [setNodes, setEdges]
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.type !== "subtask") return;
      const taskLeaf = nodesRef.current.find((n) => n.id === `task-${(node.data as { taskId: string }).taskId}`);
      const anchor = taskLeaf?.position ?? { x: 0, y: 0 };
      moveTaskNode(node.id, node.position.x - anchor.x, node.position.y - anchor.y);
    },
    []
  );

  const enrichedNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type === "column") {
          return { ...n, data: { ...n.data, adding: addingIn === (n.data as { columnId: string }).columnId, onAdd: handleAdd } };
        }
        if (n.type === "taskLeaf") {
          const taskId = (n.data as { taskId: string }).taskId;
          const task = tasks.find((t) => t.id === taskId);
          const column = columns.find((c) => c.id === task?.columnId);
          return {
            ...n,
            data: {
              ...n.data,
              onOpen: () => task && openLeaf(task, column?.title ?? ""),
              onAddSubtask,
            },
          };
        }
        if (n.type === "subtask") {
          return {
            ...n,
            data: { ...n.data, onToggleDone, onRename, onSetDueDate, onAddChild, onDelete },
          };
        }
        return n;
      }),
    [nodes, addingIn, handleAdd, tasks, columns, openLeaf, onAddSubtask, onToggleDone, onRename, onSetDueDate, onAddChild, onDelete]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
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
  nodesByTask: Record<string, MindNodeRow[]>;
}) {
  return (
    <ReactFlowProvider>
      <InnerTree {...props} />
    </ReactFlowProvider>
  );
}
