-- CreateEnum
CREATE TYPE "TaskActivityKind" AS ENUM ('CREATED', 'EDITED', 'MOVED', 'ASSIGNED', 'RUN_STARTED', 'RUN_FINISHED', 'RUN_FAILED', 'RUN_STOPPED', 'APPROVED', 'DENIED', 'COMMENTED', 'ARCHIVED', 'UNARCHIVED');

-- AlterTable
ALTER TABLE "RunResult" ADD COLUMN     "number" INTEGER;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "result",
ADD COLUMN     "runCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "TaskActivityKind" NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "runId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskActivity_runId_kind_key" ON "TaskActivity"("runId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RunResult_taskId_number_key" ON "RunResult"("taskId", "number");

-- CreateIndex
CREATE INDEX "TaskComment_parentId_idx" ON "TaskComment"("parentId");

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

