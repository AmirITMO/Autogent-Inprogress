import type { WebsiteContact } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

// Критично: сюда НЕ передаём contact/contactName/description — весь смысл переноса
// уведомлений в CRM в том, что ПДн из сайта не должны попадать текстом в Telegram.
// Ссылка ведёт на канал «Сайт», не на карточку сделки — сделки ещё нет, контакт
// становится сделкой только вручную (см. WebsiteDashboard/convertWebsiteContactToLead).
export async function notifyNewWebsiteContact(contact: WebsiteContact) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const { id: userId } of admins) {
    await notifyUser({
      userId,
      type: "NEW_LEAD",
      title: "Новый лид с сайта",
      body: contact.title,
      link: `/channels/${contact.channelId}`,
    });
  }
}
