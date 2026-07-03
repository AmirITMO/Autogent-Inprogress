"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

export async function setKpi(metricKey: string, target: number) {
  await requireAdmin();
  await prisma.kpi.upsert({
    where: { metricKey },
    update: { target },
    create: { metricKey, target },
  });
  revalidatePath("/dashboard");
}

export async function removeKpi(metricKey: string) {
  await requireAdmin();
  await prisma.kpi.delete({ where: { metricKey } }).catch(() => {});
  revalidatePath("/dashboard");
}
