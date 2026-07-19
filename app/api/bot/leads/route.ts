import { prisma } from "@/lib/prisma";
import type { LeadStageId } from "@/lib/constants";
import { LEAD_STAGES } from "@/lib/constants";
import { createLeadCore } from "@/lib/actions/leadsCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

const PAGE_SIZE = 5;

export async function GET(req: Request) {
  try {
    verifyBotSecret(req);
    const url = new URL(req.url);
    const chatId = url.searchParams.get("chatId");
    const stage = url.searchParams.get("stage") as LeadStageId | null;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    await resolveTelegramUser(chatId);

    if (!stage || !LEAD_STAGES.some((s) => s.id === stage)) {
      return Response.json({ error: "invalid_stage" }, { status: 400 });
    }

    const where = { stage, lost: false };
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { order: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return Response.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      leads: leads.map((l) => ({ id: l.id, title: l.title, company: l.company })),
    });
  } catch (err) {
    return botError(err);
  }
}

export async function POST(req: Request) {
  try {
    verifyBotSecret(req);
    const body = (await req.json()) as {
      chatId?: string | number;
      title?: string;
      company?: string;
      description?: string;
      contactName?: string;
      contact?: string;
    };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    if (!body.title?.trim()) {
      return Response.json({ error: "title required" }, { status: 400 });
    }

    const lead = await createLeadCore(actor, {
      title: body.title.trim(),
      company: body.company,
      description: body.description,
      contactName: body.contactName,
      contact: body.contact,
    });

    return Response.json({ id: lead.id, title: lead.title });
  } catch (err) {
    return botError(err);
  }
}
