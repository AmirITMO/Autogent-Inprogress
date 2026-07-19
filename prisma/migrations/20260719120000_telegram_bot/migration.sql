-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" BIGINT,
ADD COLUMN     "telegramUsername" TEXT,
ADD COLUMN     "telegramMorningSentDate" TEXT,
ADD COLUMN     "telegramEveningSentDate" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deadlineReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
