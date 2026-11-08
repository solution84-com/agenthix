-- AlterEnum
BEGIN;
CREATE TYPE "TaskRunState_new" AS ENUM ('RUN_NONE', 'RUN_QUEUED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED');
ALTER TABLE "Task" ALTER COLUMN "runState" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "runState" TYPE "TaskRunState_new" USING ("runState"::text::"TaskRunState_new");
ALTER TYPE "TaskRunState" RENAME TO "TaskRunState_old";
ALTER TYPE "TaskRunState_new" RENAME TO "TaskRunState";
DROP TYPE "TaskRunState_old";
ALTER TABLE "Task" ALTER COLUMN "runState" SET DEFAULT 'RUN_NONE';
COMMIT;

-- DropForeignKey
ALTER TABLE "AutomationStart" DROP CONSTRAINT "AutomationStart_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectAutomation" DROP CONSTRAINT "ProjectAutomation_projectId_fkey";

-- AlterTable
ALTER TABLE "Org" DROP COLUMN "automationAllowed",
DROP COLUMN "automationBatchSize",
DROP COLUMN "automationIntervalMinutes",
DROP COLUMN "automationQueueLimit",
DROP COLUMN "automationThrottle";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "agentSchedules" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "AutomationStart";

-- DropTable
DROP TABLE "ProjectAutomation";

