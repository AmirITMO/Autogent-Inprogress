-- AlterTable
ALTER TABLE "User" ADD COLUMN     "editTasksSelf" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "viewAccounting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "viewChannels" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "editCrm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editTasksOthers" BOOLEAN NOT NULL DEFAULT false;
