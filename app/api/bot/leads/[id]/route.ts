import { prisma } from "@/lib/prisma";
import { LEAD_STAGES, formatMoney } from "@/lib/constants";
import { updateLeadCore } from "@/lib/actions/leadsCore";
import { verifyBotSecret, resolveTelegramUser, botError } from "@/lib/bot/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const chatId = new URL(req.url).searchParams.get("chatId");
    await resolveTelegramUser(chatId);

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return Response.json({ error: "not_found" }, { status: 404 });

    return Response.json({
      lead: {
        id: lead.id,
        title: lead.title,
        company: lead.company,
        description: lead.description,
        contactName: lead.contactName,
        contact: lead.contact,
        stage: lead.stage,
        stageTitle: LEAD_STAGES.find((s) => s.id === lead.stage)?.title ?? lead.stage,
        prepay: Number(lead.prepay),
        postpay: Number(lead.postpay),
        monthlySub: Number(lead.monthlySub),
        expenses: Number(lead.expenses),
        notes: lead.notes,
        lost: lead.lost,
        lostReason: lead.lostReason,
        prepayLabel: formatMoney(lead.prepay),
        postpayLabel: formatMoney(lead.postpay),
      },
    });
  } catch (err) {
    return botError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    verifyBotSecret(req);
    const { id } = await params;
    const body = (await req.json()) as {
      chatId?: string | number;
      prepay?: number;
      postpay?: number;
      notes?: string;
    };
    const actor = await resolveTelegramUser(body.chatId != null ? String(body.chatId) : null);

    await updateLeadCore(actor, id, {
      prepay: body.prepay,
      postpay: body.postpay,
      notes: body.notes,
    });

    return Response.json({ status: "updated" });
  } catch (err) {
    return botError(err);
  }
}
