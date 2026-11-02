-- CreateEnum
CREATE TYPE "WorkspaceBranchState" AS ENUM ('OPEN', 'MERGED', 'DELETED');

-- CreateEnum
CREATE TYPE "BranchCopyState" AS ENUM ('MAKING', 'READY', 'REMOVING', 'REMOVED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceBranch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taskId" TEXT,
    "conversationId" TEXT,
    "userId" TEXT NOT NULL,
    "lastMergedCommit" TEXT,
    "lastMergedVersion" TEXT,
    "state" "WorkspaceBranchState" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchCopy" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "state" "BranchCopyState" NOT NULL DEFAULT 'MAKING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "BranchCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceBranch_workspaceId_state_idx" ON "WorkspaceBranch"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "WorkspaceBranch_taskId_idx" ON "WorkspaceBranch"("taskId");

-- CreateIndex
CREATE INDEX "WorkspaceBranch_conversationId_idx" ON "WorkspaceBranch"("conversationId");

-- CreateIndex
CREATE INDEX "WorkspaceBranch_userId_idx" ON "WorkspaceBranch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchCopy_folderId_key" ON "BranchCopy"("folderId");

-- CreateIndex
CREATE INDEX "BranchCopy_branchId_state_idx" ON "BranchCopy"("branchId", "state");

-- CreateIndex
CREATE INDEX "BranchCopy_siteId_state_idx" ON "BranchCopy"("siteId", "state");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_idx" ON "Conversation"("workspaceId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceBranch" ADD CONSTRAINT "WorkspaceBranch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBranch" ADD CONSTRAINT "WorkspaceBranch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "WorkspaceBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

