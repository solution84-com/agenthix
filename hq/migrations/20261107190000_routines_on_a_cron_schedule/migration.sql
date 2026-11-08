-- CreateEnum
CREATE TYPE "RoutineRunState" AS ENUM ('STARTING', 'RUNNING', 'FINISHED', 'FAILED', 'STOPPED', 'SKIPPED');

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_routineId_fkey";

-- DropIndex
DROP INDEX "Routine_nextRoundAt_idx";

-- DropIndex
DROP INDEX "Task_routineId_idx";

-- AlterTable
ALTER TABLE "Routine" DROP COLUMN "assignedAgentId",
DROP COLUMN "boardId",
DROP COLUMN "column",
DROP COLUMN "description",
DROP COLUMN "labels",
DROP COLUMN "nextRoundAt",
DROP COLUMN "priority",
DROP COLUMN "scheduleAt",
DROP COLUMN "scheduleRule",
DROP COLUMN "scheduleTimezone",
ALTER COLUMN "cron" SET NOT NULL,
ALTER COLUMN "timezone" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "roundAt",
DROP COLUMN "routineId";

-- CreateTable
CREATE TABLE "RoutineRun" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "number" INTEGER,
    "dueAt" TIMESTAMP(3),
    "startedByUserId" TEXT,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "state" "RoutineRunState" NOT NULL,
    "reason" TEXT,
    "ask" TEXT,
    "sessionId" TEXT,
    "runId" TEXT,
    "siteId" TEXT,
    "timeLimitMinutes" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRun_sessionId_key" ON "RoutineRun"("sessionId");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_createdAt_idx" ON "RoutineRun"("routineId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_state_idx" ON "RoutineRun"("routineId", "state");

-- CreateIndex
CREATE INDEX "RoutineRun_runId_idx" ON "RoutineRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRun_routineId_number_key" ON "RoutineRun"("routineId", "number");

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

