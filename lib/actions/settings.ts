"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

export async function updateSettings(data: {
  morningSummaryTime: string;
  eveningSummaryTime: string;
  deadlineCheckInterval: number;
  timezone: string;
}) {
  await requireAdmin();
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidatePath("/settings");
}
