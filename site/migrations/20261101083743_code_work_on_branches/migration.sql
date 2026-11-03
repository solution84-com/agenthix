-- CreateTable
CREATE TABLE "BranchCopy" (
    "id" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "backPending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchCopy_workspaceId_idx" ON "BranchCopy"("workspaceId");

-- CreateIndex
CREATE INDEX "BranchCopy_backPending_idx" ON "BranchCopy"("backPending");

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

