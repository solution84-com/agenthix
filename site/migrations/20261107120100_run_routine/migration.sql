-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "routineId" TEXT;

-- CreateIndex
CREATE INDEX "AgentRun_routineId_createdAt_idx" ON "AgentRun"("routineId", "createdAt");

