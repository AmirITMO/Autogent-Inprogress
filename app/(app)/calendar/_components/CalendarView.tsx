"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { ru } from "date-fns/locale";
import {
  listCalendarEvents,
  listPersonalDeadlineTasks,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/actions/calendar";
import { mskInputToUtcIso, toMoscowParts, addOneHour } from "@/lib/moscowTime";
import { chunkWeeks, weekSegment, colorForTaskId, type PersonalDeadlineTask } from "@/lib/calendar/deadlineLine";

type Attendee = { id: string; name: string; avatarUrl: string | null };
type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  createdByName: string;
  attendees: Attendee[];
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
// Больше линий в одной строке недели просто не помещаются в ячейку (min-h-92px)
// без наплыва на номер дня следующего ряда — остальные схлопываются в "+N ещё".
const MAX_DEADLINE_LINES_PER_WEEK = 3;

export function CalendarView({
  initialMonth,
  initialEvents,
  users,
  initialPersonalDeadlineTasks,
}: {
  initialMonth: string;
  initialEvents: CalEvent[];
  users: { id: string; name: string }[];
  initialPersonalDeadlineTasks: PersonalDeadlineTask[];
}) {
  const [monthCursor, setMonthCursor] = useState(() => new Date(initialMonth));
  const [events, setEvents] = useState(initialEvents);
  const [personalDeadlineTasks, setPersonalDeadlineTasks] = useState(initialPersonalDeadlineTasks);
  const [loading, setLoading] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);
  const weeks = useMemo(() => chunkWeeks(days), [days]);

  useEffect(() => {
    setLoading(true);
    const start = startOfMonth(monthCursor);
    const end = new Date(endOfMonth(monthCursor));
    end.setDate(end.getDate() + 1);
    Promise.all([
      listCalendarEvents(start.toISOString(), end.toISOString()),
      listPersonalDeadlineTasks(start.toISOString(), end.toISOString()),
    ])
      .then(([evs, tasks]) => {
        setEvents(evs);
        setPersonalDeadlineTasks(tasks);
      })
      .finally(() => setLoading(false));
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const key = toMoscowParts(e.startAt).dateKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  function refreshMonth() {
    const start = startOfMonth(monthCursor);
    const end = new Date(endOfMonth(monthCursor));
    end.setDate(end.getDate() + 1);
    listCalendarEvents(start.toISOString(), end.toISOString()).then(setEvents);
  }

  const today = new Date();

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthCursor((m) => subMonths(m, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
          >
            ‹
          </button>
          <h2 className="min-w-[160px] text-center text-sm font-semibold capitalize text-foreground">
            {format(monthCursor, "LLLL yyyy", { locale: ru })}
          </h2>
          <button
            onClick={() => setMonthCursor((m) => addMonths(m, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
          >
            ›
          </button>
          <button
            onClick={() => setMonthCursor(new Date())}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
          >
            Сегодня
          </button>
        </div>
        <button
          onClick={() => setModalDate(new Date())}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          + Созвон
        </button>
      </div>

      <div className={`mt-4 flex flex-col gap-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 pb-1 text-center text-xs font-medium text-muted">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => {
          const weekKeys = week.map((day) => format(day, "yyyy-MM-dd"));
          const deadlineSegments = personalDeadlineTasks.flatMap((task) => {
            const seg = weekSegment(weekKeys, task);
            return seg ? [{ task, ...seg }] : [];
          });
          return (
            <div key={weekIndex} className="relative grid grid-cols-7 gap-2">
              {week.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, monthCursor);
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={key}
                    onClick={() => setDayDetailDate(day)}
                    className={`group flex min-h-[92px] cursor-pointer flex-col gap-1 rounded-lg border p-1.5 transition hover:border-accent/50 ${
                      inMonth ? "border-border bg-surface" : "border-border/50 bg-surface-2/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs ${
                          isToday
                            ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-white"
                            : inMonth
                              ? "text-foreground"
                              : "text-muted/50"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      <span className="hidden text-xs text-accent group-hover:inline">+</span>
                    </div>
                    {dayEvents.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 px-0.5">
                        {dayEvents.slice(0, 5).map((ev) => (
                          <span key={ev.id} className="h-1.5 w-1.5 rounded-full bg-accent-2" title={ev.title} />
                        ))}
                        {dayEvents.length > 5 && (
                          <span className="text-[10px] text-muted">+{dayEvents.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Персональная линия дедлайна — растянута через ячейки недели, у нижнего
                  края (под чипами/кружками созвонов), не задевает номер дня. Число линий
                  в строке ограничено — иначе при большом количестве личных задач стек
                  вылезает за пределы ячейки и перекрывает номер дня. */}
              {deadlineSegments.slice(0, MAX_DEADLINE_LINES_PER_WEEK).map(({ task, startCol, endCol }, stackIndex) => {
                const span = endCol - startCol + 1;
                const color = colorForTaskId(task.id);
                return (
                  <div
                    key={task.id}
                    className="pointer-events-none absolute flex flex-col items-start overflow-hidden"
                    style={{
                      left: `calc(${startCol} * (100% + 0.5rem) / 7)`,
                      width: `calc((${span} * 100% - ${7 - span} * 0.5rem) / 7)`,
                      bottom: `${4 + stackIndex * 11}px`,
                    }}
                    title={`${task.title}: до ${task.dueDate}`}
                  >
                    <span className="max-w-full truncate text-[9px] leading-none" style={{ color }}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 h-[2px] w-full rounded-full" style={{ backgroundColor: color }} />
                  </div>
                );
              })}
              {deadlineSegments.length > MAX_DEADLINE_LINES_PER_WEEK && (
                <div
                  className="pointer-events-none absolute text-[9px] leading-none text-muted"
                  style={{ left: 0, bottom: `${4 + MAX_DEADLINE_LINES_PER_WEEK * 11}px` }}
                >
                  +{deadlineSegments.length - MAX_DEADLINE_LINES_PER_WEEK} ещё
                </div>
              )}
            </div>
          );
        })}
      </div>

      {dayDetailDate && (
        <DayDetailModal
          date={dayDetailDate}
          events={eventsByDay.get(format(dayDetailDate, "yyyy-MM-dd")) ?? []}
          onClose={() => setDayDetailDate(null)}
          onEdit={(ev) => {
            setDayDetailDate(null);
            setEditingEvent(ev);
          }}
          onCreateNew={() => {
            setDayDetailDate(null);
            setModalDate(dayDetailDate);
          }}
        />
      )}
      {modalDate && (
        <EventModal
          date={modalDate}
          users={users}
          onClose={() => setModalDate(null)}
          onSaved={() => {
            setModalDate(null);
            refreshMonth();
          }}
        />
      )}
      {editingEvent && (
        <EventModal
          date={new Date(editingEvent.startAt)}
          existing={editingEvent}
          users={users}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            refreshMonth();
          }}
        />
      )}
    </div>
  );
}

function DayDetailModal({
  date,
  events,
  onClose,
  onEdit,
  onCreateNew,
}: {
  date: Date;
  events: CalEvent[];
  onClose: () => void;
  onEdit: (ev: CalEvent) => void;
  onCreateNew: () => void;
}) {
  const sorted = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-foreground">
            {format(date, "d MMMM", { locale: ru })}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {sorted.length ? (
            sorted.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">
                    {toMoscowParts(ev.startAt).timeLabel}–{toMoscowParts(ev.endAt).timeLabel} {ev.title}
                  </div>
                  {ev.attendees.length > 0 && (
                    <div className="truncate text-xs text-muted">
                      {ev.attendees.map((a) => a.name).join(", ")}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onEdit(ev)}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
                >
                  Редактировать
                </button>
              </div>
            ))
          ) : (
            <div className="py-2 text-center text-sm text-muted">Созвонов нет</div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
            Закрыть
          </button>
          <button
            onClick={onCreateNew}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            + Новый созвон
          </button>
        </div>
      </div>
    </div>
  );
}

function EventModal({
  date,
  existing,
  users,
  onClose,
  onSaved,
}: {
  date: Date;
  existing?: CalEvent;
  users: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Для существующего события дата/время выводятся из его UTC-момента по московскому
  // времени, а не из локального часового пояса браузера — иначе при просмотре/
  // редактировании они бы "поплыли" на разницу с МСК.
  const dateStr = existing ? toMoscowParts(existing.startAt).dateKey : format(date, "yyyy-MM-dd");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startTime, setStartTime] = useState(
    existing ? toMoscowParts(existing.startAt).timeLabel : "10:00"
  );
  const [endTime, setEndTime] = useState(
    existing ? toMoscowParts(existing.endAt).timeLabel : addOneHour("10:00")
  );
  const [endTouched, setEndTouched] = useState(!!existing);
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    existing?.attendees.map((a) => a.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleAttendee(id: string) {
    setAttendeeIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    // Пока пользователь не трогал поле "Конец" вручную, конец всегда следует
    // за началом со сдвигом в час — удобнее, чем каждый раз выставлять руками.
    if (!endTouched) setEndTime(addOneHour(value));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const startAt = mskInputToUtcIso(dateStr, startTime);
    const endAt = mskInputToUtcIso(dateStr, endTime);
    const result = existing
      ? await updateCalendarEvent(existing.id, { title, description, startAt, endAt, attendeeIds })
      : await createCalendarEvent({ title, description, startAt, endAt, attendeeIds });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!existing || !confirm("Удалить созвон?")) return;
    await deleteCalendarEvent(existing.id);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {existing ? "Созвон" : "Новый созвон"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Название</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например, созвон по спринту"
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Дата</label>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm capitalize text-muted">
                {format(new Date(`${dateStr}T12:00:00`), "d MMMM", { locale: ru })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Начало</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Конец</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setEndTouched(true);
                }}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Описание</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="О чём созвон, ссылка на встречу и т.п."
              className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Участники</label>
            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const active = attendeeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAttendee(u.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      active
                        ? "border-accent-2 bg-accent-2/15 text-accent-2"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
          {existing && (
            <div className="text-[11px] text-muted">Создал: {existing.createdByName}</div>
          )}
          {error && <div className="text-xs text-danger">{error}</div>}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          {existing ? (
            <button onClick={handleDelete} className="rounded-lg px-3 py-1.5 text-xs text-danger hover:bg-danger/10">
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
