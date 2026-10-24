-- CreateEnum
CREATE TYPE "ExecutorRunState" AS ENUM ('RUNNING', 'SCANNING', 'WRITING_BACK', 'PASSED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ExecutorSnapshotKind" AS ENUM ('CLONE', 'COPY');

-- AlterTable
ALTER TABLE "RepoAttachment" ADD COLUMN     "accountId" BIGINT,
ADD COLUMN     "accountLogin" TEXT,
ADD COLUMN     "installationId" INTEGER,
ADD COLUMN     "repositoryId" BIGINT;

-- CreateTable
CREATE TABLE "ExecutorRun" (
    "id" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workflowName" TEXT NOT NULL,
    "versionHash" TEXT NOT NULL,
    "imageDigest" TEXT NOT NULL,
    "state" "ExecutorRunState" NOT NULL DEFAULT 'RUNNING',
    "currentStep" INTEGER,
    "result" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutorSnapshot" (
    "runId" TEXT NOT NULL,
    "kind" "ExecutorSnapshotKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutorSnapshot_pkey" PRIMARY KEY ("runId")
);

-- CreateIndex
CREATE INDEX "ExecutorRun_state_idx" ON "ExecutorRun"("state");

-- AddForeignKey
ALTER TABLE "ExecutorSnapshot" ADD CONSTRAINT "ExecutorSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ExecutorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
