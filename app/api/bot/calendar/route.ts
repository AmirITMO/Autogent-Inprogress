import { createCalendarEventCore } from "@/lib/actions/calendarCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function POST(req: Request) {
  try {
    verifyBotSecret(req);
    const body = (await req.json()) as {
      chatId?: string | number;
      title?: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      attendeeIds?: string[];
    };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    if (!body.title?.trim() || !body.startAt || !body.endAt) {
      return Response.json({ error: "title, startAt and endAt required" }, { status: 400 });
    }

    const result = await createCalendarEventCore(actor.id, {
      title: body.title,
      description: body.description,
      startAt: body.startAt,
      endAt: body.endAt,
      attendeeIds: body.attendeeIds,
    });
    if (result.error) return Response.json({ error: result.error }, { status: 400 });

    return Response.json({ id: result.event.id });
  } catch (err) {
    return botError(err);
  }
}
