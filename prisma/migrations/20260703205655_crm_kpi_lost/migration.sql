-- AlterEnum
ALTER TYPE "LeadStage" ADD VALUE 'SUPPORT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lostReason" TEXT;

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_metricKey_key" ON "Kpi"("metricKey");
