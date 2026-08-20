import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

const VALID_STATUSES = ["PENDING", "APPROVED", "IN_PROGRESS", "SENT", "SKIPPED", "FAILED"] as const;
type DraftStatus = (typeof VALID_STATUSES)[number];

// Push: бот находит новый пост в целевом канале, сам составляет черновик
// комментария и кладёт его сюда (upsert по channelId+externalId — id поста
// вида "<юзернейм_канала>:<message_id>", повторный обход того же поста не
// плодит дубликаты). Публикация — только после одобрения сотрудником, см.
// GET ниже.
export async function POST(req: Request) {
  try {
    verifyIntegrationApiKey(req, "TG_AUTOCOMMENT_AGENT_API_KEY");

    const body = (await req.json()) as {
      channelId?: string;
      externalId?: string;
      targetChannelUsername?: string;
      postLink?: string;
      postExcerpt?: string;
      draftComment?: string;
    };

    if (!body.channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }
    if (!body.externalId?.trim()) {
      return Response.json({ error: "externalId required" }, { status: 400 });
    }
    if (!body.targetChannelUsername?.trim()) {
      return Response.json({ error: "targetChannelUsername required" }, { status: 400 });
    }
    if (!body.postLink?.trim()) {
      return Response.json({ error: "postLink required" }, { status: 400 });
    }
    if (!body.draftComment?.trim()) {
      return Response.json({ error: "draftComment required" }, { status: 400 });
    }

    const channel = await prisma.trafficChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      return Response.json({ error: "unknown_channel" }, { status: 400 });
    }

    const data = {
      targetChannelUsername: body.targetChannelUsername,
      postLink: body.postLink,
      postExcerpt: body.postExcerpt,
      draftComment: body.draftComment,
    };

    const draft = await prisma.tgCommentDraft.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: body.externalId } },
      // Апдейт только полей контента — если сотрудник уже отредактировал/
      // одобрил черновик (status сдвинулся), повторный обход того же поста
      // ботом (ретрай/рестарт) не должен молча откатить его решение назад
      // в PENDING поверх APPROVED/SENT.
      update: data,
      create: { ...data, channelId: channel.id, externalId: body.externalId, status: "PENDING" },
    });

    return Response.json({ id: draft.id, status: draft.status });
  } catch (err) {
    return integrationError(err);
  }
}

// Pull: бот забирает одобренные сотрудником черновики, чтобы реально их
// опубликовать. Claim on read (тот же приём, что у Instagram/B2B-заданий) —
// выдача сразу переводит APPROVED в IN_PROGRESS, чтобы следующий цикл
// опроса не подобрал тот же черновик второй раз, пока предыдущая отправка
// ещё не завершилась.
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "TG_AUTOCOMMENT_AGENT_API_KEY");

    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status");
    if (!rawStatus?.trim()) {
      return Response.json({ error: "status required" }, { status: 400 });
    }
    const status = rawStatus.toUpperCase() as DraftStatus;
    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "invalid_status" }, { status: 400 });
    }

    const drafts = await prisma.tgCommentDraft.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (status === "APPROVED" && drafts.length > 0) {
      await prisma.tgCommentDraft.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: "IN_PROGRESS" },
      });
    }

    return Response.json({
      drafts: drafts.map((d) => ({
        id: d.id,
        channelId: d.channelId,
        targetChannelUsername: d.targetChannelUsername,
        postLink: d.postLink,
        draftComment: d.draftComment,
      })),
    });
  } catch (err) {
    return integrationError(err);
  }
}
