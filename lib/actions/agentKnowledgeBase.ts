"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

const OPENAI_MODEL = "gpt-4o-mini";

const UPDATE_KB_TOOL = {
  type: "function",
  function: {
    name: "update_knowledge_base",
    description:
      "Полностью заменяет базу знаний агента новой версией. Вызывай, когда сотрудник просит " +
      "что-то изменить, добавить или убрать из правил/скриптов/позиционирования/критериев " +
      "целевых сообщений, либо когда отвечаешь на вопрос интервью и нужно записать факт.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "Полный новый текст базы знаний (markdown) — сохрани всё, что не менялось, примени изменение.",
        },
        change_summary: { type: "string", description: "Короткое описание, что именно изменилось." },
      },
      required: ["content", "change_summary"],
    },
  },
} as const;

function chatSystemPrompt(kbContent: string) {
  return `Ты — ассистент по управлению ИИ-скаутом компании. Скаут — это Telegram-юзербот, который слушает рабочие группы, находит целевые запросы клиентов и предлагает продукт. Ты общаешься с сотрудником, который управляет этим агентом.

Твои задачи:
- Отвечать на вопросы о том, как сейчас настроен скаут: какие сообщения он считает целевыми, что и как отвечает, как ведёт переписку и подводит к созвону — это описано в базе знаний ниже.
- Если сотрудник просит что-то изменить (например «не пиши тем, кто ищет мебель» или «добавь новую услугу») — вызови update_knowledge_base с ПОЛНЫМ новым текстом базы знаний (сохрани всё, что не менялось, примени изменение), и коротко словами подтверди, что именно поменял.
- Не выдумывай факты о продукте, которых нет в базе знаний — если не знаешь, спроси у сотрудника.

Текущая база знаний скаута:
---
${kbContent || "(пока пусто — сотрудник ещё не заполнял)"}
---`;
}

function interviewSystemPrompt(kbContent: string) {
  return `Ты проводишь структурированное интервью с сотрудником, чтобы заполнить базу знаний ИИ-скаута с нуля (или дополнить существующую). Задавай ПО ОДНОМУ вопросу за раз и жди ответа. Нужно выяснить как минимум:
1. Что продаём (продукт/услуга), кратко и по существу.
2. Кто целевой клиент — какие запросы в чатах считать целевыми.
3. Кого точно НЕ считать целевым (явные исключения).
4. Наше позиционирование/УТП — чем мы лучше альтернатив.
5. Как вести диалог и подводить к созвону — сценарий/скрипт.

После каждого ответа сотрудника вызывай update_knowledge_base, дописывая полученную информацию (сохраняя всё, что уже было записано), и затем задавай следующий вопрос. Когда все пункты закрыты — сообщи, что интервью завершено, агент готов работать, и подведи итог, что записано.

Текущая база знаний скаута:
---
${kbContent || "(пока пусто)"}
---`;
}

type ChatMessage = { role: string; content: string; tool_call_id?: string; tool_calls?: unknown };

async function callOpenAI(messages: ChatMessage[], withTools: boolean) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY не задан на сервере CRM — обратитесь к администратору");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      ...(withTools ? { tools: [UPDATE_KB_TOOL], tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function getManagementState(channelId: string) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const [kb, messages] = await Promise.all([
    prisma.agentKnowledgeBase.findUnique({ where: { channelId } }),
    prisma.agentKbMessage.findMany({ where: { channelId }, orderBy: { createdAt: "asc" }, take: 200 }),
  ]);

  return {
    content: kb?.content ?? "",
    updatedAt: kb?.updatedAt?.toISOString() ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function sendManagementMessage(
  channelId: string,
  userMessage: string,
  mode: "chat" | "interview" = "chat"
) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);
  if (!userMessage.trim()) throw new Error("Пустое сообщение");

  const [kb, recentHistory] = await Promise.all([
    prisma.agentKnowledgeBase.findUnique({ where: { channelId } }),
    // desc+take, затем reverse — иначе take:40 с orderBy asc берёт САМЫЕ
    // СТАРЫЕ 40 сообщений навсегда, а не последние: после 40-го сообщения
    // модель перестаёт видеть весь недавний контекст диалога.
    prisma.agentKbMessage.findMany({ where: { channelId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const history = recentHistory.reverse();

  const systemPrompt =
    mode === "interview" ? interviewSystemPrompt(kb?.content ?? "") : chatSystemPrompt(kb?.content ?? "");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  await prisma.agentKbMessage.create({ data: { channelId, role: "user", content: userMessage } });

  const completion = await callOpenAI(messages, true);
  const msg = completion.choices[0].message as {
    content: string | null;
    tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  };

  let assistantText: string;
  let kbUpdated = false;

  if (msg.tool_calls?.length) {
    const followUp: ChatMessage[] = [...messages, { role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls }];

    for (const call of msg.tool_calls) {
      // Каждому tool_call_id из ответа модели ОБЯЗАТЕЛЬНО нужна пара role:"tool"
      // в следующем запросе — иначе OpenAI отклонит весь follow-up 400-й ошибкой.
      // Поэтому даже нераспознанный вызов получает ответ, а не молча пропускается.
      if (call.function.name !== "update_knowledge_base") {
        followUp.push({ role: "tool", tool_call_id: call.id, content: "Неизвестный инструмент, игнорирую." });
        continue;
      }
      const args = JSON.parse(call.function.arguments) as { content: string; change_summary: string };
      await prisma.agentKnowledgeBase.upsert({
        where: { channelId },
        update: { content: args.content },
        create: { channelId, content: args.content },
      });
      kbUpdated = true;
      followUp.push({ role: "tool", tool_call_id: call.id, content: `Обновлено. ${args.change_summary}` });
    }

    const followUpCompletion = await callOpenAI(followUp, false);
    assistantText = followUpCompletion.choices[0].message.content ?? "Готово.";
  } else {
    assistantText = msg.content ?? "Готово.";
  }

  await prisma.agentKbMessage.create({ data: { channelId, role: "assistant", content: assistantText } });

  revalidatePath(`/channels/${channelId}`);
  return { reply: assistantText, kbUpdated };
}
