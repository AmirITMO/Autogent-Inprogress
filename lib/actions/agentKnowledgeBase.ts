"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

const OPENAI_MODEL = "gpt-4o-mini";

const SAVE_CARD_TOOL = {
  type: "function",
  function: {
    name: "save_knowledge_card",
    description:
      "Сохраняет или обновляет ОДНУ тему базы знаний агента — вызывай, когда сотрудник просит " +
      "что-то изменить, добавить или убрать из правил/скриптов/позиционирования/критериев, либо " +
      "когда отвечаешь на вопрос интервью и нужно записать факт. Пиши ПОЛНЫЙ новый текст только " +
      "по этой теме — остальные темы базы знаний не трогай, они хранятся отдельно.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Короткое название темы, например «Кого не считать целевым» или «Скрипт первого контакта» — " +
            "по нему тема ищется повторно: если тема уже была, эта запись её ОБНОВЛЯЕТ, а не дублирует.",
        },
        content: { type: "string", description: "Полный текст по этой теме (markdown)." },
      },
      required: ["topic", "content"],
    },
  },
} as const;

// Персона и вопросы интервью зависят от типа канала — раньше промпт был
// захардкожен под скаута, из-за чего B2B email-канал на интервью получал
// текст "Скаут — это Telegram-юзербот..." и вёл диалог не по делу.
const CHANNEL_PERSONA: Record<string, { agentDescription: string; interviewQuestions: string[] }> = {
  SCOUT_TELEGRAM: {
    agentDescription:
      "ИИ-скаутом компании. Скаут — это Telegram-юзербот, который слушает рабочие группы, находит " +
      "целевые запросы клиентов и помечает их для сотрудника. В переписку сам не лезет — с найденным " +
      "контактом сотрудник связывается вручную, с отдельного рабочего аккаунта",
    interviewQuestions: [
      "Что продаём (продукт/услуга), кратко и по существу.",
      "Кто целевой клиент — какие запросы в чатах считать целевыми.",
      "Кого точно НЕ считать целевым (явные исключения).",
      "Наше позиционирование/УТП — чем мы лучше альтернатив.",
      "Как сотруднику вести первый контакт после находки скаута — сценарий/скрипт для ручного сообщения.",
    ],
  },
  B2B_EMAIL: {
    agentDescription:
      "B2B email-агентом. Агент парсит сайты компаний, подходящих под критерии, и составляет черновик " +
      "первого письма — сотрудник читает черновик в разделе «Спаршено» и сам решает, отправлять его как " +
      "есть, отредактировать или отклонить. Полностью автоматической отправки без одобрения нет",
    interviewQuestions: [
      "Что продаём (продукт/услуга), кратко и по существу.",
      "Какие компании целевые — отрасль, размер, гео.",
      "Кого точно НЕ считать целевым (явные исключения).",
      "Тон и длина письма — как должен звучать черновик.",
      "Что обязательно должно быть в первом письме — оффер, УТП, призыв к действию.",
    ],
  },
  TG_AUTOCOMMENT: {
    agentDescription:
      "агентом автокомментинга в чужих Telegram-каналах. Юзербот следит за постами в целевых каналах и " +
      "предлагает черновик комментария под каждый подходящий пост — сотрудник одобряет или правит текст " +
      "перед публикацией, без одобрения бот ничего не публикует",
    interviewQuestions: [
      "Что продаём (продукт/услуга), кратко и по существу.",
      "В каких каналах комментировать — темы/ниши или конкретные @юзернеймы каналов.",
      "Какой пост считать поводом для комментария, а какой пропускать.",
      "Тон комментария — экспертный совет, уточняющий вопрос, лёгкое упоминание продукта.",
      "Чего явно избегать в комментариях (прямая реклама, конкретные слова/темы, конкуренты).",
    ],
  },
};

const DEFAULT_PERSONA = {
  agentDescription: "агентом этого канала трафика",
  interviewQuestions: [
    "Что продаём (продукт/услуга), кратко и по существу.",
    "Кто целевой клиент.",
    "Кого точно НЕ считать целевым.",
    "Наше позиционирование/УТП.",
    "Как вести диалог и подводить к результату — сценарий/скрипт.",
  ],
};

function personaFor(channelType: string) {
  return CHANNEL_PERSONA[channelType] ?? DEFAULT_PERSONA;
}

function chatSystemPrompt(channelType: string, kbContext: string) {
  const persona = personaFor(channelType);
  return `Ты — ассистент по управлению ${persona.agentDescription}. Ты общаешься с сотрудником, который управляет этим агентом.

Твои задачи:
- Отвечать на вопросы о том, как сейчас настроен агент — это описано в базе знаний ниже, она разбита по темам с датой последнего обсуждения каждой.
- Если сотрудник просит что-то изменить, добавить или убрать — вызови save_knowledge_card с темой и её ПОЛНЫМ новым текстом. Обновляй только тему, которую сейчас обсуждаете, не трогай остальные. Коротко словами подтверди, что именно поменял.
- Не выдумывай факты о продукте, которых нет в базе знаний — если не знаешь, спроси у сотрудника.

Текущая база знаний агента (по темам):
---
${kbContext}
---`;
}

function interviewSystemPrompt(channelType: string, kbContext: string) {
  const persona = personaFor(channelType);
  const questions = persona.interviewQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Ты проводишь структурированное интервью с сотрудником, чтобы заполнить базу знаний ${persona.agentDescription} с нуля (или дополнить существующую). Задавай ПО ОДНОМУ вопросу за раз и жди ответа. Нужно выяснить как минимум:
${questions}

После каждого ответа сотрудника вызывай save_knowledge_card — заводи отдельную тему под каждый пункт (например тема "Продукт", "Целевой клиент", "Исключения" и т.д.), не пиши всё одной темой. Затем задавай следующий вопрос. Когда все пункты закрыты — сообщи, что интервью завершено, агент готов работать, и подведи итог, что записано.

Текущая база знаний агента (по темам):
---
${kbContext}
---`;
}

type ChatMessage = { role: string; content: string; tool_call_id?: string; tool_calls?: unknown };

// По умолчанию — настоящий OpenAI. Прямые запросы туда с российских IP
// получают 403 unsupported_country_region_territory (см. digest 1056835678
// в проде) — OPENAI_BASE_URL даёт подставить прокси/шлюз, тот же приём уже
// применяется в telegram_sales_agent/config.py (openai_base_url).
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");

async function callOpenAI(messages: ChatMessage[], withTools: boolean) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY не задан на сервере CRM — обратитесь к администратору");
  }

  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      ...(withTools ? { tools: [SAVE_CARD_TOOL], tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function formatCards(cards: { topic: string; content: string; discussedAt: Date }[]) {
  if (!cards.length) return "(пока пусто — сотрудник ещё не заполнял)";
  return cards
    .map(
      (c) =>
        `### ${c.topic} (обсуждали ${c.discussedAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })})\n${c.content}`
    )
    .join("\n\n");
}

// AgentKnowledgeBase.content пересобирается из карточек при каждом изменении
// и остаётся плоским текстом — внешние Python-агенты как читали один content
// через GET .../knowledge-base, так и продолжают читать, ничего не меняя у себя.
async function recomposeFlatKnowledgeBase(channelId: string) {
  const cards = await prisma.agentKnowledgeCard.findMany({
    where: { channelId },
    orderBy: { discussedAt: "asc" },
  });
  const content = formatCards(cards);
  try {
    await prisma.agentKnowledgeBase.upsert({
      where: { channelId },
      update: { content },
      create: { channelId, content },
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") throw err;
    await prisma.agentKnowledgeBase.update({ where: { channelId }, data: { content } });
  }
}

async function saveKnowledgeCard(channelId: string, topic: string, content: string) {
  const trimmedTopic = topic.trim().slice(0, 200);
  await prisma.agentKnowledgeCard.upsert({
    where: { channelId_topic: { channelId, topic: trimmedTopic } },
    update: { content, discussedAt: new Date() },
    create: { channelId, topic: trimmedTopic, content },
  });
  await recomposeFlatKnowledgeBase(channelId);
}

export async function getManagementState(channelId: string) {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  const [kb, cards, messages] = await Promise.all([
    prisma.agentKnowledgeBase.findUnique({ where: { channelId } }),
    prisma.agentKnowledgeCard.findMany({ where: { channelId }, orderBy: { discussedAt: "desc" } }),
    prisma.agentKbMessage.findMany({ where: { channelId }, orderBy: { createdAt: "asc" }, take: 200 }),
  ]);

  return {
    content: kb?.content ?? "",
    updatedAt: kb?.updatedAt?.toISOString() ?? null,
    cards: cards.map((c) => ({
      id: c.id,
      topic: c.topic,
      content: c.content,
      discussedAt: c.discussedAt.toISOString(),
    })),
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
): Promise<{ reply: string; kbUpdated: boolean }> {
  try {
    return await sendManagementMessageInner(channelId, userMessage, mode);
  } catch (err) {
    // Доказано на практике (403 от OpenAI из региона, digest 1056835678):
    // необработанное исключение из Server Action здесь валит весь рендер
    // страницы генерик-баннером "Server Components render", даже когда
    // вызывающий клиентский код формально оборачивает вызов в try/catch.
    // Поэтому action НИКОГДА не бросает наружу — только возвращает значение.
    console.error("sendManagementMessage failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { reply: `⚠️ ${message}`, kbUpdated: false };
  }
}

async function sendManagementMessageInner(
  channelId: string,
  userMessage: string,
  mode: "chat" | "interview"
): Promise<{ reply: string; kbUpdated: boolean }> {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);
  if (!userMessage.trim()) throw new Error("Пустое сообщение");

  const [channel, cards, recentHistory] = await Promise.all([
    prisma.trafficChannel.findUnique({ where: { id: channelId } }),
    prisma.agentKnowledgeCard.findMany({ where: { channelId }, orderBy: { discussedAt: "desc" } }),
    // desc+take, затем reverse — иначе take:40 с orderBy asc берёт САМЫЕ
    // СТАРЫЕ 40 сообщений навсегда, а не последние: после 40-го сообщения
    // модель перестаёт видеть весь недавний контекст диалога.
    prisma.agentKbMessage.findMany({ where: { channelId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  if (!channel) throw new Error("Канал не найден");
  const history = recentHistory.reverse();
  const kbContext = formatCards(cards);

  const systemPrompt =
    mode === "interview" ? interviewSystemPrompt(channel.type, kbContext) : chatSystemPrompt(channel.type, kbContext);

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
      if (call.function.name !== "save_knowledge_card") {
        followUp.push({ role: "tool", tool_call_id: call.id, content: "Неизвестный инструмент, игнорирую." });
        continue;
      }
      const args = JSON.parse(call.function.arguments) as { topic: string; content: string };
      await saveKnowledgeCard(channelId, args.topic, args.content);
      kbUpdated = true;
      followUp.push({ role: "tool", tool_call_id: call.id, content: `Тема «${args.topic}» сохранена.` });
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
