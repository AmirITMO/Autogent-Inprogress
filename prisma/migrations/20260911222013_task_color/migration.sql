-- CreateEnum
CREATE TYPE "TaskColor" AS ENUM ('ROSE', 'PEACH', 'AMBER', 'MINT', 'TEAL', 'SKY', 'LAVENDER', 'SLATE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "color" "TaskColor";
