-- DropIndex
DROP INDEX "Task_projectId_status_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "isEpic",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "TaskStatus";

