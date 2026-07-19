import { prisma } from "@/lib/prisma";
import { toMoscowParts } from "@/lib/moscowTime";
import { notifyUser } from "@/lib/notify";

async function notifyAttendees(title: string, startAt: Date, attendeeIds: string[], excludeUserId: string) {
  const toNotify = attendeeIds.filter((id) => id !== excludeUserId);
  if (toNotify.length === 0) return;
  const { dateKey, timeLabel } = toMoscowParts(startAt);
  const [y, m, d] = dateKey.split("-");
  await Promise.all(
    toNotify.map((userId) =>
      notifyUser({
        userId,
        type: "CALL_INVITED",
        title: `Вас позвали на созвон «${title}»`,
        body: `${d}.${m}.${y} в ${timeLabel} по МСК`,
        link: "/calendar",
      })
    )
  );
}

export async function createCalendarEventCore(
  actorId: string,
  data: { title: string; description?: string; startAt: string; endAt: string; attendeeIds?: string[] }
): Promise<{ error: string } | { error?: undefined; event: Awaited<ReturnType<typeof prisma.calendarEvent.create>> }> {
  if (!data.title.trim()) return { error: "Введите название созвона" };
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Некорректная дата или время" };
  }
  if (end <= start) return { error: "Окончание должно быть позже начала" };

  const created = await prisma.calendarEvent.create({
    data: {
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      startAt: start,
      endAt: end,
      createdById: actorId,
      attendees: data.attendeeIds?.length
        ? { connect: data.attendeeIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  if (data.attendeeIds?.length) {
    await notifyAttendees(created.title, created.startAt, data.attendeeIds, actorId);
  }

  return { event: created };
}
