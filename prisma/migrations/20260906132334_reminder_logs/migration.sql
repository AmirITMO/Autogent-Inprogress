-- CreateEnum
CREATE TYPE "ReminderThreshold" AS ENUM ('H48', 'H24', 'H6', 'H1');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramDueTodaySentDate" TEXT;

-- CreateTable
CREATE TABLE "TaskDeadlineReminderLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "threshold" "ReminderThreshold" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDeadlineReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReminderLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "threshold" "ReminderThreshold" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskDeadlineReminderLog_taskId_threshold_key" ON "TaskDeadlineReminderLog"("taskId", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminderLog_eventId_threshold_key" ON "EventReminderLog"("eventId", "threshold");

-- AddForeignKey
ALTER TABLE "TaskDeadlineReminderLog" ADD CONSTRAINT "TaskDeadlineReminderLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderLog" ADD CONSTRAINT "EventReminderLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
