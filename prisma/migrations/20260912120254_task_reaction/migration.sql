-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_LIKED';

-- CreateTable
CREATE TABLE "TaskReaction" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskReaction_taskId_idx" ON "TaskReaction"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReaction_taskId_userId_key" ON "TaskReaction"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskReaction" ADD CONSTRAINT "TaskReaction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReaction" ADD CONSTRAINT "TaskReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
