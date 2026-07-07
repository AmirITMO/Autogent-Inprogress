"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { toMoscowParts } from "@/lib/moscowTime";

const ATTENDEE_SELECT = { select: { id: true, name: true, avatarUrl: true } };

async function notifyAttendees(
  title: string,
  startAt: Date,
  attendeeIds: string[],
  excludeUserId: string
) {
  const toNotify = attendeeIds.filter((id) => id !== excludeUserId);
  if (toNotify.length === 0) return;
  const { dateKey, timeLabel } = toMoscowParts(startAt);
  const [y, m, d] = dateKey.split("-");
  await prisma.notification.createMany({
    data: toNotify.map((userId) => ({
      userId,
      type: "CALL_INVITED" as const,
      title: `Вас позвали на созвон «${title}»`,
      body: `${d}.${m}.${y} в ${timeLabel} по МСК`,
      link: "/calendar",
    })),
  });
}

export async function listCalendarEvents(monthStart: string, monthEnd: string) {
  await requireUser();
  const events = await prisma.calendarEvent.findMany({
    where: { startAt: { gte: new Date(monthStart), lt: new Date(monthEnd) } },
    include: { createdBy: { select: { name: true } }, attendees: ATTENDEE_SELECT },
    orderBy: { startAt: "asc" },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    createdByName: e.createdBy.name,
    attendees: e.attendees,
  }));
}

export async function createCalendarEvent(data: {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  attendeeIds?: string[];
}): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
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
      createdById: user.id,
      attendees: data.attendeeIds?.length
        ? { connect: data.attendeeIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  if (data.attendeeIds?.length) {
    await notifyAttendees(created.title, created.startAt, data.attendeeIds, user.id);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return {};
}

export async function updateCalendarEvent(
  id: string,
  data: { title: string; description?: string; startAt: string; endAt: string; attendeeIds?: string[] }
): Promise<{ error: string } | { error?: undefined }> {
  const user = await requireUser();
  if (!data.title.trim()) return { error: "Введите название созвона" };
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Некорректная дата или время" };
  }
  if (end <= start) return { error: "Окончание должно быть позже начала" };

  const before = await prisma.calendarEvent.findUniqueOrThrow({
    where: { id },
    include: { attendees: { select: { id: true } } },
  });
  const beforeIds = new Set(before.attendees.map((a) => a.id));
  const newAttendeeIds = (data.attendeeIds ?? []).filter((aid) => !beforeIds.has(aid));

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      startAt: start,
      endAt: end,
      attendees: { set: (data.attendeeIds ?? []).map((aid) => ({ id: aid })) },
    },
  });

  if (newAttendeeIds.length) {
    await notifyAttendees(updated.title, updated.startAt, newAttendeeIds, user.id);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteCalendarEvent(id: string) {
  await requireUser();
  await prisma.calendarEvent.delete({ where: { id } });
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}
