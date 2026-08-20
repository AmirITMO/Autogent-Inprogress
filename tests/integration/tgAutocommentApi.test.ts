import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const API_KEY = "test-tg-autocomment-key";
process.env.TG_AUTOCOMMENT_AGENT_API_KEY = API_KEY;

const { POST: draftsPost, GET: draftsGet } = await import("@/app/api/integrations/tg-autocomment-agent/drafts/route");
const { POST: completePost } = await import("@/app/api/integrations/tg-autocomment-agent/drafts/[id]/complete/route");
const { GET: kbGet } = await import("@/app/api/integrations/tg-autocomment-agent/knowledge-base/route");

afterAll(() => {
  delete process.env.TG_AUTOCOMMENT_AGENT_API_KEY;
});

function postReq(url: string, body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function getReq(url: string, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new Request(url, { headers });
}

const DRAFTS_URL = "http://localhost/api/integrations/tg-autocomment-agent/drafts";

let channelId: string;

beforeEach(async () => {
  await prisma.tgCommentDraft.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый автокомментинг", type: "TG_AUTOCOMMENT" },
  });
  channelId = channel.id;
});

describe("POST /api/integrations/tg-autocomment-agent/drafts", () => {
  it("отклоняет запрос без X-Api-Key", async () => {
    const res = await draftsPost(postReq(DRAFTS_URL, { channelId }, null));
    expect(res.status).toBe(401);
  });

  it("требует обязательные поля", async () => {
    const res = await draftsPost(postReq(DRAFTS_URL, { channelId, externalId: "x" }));
    expect(res.status).toBe(400);
  });

  it("создаёт черновик в статусе PENDING", async () => {
    const res = await draftsPost(
      postReq(DRAFTS_URL, {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        postExcerpt: "Ищем подрядчика...",
        draftComment: "Добрый день! У нас есть решение под ваш запрос.",
      })
    );
    const body = await res.json();
    expect(body.status).toBe("PENDING");
  });

  // Регрессия по образцу InstagramContact upsert: повторный обход того же
  // поста ботом не должен откатывать решение сотрудника (APPROVED/SENT)
  // обратно в PENDING.
  it("апсерт по (channelId, externalId) не откатывает уже одобренный черновик в PENDING", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "старый текст",
        status: "APPROVED",
      },
    });

    await draftsPost(
      postReq(DRAFTS_URL, {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "новый текст от бота",
      })
    );

    const updated = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.status).toBe("APPROVED");
  });
});

describe("GET /api/integrations/tg-autocomment-agent/drafts", () => {
  it("claim on read: APPROVED переходит в IN_PROGRESS при выдаче", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "текст",
        status: "APPROVED",
      },
    });

    const first = await draftsGet(getReq(`${DRAFTS_URL}?status=approved`));
    expect((await first.json()).drafts).toHaveLength(1);

    const updated = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.status).toBe("IN_PROGRESS");

    const second = await draftsGet(getReq(`${DRAFTS_URL}?status=approved`));
    expect((await second.json()).drafts).toHaveLength(0);
  });

  it("не выдаёт PENDING-черновики по запросу approved", async () => {
    await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "текст",
        status: "PENDING",
      },
    });

    const res = await draftsGet(getReq(`${DRAFTS_URL}?status=approved`));
    expect((await res.json()).drafts).toEqual([]);
  });
});

describe("POST /api/integrations/tg-autocomment-agent/drafts/:id/complete", () => {
  it("помечает SENT без errorMessage и проставляет sentAt", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "текст",
        status: "IN_PROGRESS",
      },
    });

    const res = await completePost(postReq(`${DRAFTS_URL}/${draft.id}/complete`, {}), {
      params: Promise.resolve({ id: draft.id }),
    });
    const body = await res.json();
    expect(body.status).toBe("SENT");

    const updated = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.sentAt).not.toBeNull();
  });

  it("помечает FAILED, если передан errorMessage, даже пустой строкой", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "channel1:100",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/100",
        draftComment: "текст",
        status: "IN_PROGRESS",
      },
    });

    const res = await completePost(postReq(`${DRAFTS_URL}/${draft.id}/complete`, { errorMessage: "" }), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect((await res.json()).status).toBe("FAILED");
  });

  it("404 на неизвестный id", async () => {
    const res = await completePost(postReq(`${DRAFTS_URL}/ghost/complete`, {}), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/integrations/tg-autocomment-agent/knowledge-base", () => {
  it("отдаёт пустой content, если базы знаний ещё нет", async () => {
    const res = await kbGet(getReq(`http://localhost/api/integrations/tg-autocomment-agent/knowledge-base?channelId=${channelId}`));
    const body = await res.json();
    expect(body.content).toBe("");
  });
});
