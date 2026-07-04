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
import type { TaskCardData } from "./TaskCard";

export type TreeTask = TaskCardData & { columnName: string };

const GROUP_STYLE = { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" };
const STATUS_STYLE: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  done: { bg: "#eafaf0", border: "#16a34a", text: "#166534" },
  overdue: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  pending: { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" },
};

function GroupNode({ id, data }: NodeProps) {
  const d = data as unknown as {
    label: string;
    count: number;
    creating: boolean;
    onAdd: (groupId: string) => void;
    onSubmit: (groupId: string, title: string) => void;
    onCancel: () => void;
  };
  const [title, setTitle] = useState("");

  return (
    <div
      className="group relative min-w-[160px] rounded-xl border-2 px-4 py-2 text-center font-medium shadow-sm"
      style={{ background: GROUP_STYLE.bg, borderColor: GROUP_STYLE.border, color: GROUP_STYLE.text }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm">{d.label}</div>
      <div className="text-[11px] text-muted">{d.count} задач</div>
      <Handle type="source" position={Position.Bottom} />

      {d.creating ? (
        <div className="mt-2 flex items-center gap-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) d.onSubmit(id, title.trim());
              if (e.key === "Escape") d.onCancel();
            }}
            placeholder="Название задачи"
            className="w-28 rounded border border-border bg-white px-1.5 py-1 text-xs text-foreground outline-none focus:border-accent"
          />
          <button
            onClick={() => title.trim() && d.onSubmit(id, title.trim())}
            className="rounded bg-accent px-1.5 py-1 text-xs font-medium text-white"
          >
            ОК
          </button>
        </div>
      ) : (
        <button
          onClick={() => d.onAdd(id)}
          title="Добавить задачу в эту ветку"
          className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-accent text-sm text-white group-hover:flex"
        >
          +
        </button>
      )}
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
      <div className="text-sm font-medium">{nd.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-80">
        <span style={{ color: TASK_PRIORITY_COLOR[nd.priority] }}>{nd.priority}</span>
        {nd.isBug && <span className="text-danger">баг</span>}
        {nd.dueDate && <span>до {new Date(nd.dueDate).toLocaleDateString("ru-RU")}</span>}
      </div>
    </button>
  );
}

const nodeTypes = { group: GroupNode, taskLeaf: TaskLeafNode };

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
  users,
  projects,
  defaultColumnId,
}: {
  tasks: TreeTask[];
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  defaultColumnId: string;
}) {
  const [activeTask, setActiveTask] = useState<TreeTask | null>(null);
  const [creatingGroup, setCreatingGroup] = useState<string | null>(null);

  const handleAdd = useCallback((groupId: string) => setCreatingGroup(groupId), []);
  const handleCancel = useCallback(() => setCreatingGroup(null), []);

  const handleSubmit = useCallback(
    async (groupId: string, title: string) => {
      // groupId is either "proj-<projectId|none>" or "proj-<projectId|none>-user-<userId|none>"
      const parts = groupId.split("-user-");
      const projPart = parts[0].replace(/^proj-/, "");
      const userPart = parts[1];

      await createTask({
        columnId: defaultColumnId,
        title,
        projectId: projPart !== "none" ? projPart : undefined,
        assigneeId: userPart && userPart !== "none" ? userPart : undefined,
      });
      setCreatingGroup(null);
    },
    [defaultColumnId]
  );

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [
      { id: "root", type: "group", data: { label: "Все задачи", count: tasks.length, creating: false }, position: { x: 0, y: 0 } },
    ];
    const edges: Edge[] = [];

    const byProject = new Map<string, { name: string; tasks: TreeTask[] }>();
    for (const t of tasks) {
      const key = t.projectId ?? "none";
      if (!byProject.has(key)) byProject.set(key, { name: t.projectName ?? "Без проекта", tasks: [] });
      byProject.get(key)!.tasks.push(t);
    }
    // Ensure at least the "no project" bucket exists so you can always add a task with no project.
    if (!byProject.has("none")) byProject.set("none", { name: "Без проекта", tasks: [] });

    for (const [projKey, projGroup] of byProject) {
      const projId = `proj-${projKey}`;
      nodes.push({
        id: projId,
        type: "group",
        data: { label: projGroup.name, count: projGroup.tasks.length, creating: creatingGroup === projId },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `e-root-${projId}`, source: "root", target: projId });

      const byAssignee = new Map<string, { name: string; tasks: TreeTask[] }>();
      for (const t of projGroup.tasks) {
        const key = t.assigneeId ?? "none";
        if (!byAssignee.has(key)) byAssignee.set(key, { name: t.assigneeName ?? "Без исполнителя", tasks: [] });
        byAssignee.get(key)!.tasks.push(t);
      }
      if (!byAssignee.has("none")) byAssignee.set("none", { name: "Без исполнителя", tasks: [] });

      for (const [userKey, userGroup] of byAssignee) {
        const assigneeId = `${projId}-user-${userKey}`;
        nodes.push({
          id: assigneeId,
          type: "group",
          data: { label: userGroup.name, count: userGroup.tasks.length, creating: creatingGroup === assigneeId },
          position: { x: 0, y: 0 },
        });
        edges.push({ id: `e-${projId}-${assigneeId}`, source: projId, target: assigneeId });

        for (const t of userGroup.tasks) {
          const taskNodeId = `task-${t.id}`;
          nodes.push({
            id: taskNodeId,
            type: "taskLeaf",
            data: {
              title: t.title,
              priority: t.priority,
              isBug: t.isBug,
              dueDate: t.dueDate,
              done: t.columnName === DONE_COLUMN_NAME,
              onOpen: () => setActiveTask(t),
            },
            position: { x: 0, y: 0 },
          });
          edges.push({ id: `e-${assigneeId}-${taskNodeId}`, source: assigneeId, target: taskNodeId });
        }
      }
    }

    const withCallbacks = nodes.map((n) =>
      n.type === "group"
        ? { ...n, data: { ...n.data, onAdd: handleAdd, onSubmit: handleSubmit, onCancel: handleCancel } }
        : n
    );

    return { nodes: layout(withCallbacks, edges), edges };
  }, [tasks, creatingGroup, handleAdd, handleSubmit, handleCancel]);

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
          columnName={activeTask.columnName}
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
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  defaultColumnId: string;
}) {
  return (
    <ReactFlowProvider>
      <InnerTree {...props} />
    </ReactFlowProvider>
  );
}
