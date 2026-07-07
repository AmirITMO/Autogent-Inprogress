"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

const ATTENDEE_SELECT = { select: { id: true, name: true, avatarUrl: true } };

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

  await prisma.calendarEvent.create({
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

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return {};
}

export async function updateCalendarEvent(
  id: string,
  data: { title: string; description?: string; startAt: string; endAt: string; attendeeIds?: string[] }
): Promise<{ error: string } | { error?: undefined }> {
  await requireUser();
  if (!data.title.trim()) return { error: "Введите название созвона" };
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Некорректная дата или время" };
  }
  if (end <= start) return { error: "Окончание должно быть позже начала" };

  await prisma.calendarEvent.update({
    where: { id },
    data: {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      startAt: start,
      endAt: end,
      attendees: { set: (data.attendeeIds ?? []).map((id) => ({ id })) },
    },
  });

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
