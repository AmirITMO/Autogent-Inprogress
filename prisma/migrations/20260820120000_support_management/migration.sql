-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_ALERT';

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('UNKNOWN', 'OK', 'DEGRADED', 'DOWN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "viewSupport" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportedDeployment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "serverHost" TEXT,
    "services" TEXT[],
    "runbook" TEXT,
    "heartbeatToken" TEXT NOT NULL,
    "heartbeatEverySeconds" INTEGER NOT NULL DEFAULT 300,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastStatusDetail" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportedDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportIncident" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "severity" "TaskPriority" NOT NULL DEFAULT 'P1',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "autoDetected" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "rootCause" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportedDeployment_leadId_key" ON "SupportedDeployment"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportedDeployment_heartbeatToken_key" ON "SupportedDeployment"("heartbeatToken");

-- CreateIndex
CREATE INDEX "SupportedDeployment_status_idx" ON "SupportedDeployment"("status");

-- CreateIndex
CREATE INDEX "SupportIncident_deploymentId_resolvedAt_idx" ON "SupportIncident"("deploymentId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "SupportedDeployment" ADD CONSTRAINT "SupportedDeployment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportedDeployment" ADD CONSTRAINT "SupportedDeployment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIncident" ADD CONSTRAINT "SupportIncident_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "SupportedDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIncident" ADD CONSTRAINT "SupportIncident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
