"use client";

import { useMemo } from "react";
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

export type TreeTask = {
  id: string;
  title: string;
  priority: string;
  isBug: boolean;
  dueDate: string | null;
  columnName: string;
  projectName: string | null;
  assigneeName: string | null;
};

const GROUP_STYLE = { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" };
const STATUS_STYLE: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  done: { bg: "#eafaf0", border: "#16a34a", text: "#166534" },
  overdue: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  pending: { bg: "#ffffff", border: "#d8cfc2", text: "#17140f" },
};

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; count: number };
  return (
    <div
      className="rounded-xl border-2 px-4 py-2 text-center font-medium shadow-sm"
      style={{ background: GROUP_STYLE.bg, borderColor: GROUP_STYLE.border, color: GROUP_STYLE.text }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm">{d.label}</div>
      <div className="text-[11px] text-muted">{d.count} задач</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function TaskLeafNode({ data }: NodeProps) {
  const d = data as unknown as {
    title: string;
    priority: string;
    isBug: boolean;
    dueDate: string | null;
    done: boolean;
  };
  const status = statusOf({ dueDate: d.dueDate, done: d.done });
  const style = STATUS_STYLE[status];
  return (
    <div
      className="min-w-[180px] rounded-lg border-2 px-3 py-2 shadow-sm"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-sm font-medium">{d.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] opacity-80">
        <span style={{ color: TASK_PRIORITY_COLOR[d.priority] }}>{d.priority}</span>
        {d.isBug && <span className="text-danger">баг</span>}
        {d.dueDate && <span>до {new Date(d.dueDate).toLocaleDateString("ru-RU")}</span>}
      </div>
    </div>
  );
}

const nodeTypes = { group: GroupNode, taskLeaf: TaskLeafNode };

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 70 });

  for (const n of nodes) {
    g.setNode(n.id, { width: (n.data as { width?: number }).width ?? 190, height: 60 });
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

function InnerTree({ tasks }: { tasks: TreeTask[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [{ id: "root", type: "group", data: { label: "Все задачи", count: tasks.length }, position: { x: 0, y: 0 } }];
    const edges: Edge[] = [];

    const byProject = new Map<string, TreeTask[]>();
    for (const t of tasks) {
      const key = t.projectName ?? "Без проекта";
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(t);
    }

    for (const [projectName, projectTasks] of byProject) {
      const projId = `proj-${projectName}`;
      nodes.push({
        id: projId,
        type: "group",
        data: { label: projectName, count: projectTasks.length },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `e-root-${projId}`, source: "root", target: projId });

      const byAssignee = new Map<string, TreeTask[]>();
      for (const t of projectTasks) {
        const key = t.assigneeName ?? "Без исполнителя";
        if (!byAssignee.has(key)) byAssignee.set(key, []);
        byAssignee.get(key)!.push(t);
      }

      for (const [assigneeName, assigneeTasks] of byAssignee) {
        const assigneeId = `${projId}-user-${assigneeName}`;
        nodes.push({
          id: assigneeId,
          type: "group",
          data: { label: assigneeName, count: assigneeTasks.length },
          position: { x: 0, y: 0 },
        });
        edges.push({ id: `e-${projId}-${assigneeId}`, source: projId, target: assigneeId });

        for (const t of assigneeTasks) {
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
            },
            position: { x: 0, y: 0 },
          });
          edges.push({ id: `e-${assigneeId}-${taskNodeId}`, source: assigneeId, target: taskNodeId });
        }
      }
    }

    return { nodes: layout(nodes, edges), edges };
  }, [tasks]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#e8dfd3" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function TaskTree({ tasks }: { tasks: TreeTask[] }) {
  return (
    <ReactFlowProvider>
      <InnerTree tasks={tasks} />
    </ReactFlowProvider>
  );
}
