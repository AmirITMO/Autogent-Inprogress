import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { ensureAllSupportTransactions } from "@/lib/actions/leads";
import { AccountingView } from "./_components/AccountingView";

export default async function AccountingPage() {
  await requireAdmin();
  await ensureAllSupportTransactions();

  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany({
      include: { category: true, lead: true, createdBy: true },
      orderBy: { date: "asc" },
    }),
    prisma.transactionCategory.findMany(),
  ]);

  const serializedTx = transactions.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    type: t.type,
    description: t.description,
    date: t.date.toISOString(),
    categoryName: t.category.name,
    isRecurring: t.category.isRecurring,
    leadTitle: t.lead?.title ?? null,
    createdByName: t.createdBy.name,
  }));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    isRecurring: c.isRecurring,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Бухгалтерия</h1>
        <p className="text-sm text-muted">Касса, доходы и расходы бизнеса</p>
      </div>
      <AccountingView transactions={serializedTx} categories={serializedCategories} />
    </div>
  );
}
