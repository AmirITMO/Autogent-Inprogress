import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toMoscowParts } from "@/lib/moscowTime";
import { CalendarView } from "./_components/CalendarView";

export default async function CalendarPage() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(addMonths(now, 0));
  monthEnd.setDate(monthEnd.getDate() + 1); // включительно последний день

  const [events, users, personalDeadlineTasksRaw] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: monthStart, lt: monthEnd } },
      include: {
        createdBy: { select: { name: true } },
        attendees: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.user.findMany({
      where: { isBlocked: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Личные задачи текущего пользователя, чей диапазон [createdAt, dueDate]
    // пересекается с видимым месяцем — источник для линии дедлайна.
    prisma.task.findMany({
      where: {
        assigneeId: user.id,
        archived: false,
        dueDate: { not: null, gte: monthStart },
        createdAt: { lt: monthEnd },
      },
      select: { id: true, title: true, createdAt: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const monthStartKey = toMoscowParts(monthStart).dateKey;
  const personalDeadlineTasks = personalDeadlineTasksRaw.map((t) => {
    const createdKey = toMoscowParts(t.createdAt).dateKey;
    return {
      id: t.id,
      title: t.title,
      // Не рисуем линию из прошлого — начало клампится к первому дню месяца.
      startDate: createdKey > monthStartKey ? createdKey : monthStartKey,
      dueDate: toMoscowParts(t.dueDate!).dateKey,
    };
  });

  const serialized = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    createdByName: e.createdBy.name,
    attendees: e.attendees,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Календарь</h1>
        <p className="text-sm text-muted">Общие созвоны команды</p>
      </div>
      <CalendarView
        initialMonth={monthStart.toISOString()}
        initialEvents={serialized}
        users={users}
        initialPersonalDeadlineTasks={personalDeadlineTasks}
      />
    </div>
  );
}
