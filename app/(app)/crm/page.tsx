import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { CrmBoard } from "./_components/Board";

export default async function CrmPage() {
  await requireUser();

  const leads = await prisma.lead.findMany({
    include: { owner: true },
    orderBy: { order: "asc" },
  });

  const serialized = leads.map((l) => ({
    id: l.id,
    title: l.title,
    company: l.company,
    contact: l.contact,
    link: l.link,
    stage: l.stage,
    prepay: Number(l.prepay),
    postpay: Number(l.postpay),
    monthlySub: Number(l.monthlySub),
    expenses: Number(l.expenses),
    notes: l.notes,
    order: l.order,
    ownerName: l.owner.name,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">CRM</h1>
        <p className="text-sm text-muted">Воронка сделок команды</p>
      </div>
      <CrmBoard initialLeads={serialized} />
    </div>
  );
}
