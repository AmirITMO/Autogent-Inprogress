"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, getPermissions } from "@/lib/roles";
import { notifyAboutIncident } from "@/lib/support/incidents";
import type { TaskPriority } from "@prisma/client";

async function requireSupportAccess() {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const perms = await getPermissions(user.id, user.role);
  if (!perms.viewSupport) throw new Error("Forbidden");
  return user;
}

function newHeartbeatToken() {
  return randomBytes(24).toString("hex");
}

export async function listDeployments() {
  await requireSupportAccess();
  const deployments = await prisma.supportedDeployment.findMany({
    include: {
      lead: { select: { id: true, title: true, company: true, stage: true } },
      assignedTo: { select: { id: true, name: true } },
      incidents: { where: { resolvedAt: null }, select: { id: true, severity: true } },
    },
    orderBy: [{ status: "desc" }, { lastHeartbeatAt: "asc" }],
  });
  return deployments;
}

// Лиды, которые уже дошли до поддержки/постоплаты, но за ними ещё не
// заведён мониторинг — источник для формы "Добавить проект".
export async function listEligibleLeads() {
  await requireSupportAccess();
  return prisma.lead.findMany({
    where: { stage: { in: ["SUPPORT", "POSTPAY"] }, supportedDeployment: null },
    select: { id: true, title: true, company: true, stage: true },
    orderBy: { title: "asc" },
  });
}

export async function listSupportAssignees() {
  await requireSupportAccess();
  return prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getDeployment(id: string) {
  await requireSupportAccess();
  return prisma.supportedDeployment.findUniqueOrThrow({
    where: { id },
    include: {
      lead: { select: { id: true, title: true, company: true, stage: true } },
      assignedTo: { select: { id: true, name: true } },
      incidents: {
        orderBy: { detectedAt: "desc" },
        include: { resolvedBy: { select: { name: true } } },
      },
    },
  });
}

export async function createDeployment(data: {
  leadId: string;
  serverHost?: string;
  services: string[];
  runbook?: string;
  heartbeatEverySeconds?: number;
  assignedToId?: string;
}) {
  await requireSupportAccess();
  const deployment = await prisma.supportedDeployment.create({
    data: {
      leadId: data.leadId,
      serverHost: data.serverHost || undefined,
      services: data.services,
      runbook: data.runbook || undefined,
      heartbeatEverySeconds: data.heartbeatEverySeconds || 300,
      assignedToId: data.assignedToId || undefined,
      heartbeatToken: newHeartbeatToken(),
    },
  });
  revalidatePath("/support");
  return deployment;
}

export async function updateDeployment(
  id: string,
  data: {
    serverHost?: string | null;
    services?: string[];
    runbook?: string | null;
    heartbeatEverySeconds?: number;
    assignedToId?: string | null;
  }
) {
  await requireSupportAccess();
  await prisma.supportedDeployment.update({ where: { id }, data });
  revalidatePath("/support");
  revalidatePath(`/support/${id}`);
}

export async function regenerateHeartbeatToken(id: string) {
  await requireSupportAccess();
  const token = newHeartbeatToken();
  await prisma.supportedDeployment.update({ where: { id }, data: { heartbeatToken: token } });
  revalidatePath(`/support/${id}`);
  return token;
}

export async function createIncident(
  deploymentId: string,
  data: { title: string; detail?: string; severity?: TaskPriority }
) {
  const actor = await requireSupportAccess();
  const deployment = await prisma.supportedDeployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { id: true, assignedToId: true, lead: { select: { title: true } } },
  });

  await prisma.supportIncident.create({
    data: {
      deploymentId,
      title: data.title,
      detail: data.detail || undefined,
      severity: data.severity ?? "P1",
    },
  });

  await notifyAboutIncident(deployment, data.title, actor.id);
  revalidatePath(`/support/${deploymentId}`);
  revalidatePath("/support");
}

export async function resolveIncident(incidentId: string, rootCause?: string) {
  const actor = await requireSupportAccess();
  const incident = await prisma.supportIncident.update({
    where: { id: incidentId },
    data: { resolvedAt: new Date(), resolvedById: actor.id, rootCause: rootCause || undefined },
  });
  revalidatePath(`/support/${incident.deploymentId}`);
  revalidatePath("/support");
}
