-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "skillDigests" TEXT[] DEFAULT ARRAY[]::TEXT[];
