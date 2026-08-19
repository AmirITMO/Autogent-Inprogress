"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { assertCanEditCrm } from "./leadsCore";

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_COUNT = 49;

// criteria.keywords обязателен и назван явно — scraper.py ищет именно по
// этому ключу. Свободная схема {type: "object"} без имён полей раньше
// давала модели свободу назвать ключ как угодно ("хэштеги", "hashtags" и
// т.п.), и парсинг молча находил 0 аккаунтов без единой ошибки где-либо.
const SAVE_PROFILE_TOOL = {
  type: "function",
  function: {
    name: "save_search_profile",
    description:
      "Сохраняет критерии целевого лида для поиска в Instagram, когда из ответов пользователя " +
      "собрано достаточно информации (ниша, гео, ключевые слова, исключения).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Короткое название профиля, например «Мебельщики СПб»." },
        criteria: {
          type: "object",
          properties: {
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "Ключевые слова/хэштеги для поиска (без решётки), минимум одно.",
            },
            niche: { type: "string", description: "Ниша/сфера бизнеса." },
            city: { type: "string", description: "Город/регион, если важен." },
            excludeIf: { type: "string", description: "Кого точно не считать целевым." },
          },
          required: ["keywords"],
        },
      },
      required: ["name", "criteria"],
    },
  },
} as const;

const CREATE_JOB_TOOL = {
  type: "function",
  function: {
    name: "create_scrape_job",
    description:
      "Запускает задание на парсинг — вызывай только после save_search_profile, когда " +
      "пользователь назвал число аккаунтов для поиска.",
    parameters: {
      type: "object",
      properties: { count: { type: "integer", description: "Сколько аккаунтов искать (меньше 50)." } },
      required: ["count"],
    },
  },
} as const;

function systemPrompt() {
  return `Ты помогаешь настроить поиск целевых Instagram-аккаунтов для холодной базы лидов. Задай сотруднику не больше 5 вопросов по одному за раз:
1. Кто целевой клиент (ниша/сфера бизнеса).
2. География, если важна.
3. Примерный размер аккаунта (подписчики) — если не важно, пропусти вопрос.
4. Ключевые слова/хэштеги для поиска.
5. Кого точно НЕ считать целевым (исключения).

Когда данных достаточно — вызови save_search_profile. Сразу после этого спроси, сколько аккаунтов искать (меньше 50), и как только пользователь назовёт число — вызови create_scrape_job.`;
}

type ChatMessage = { role: string; content: string; tool_call_id?: string; tool_calls?: unknown };

// См. lib/actions/agentKnowledgeBase.ts — прямые запросы на api.openai.com
// с российских IP получают 403 unsupported_country_region_territory,
// OPENAI_BASE_URL даёт подставить прокси/шлюз.
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
      // Follow-up после инструментов зовём БЕЗ tools: иначе модель может опять
      // ответить tool_call вместо текста, а мы читаем только .content — второй
      // вызов create_scrape_job/save_search_profile в follow-up тихо терялся бы.
      ...(withTools ? { tools: [SAVE_PROFILE_TOOL, CREATE_JOB_TOOL], tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API вернул ошибку ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function sendSearchSetupMessage(
  channelId: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  existingProfileId: string | null = null
): Promise<{ reply: string; profileSaved: boolean; profileId: string | null; jobId: string | null }> {
  try {
    return await sendSearchSetupMessageInner(channelId, history, userMessage, existingProfileId);
  } catch (err) {
    // См. lib/actions/agentKnowledgeBase.ts — необработанное исключение из
    // Server Action валит весь рендер страницы, даже если вызывающий код
    // формально оборачивает вызов в try/catch. Поэтому action никогда не
    // бросает наружу.
    console.error("sendSearchSetupMessage failed:", err);
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { reply: `⚠️ ${message}`, profileSaved: false, profileId: existingProfileId, jobId: null };
  }
}

async function sendSearchSetupMessageInner(
  channelId: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  // Возвращённый предыдущим вызовом profileId (если профиль уже сохранён
  // в этом диалоге) — клиент передаёт его обратно. Без этого сервер не мог
  // достоверно знать, к какому профилю привязать джоб, когда save_search_profile
  // и create_scrape_job вызываются в разных сообщениях (штатный случай:
  // модель сначала сохраняет профиль, следующим сообщением спрашивает
  // количество и только тогда получает ответ пользователя).
  existingProfileId: string | null = null
): Promise<{ reply: string; profileSaved: boolean; profileId: string | null; jobId: string | null }> {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);
  if (!userMessage.trim()) throw new Error("Пустое сообщение");

  const channel = await prisma.trafficChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Канал не найден");

  const validHistory = history.filter(
    (m): m is { role: "user" | "assistant"; content: string } =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...validHistory,
    { role: "user", content: userMessage },
  ];

  const completion = await callOpenAI(messages, true);
  const msg = completion.choices[0].message as {
    content: string | null;
    tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  };

  if (!msg.tool_calls?.length) {
    return { reply: msg.content ?? "Готово.", profileSaved: false, profileId: existingProfileId, jobId: null };
  }

  const followUp: ChatMessage[] = [...messages, { role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls }];
  let profileSaved = false;
  let savedProfileId: string | null = existingProfileId;
  let jobId: string | null = null;

  for (const call of msg.tool_calls) {
    if (call.function.name === "save_search_profile") {
      const args = JSON.parse(call.function.arguments) as { name: string; criteria: { keywords: string[] } };
      const profile = await prisma.instagramSearchProfile.create({
        data: { channelId, name: args.name, criteria: args.criteria },
      });
      savedProfileId = profile.id;
      profileSaved = true;
      followUp.push({ role: "tool", tool_call_id: call.id, content: `Профиль поиска «${args.name}» сохранён.` });
      continue;
    }

    if (call.function.name === "create_scrape_job") {
      const args = JSON.parse(call.function.arguments) as { count: number };

      if (!savedProfileId) {
        followUp.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Ошибка: профиль поиска ещё не сохранён, сначала уточни критерии.",
        });
      } else if (!Number.isInteger(args.count) || args.count <= 0 || args.count > MAX_COUNT) {
        followUp.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Ошибка: число аккаунтов должно быть от 1 до ${MAX_COUNT}, попроси пользователя назвать другое значение.`,
        });
      } else {
        const job = await prisma.instagramScrapeJob.create({
          data: { channelId, searchProfileId: savedProfileId, requestedCount: args.count },
        });
        jobId = job.id;
        followUp.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Задание создано, будет найдено до ${args.count} аккаунтов.`,
        });
      }
      continue;
    }

    // Каждому tool_call_id обязательно нужна пара role:"tool" в следующем
    // запросе, иначе OpenAI отклонит follow-up 400-й ошибкой целиком.
    followUp.push({ role: "tool", tool_call_id: call.id, content: "Неизвестный инструмент, игнорирую." });
  }

  const followUpCompletion = await callOpenAI(followUp, false);
  const reply = followUpCompletion.choices[0].message.content ?? "Готово.";

  if (jobId) revalidatePath(`/channels/${channelId}`);
  return { reply, profileSaved, profileId: savedProfileId, jobId };
}

export async function rerunSearchProfile(profileId: string, count: number): Promise<{ jobId: string }> {
  const user = await requireUser();
  await assertCanEditCrm(user.id, user.role);

  if (!Number.isInteger(count) || count <= 0 || count > MAX_COUNT) {
    throw new Error(`Число аккаунтов должно быть от 1 до ${MAX_COUNT}`);
  }

  const profile = await prisma.instagramSearchProfile.findUniqueOrThrow({ where: { id: profileId } });
  const job = await prisma.instagramScrapeJob.create({
    data: { channelId: profile.channelId, searchProfileId: profile.id, requestedCount: count },
  });

  revalidatePath(`/channels/${profile.channelId}`);
  return { jobId: job.id };
}
