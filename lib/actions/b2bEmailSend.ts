"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

// Никакого фиксированного провайдера — SMTP_* настраивается в env, работает
// с любым (Яндекс 360, свой домен, транзакционные сервисы через их SMTP-
// релей). Отправитель меняется правкой SMTP_FROM_EMAIL/SMTP_USER, без кода.
// Репутация/спам-фильтры — вопрос DNS (SPF/DKIM/DMARC на домене отправителя)
// и прогрева, это код решить не может, только не мешать.
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("SMTP не настроен на сервере CRM — обратитесь к администратору");
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function approveAndSendB2bEmail(
  contactId: string,
  editedMessage?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await approveAndSendB2bEmailInner(contactId, editedMessage);
  } catch (err) {
    // Тот же принцип, что у sendManagementMessage — Server Action никогда не
    // бросает наружу, только возвращает результат: необработанное исключение
    // здесь роняет весь рендер страницы генерик-баннером.
    console.error("approveAndSendB2bEmail failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

async function approveAndSendB2bEmailInner(
  contactId: string,
  editedMessage?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const contact = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contactId } });
  if (contact.status !== "FOUND") {
    throw new Error("Письмо уже отправлено или в другом статусе — обновите страницу");
  }
  if (!contact.contactEmail?.trim()) {
    throw new Error("У этой компании не найден email — отправить нечего");
  }
  const finalMessage = (editedMessage ?? contact.draftMessage ?? "").trim();
  if (!finalMessage) {
    throw new Error("Текст письма пустой");
  }

  // Двойной клик "Одобрить и отправить" — тот же класс гонки, что уронил
  // прод с "Пройти опрос по продукту" (см. agentKnowledgeBase.ts): проверка
  // статуса выше не атомарна сама по себе, два параллельных вызова могут
  // оба пройти её до того, как первый обновит запись. Атомарный
  // updateMany с condition в WHERE — единственная гарантия, что письмо
  // реально отправится только один раз, а не check-then-act в коде.
  const claim = await prisma.b2bEmailContact.updateMany({
    where: { id: contactId, status: "FOUND" },
    data: { status: "SENT", draftMessage: finalMessage, sentAt: new Date(), sentById: user.id },
  });
  if (claim.count === 0) {
    throw new Error("Письмо уже отправлено или в другом статусе — обновите страницу");
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  try {
    const transport = getTransport();
    await transport.sendMail({
      from: fromEmail,
      to: contact.contactEmail,
      subject: process.env.SMTP_DEFAULT_SUBJECT || "Предложение о сотрудничестве",
      text: finalMessage,
    });
  } catch (sendErr) {
    // Реальная отправка не удалась (SMTP не настроен/недоступен) — статус
    // уже занят как SENT атомарным claim'ом выше, откатываем его обратно,
    // иначе письмо навсегда останется помеченным отправленным, хотя не ушло.
    await prisma.b2bEmailContact
      .update({ where: { id: contactId }, data: { status: "FOUND" } })
      .catch(() => {});
    throw sendErr;
  }

  revalidatePath(`/channels/${contact.channelId}`);
  return { ok: true };
}

export async function declineB2bEmail(contactId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);
    const contact = await prisma.b2bEmailContact.findUniqueOrThrow({ where: { id: contactId } });
    const claim = await prisma.b2bEmailContact.updateMany({
      where: { id: contactId, status: "FOUND" },
      data: { status: "DECLINED" },
    });
    if (claim.count === 0) {
      throw new Error("Уже не в статусе черновика — обновите страницу");
    }
    revalidatePath(`/channels/${contact.channelId}`);
    return { ok: true };
  } catch (err) {
    console.error("declineB2bEmail failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

export async function requestB2bEmailSearch(channelId: string, count: number): Promise<{ jobId?: string; error?: string }> {
  try {
    const user = await requireUser();
    await assertCanEditCrm(user.id, user.role);
    if (!Number.isInteger(count) || count <= 0 || count > 49) {
      throw new Error("Число компаний должно быть от 1 до 49");
    }
    const channel = await prisma.trafficChannel.findUniqueOrThrow({ where: { id: channelId } });
    const job = await prisma.b2bEmailSearchJob.create({
      data: { channelId: channel.id, requestedCount: count },
    });
    revalidatePath(`/channels/${channelId}`);
    return { jobId: job.id };
  } catch (err) {
    console.error("requestB2bEmailSearch failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { error: message };
  }
}
