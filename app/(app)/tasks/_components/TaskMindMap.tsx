"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createTaskNode,
  updateTaskNode,
  deleteTaskNode,
  moveTaskNode,
} from "@/lib/actions/taskNodes";
import { statusOf, type NodeStatus } from "@/lib/taskNodeStatus";

export type MindNodeRow = {
  id: string;
  parentId: string | null;
  title: string;
  dueDate: string | null;
  done: boolean;
  x: number;
  y: number;
};

const STATUS_STYLE: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  done: { bg: "#eafaf0", border: "#16a34a", text: "#166534" },
  overdue: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  pending: { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" },
};

type MindNodeData = {
  title: string;
  dueDate: string | null;
  done: boolean;
  isRoot: boolean;
  onToggleDone: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSetDueDate: (id: string, date: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
};

function MindNodeView({ id, data }: NodeProps) {
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
      {!d.isRoot && <Handle type="target" position={Position.Top} />}
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
          className="w-full rounded border border-border bg-white px-1 py-0.5 text-sm text-foreground outline-none"
        />
      ) : (
        <div
          onDoubleClick={() => !d.isRoot && setEditing(true)}
          className="text-sm font-medium"
        >
          {d.title}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-[11px] opacity-80">
        {!d.isRoot && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={d.done}
              onChange={() => d.onToggleDone(id)}
            />
            готово
          </label>
        )}
        <input
          type="date"
          value={d.dueDate ? d.dueDate.slice(0, 10) : ""}
          onChange={(e) => d.onSetDueDate(id, e.target.value)}
          className="rounded border border-transparent bg-transparent text-[11px] outline-none hover:border-border"
        />
      </div>

      <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
        <button
          onClick={() => d.onAddChild(id)}
          title="Добавить подзадачу"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-white"
        >
          +
        </button>
        {!d.isRoot && (
          <button
            onClick={() => d.onDelete(id)}
            title="Удалить"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { mindNode: MindNodeView };

function InnerMindMap({
  taskId,
  root,
  nodes: initialRows,
}: {
  taskId: string;
  root: { title: string; dueDate: string | null; done: boolean };
  nodes: MindNodeRow[];
}) {
  const toFlowNode = useCallback(
    (row: { id: string; parentId: string | null; title: string; dueDate: string | null; done: boolean; x: number; y: number; isRoot?: boolean }): Node => ({
      id: row.id,
      type: "mindNode",
      position: { x: row.x, y: row.y },
      data: {
        title: row.title,
        dueDate: row.dueDate,
        done: row.done,
        isRoot: !!row.isRoot,
      },
    }),
    []
  );

  const initialFlowNodes = useMemo(() => {
    const rootNode = toFlowNode({
      id: "root",
      parentId: null,
      title: root.title,
      dueDate: root.dueDate,
      done: root.done,
      x: 0,
      y: 0,
      isRoot: true,
    });
    return [rootNode, ...initialRows.map(toFlowNode)];
  }, [initialRows, root, toFlowNode]);

  const initialFlowEdges = useMemo<Edge[]>(
    () =>
      initialRows.map((n) => ({
        id: `e-${n.parentId ?? "root"}-${n.id}`,
        source: n.parentId ?? "root",
        target: n.id,
      })),
    [initialRows]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlowNodes);
  const [edges, setEdges] = useEdgesState(initialFlowEdges);

  const patchData = useCallback(
    (id: string, patch: Partial<MindNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [setNodes]
  );

  const onToggleDone = useCallback(
    (id: string) => {
      setNodes((nds) => {
        const target = nds.find((n) => n.id === id);
        const newDone = !(target?.data as unknown as MindNodeData)?.done;
        updateTaskNode(id, { done: newDone });
        return nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, done: newDone } } : n
        );
      });
    },
    [setNodes]
  );

  const onRename = useCallback(
    (id: string, title: string) => {
      patchData(id, { title });
      if (id !== "root") updateTaskNode(id, { title });
    },
    [patchData]
  );

  const onSetDueDate = useCallback(
    (id: string, date: string) => {
      patchData(id, { dueDate: date || null });
      if (id !== "root") updateTaskNode(id, { dueDate: date || null });
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
    async (parentId: string) => {
      const parent = nodes.find((n) => n.id === parentId);
      const siblingCount = edges.filter((e) => e.source === parentId).length;
      const x = (parent?.position.x ?? 0) + siblingCount * 200 - 100;
      const y = (parent?.position.y ?? 0) + 160;

      const created = await createTaskNode({
        taskId,
        parentId: parentId === "root" ? null : parentId,
        title: "Новая подзадача",
        x,
        y,
      });

      setNodes((nds) => [
        ...nds,
        toFlowNode({
          id: created.id,
          parentId: parentId === "root" ? null : parentId,
          title: created.title,
          dueDate: null,
          done: false,
          x,
          y,
        }),
      ]);
      setEdges((eds) => [...eds, { id: `e-${parentId}-${created.id}`, source: parentId, target: created.id }]);
    },
    [nodes, edges, taskId, toFlowNode, setNodes, setEdges]
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === "root") return;
      moveTaskNode(node.id, node.position.x, node.position.y);
    },
    []
  );

  const enrichedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onToggleDone,
          onRename,
          onSetDueDate,
          onAddChild,
          onDelete,
        },
      })),
    [nodes, onToggleDone, onRename, onSetDueDate, onAddChild, onDelete]
  );

  return (
    <div className="h-[420px] w-full rounded-xl border border-border bg-surface-2">
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={() => {}}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e8dfd3" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function TaskMindMap(props: {
  taskId: string;
  root: { title: string; dueDate: string | null; done: boolean };
  nodes: MindNodeRow[];
}) {
  return (
    <ReactFlowProvider>
      <InnerMindMap {...props} />
    </ReactFlowProvider>
  );
}
