import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CalendarView } from "./_components/CalendarView";

export default async function CalendarPage() {
  await requireUser();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(addMonths(now, 0));
  monthEnd.setDate(monthEnd.getDate() + 1); // включительно последний день

  const events = await prisma.calendarEvent.findMany({
    where: { startAt: { gte: monthStart, lt: monthEnd } },
    include: { createdBy: { select: { name: true } } },
    orderBy: { startAt: "asc" },
  });

  const serialized = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    createdByName: e.createdBy.name,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Календарь</h1>
        <p className="text-sm text-muted">Общие созвоны команды</p>
      </div>
      <CalendarView initialMonth={monthStart.toISOString()} initialEvents={serialized} />
    </div>
  );
}
