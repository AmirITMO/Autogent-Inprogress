"use client";

import { useEffect, useState } from "react";
import { updateTask, deleteTask, addTaskComment, getTaskComments } from "@/lib/actions/tasks";
import { listTaskNodes } from "@/lib/actions/taskNodes";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, DONE_COLUMN_NAME } from "@/lib/constants";
import type { TaskCardData } from "./TaskCard";
import { TaskMindMap, type MindNodeRow } from "./TaskMindMap";

type Comment = {
  id: string;
  text: string;
  attachmentUrl: string | null;
  createdAt: Date;
  user: { name: string };
};

export function TaskModal({
  task,
  columnName,
  users,
  projects,
  onClose,
}: {
  task: TaskCardData;
  columnName: string;
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    assigneeId: task.assigneeId ?? "",
    priority: task.priority,
    isBug: task.isBug,
    estimateHours: task.estimateHours != null ? String(task.estimateHours) : "",
    projectId: (task as unknown as { projectId?: string }).projectId ?? "",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newAttachment, setNewAttachment] = useState("");
  const [nodes, setNodes] = useState<MindNodeRow[] | null>(null);

  useEffect(() => {
    getTaskComments(task.id).then((c) => setComments(c as unknown as Comment[]));
    listTaskNodes(task.id).then((rows) =>
      setNodes(
        rows.map((r) => ({
          id: r.id,
          parentId: r.parentId,
          title: r.title,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          done: r.done,
          x: r.x,
          y: r.y,
        }))
      )
    );
  }, [task.id]);

  async function handleSave() {
    setSaving(true);
    await updateTask(task.id, {
      title: form.title,
      description: form.description,
      assigneeId: form.assigneeId || null,
      priority: form.priority as "P0" | "P1" | "P2" | "P3",
      isBug: form.isBug,
      estimateHours: form.estimateHours ? Number(form.estimateHours) : null,
      projectId: form.projectId || null,
      dueDate: form.dueDate || null,
    });
    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (!confirm("Удалить задачу без возможности восстановления?")) return;
    await deleteTask(task.id);
    onClose();
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    const comment = await addTaskComment(task.id, newComment.trim(), newAttachment || undefined);
    setComments((c) => [...c, comment as unknown as Comment]);
    setNewComment("");
    setNewAttachment("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Задача</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        {/* Базовая информация — как легенда карты */}
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-transparent text-base font-semibold text-foreground outline-none"
          />
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Описание…"
            className="mt-1 w-full resize-none bg-transparent text-sm text-muted outline-none"
          />

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            <Field label="Проект">
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Исполнитель">
              <select
                value={form.assigneeId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Приоритет">
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дедлайн">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Оценка, ч">
              <input
                type="number"
                value={form.estimateHours}
                onChange={(e) => setForm((f) => ({ ...f, estimateHours: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Баг">
              <label className="flex h-full items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.isBug}
                  onChange={(e) => setForm((f) => ({ ...f, isBug: e.target.checked }))}
                />
                это баг
              </label>
            </Field>
          </div>

          <div className="mt-3 text-xs text-muted">Колонка: {columnName}</div>
        </div>

        <div className="mt-4 flex justify-between gap-2">
          <button
            onClick={handleDelete}
            className="rounded-lg px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
          >
            Удалить задачу
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>

        {/* Майнд-карта задачи */}
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium text-muted">
            Майнд-карта — разверните задачу на подзадачи
          </h3>
          {nodes ? (
            <TaskMindMap
              taskId={task.id}
              root={{
                title: form.title,
                dueDate: form.dueDate || null,
                done: columnName === DONE_COLUMN_NAME,
              }}
              nodes={nodes}
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-sm text-muted">
              Загрузка карты…
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium text-muted">Комментарии</h3>
          <div className="flex flex-col gap-2">
            {comments.map((c) => (
              <div key={c.id} className="text-xs text-muted">
                <span className="text-foreground">{c.user.name}</span>: {c.text}
                {c.attachmentUrl && (
                  <a
                    href={c.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-accent underline"
                  >
                    вложение
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Написать комментарий…"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
            <input
              value={newAttachment}
              onChange={(e) => setNewAttachment(e.target.value)}
              placeholder="Ссылка на файл (опц.)"
              className="w-40 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
            <button
              onClick={handleAddComment}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-border"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}
