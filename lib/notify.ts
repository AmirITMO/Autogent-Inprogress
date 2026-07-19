import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { escapeHtml } from "@/lib/telegram/format";

// Единая точка создания уведомлений: пишет запись в БД (для колокольчика на
// сайте) и, если у пользователя привязан Telegram, тут же дублирует пушем —
// неважно, откуда пришло действие (сайт или сам бот).
export async function notifyUser(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  await prisma.notification.create({ data });

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { telegramChatId: true },
  });
  if (!user?.telegramChatId) return;

  const appUrl = process.env.APP_URL;
  const linkLine = data.link && appUrl ? `\n${appUrl}${data.link}` : "";
  const text = `🔔 <b>${escapeHtml(data.title)}</b>${data.body ? `\n${escapeHtml(data.body)}` : ""}${linkLine}`;
  await sendTelegramMessage(user.telegramChatId, text);
}
