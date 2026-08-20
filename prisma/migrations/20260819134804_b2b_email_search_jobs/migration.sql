-- CreateEnum
CREATE TYPE "B2bEmailJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "B2bEmailSearchJob" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "status" "B2bEmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bEmailSearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "B2bEmailSearchJob_channelId_status_idx" ON "B2bEmailSearchJob"("channelId", "status");

-- AddForeignKey
ALTER TABLE "B2bEmailSearchJob" ADD CONSTRAINT "B2bEmailSearchJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
