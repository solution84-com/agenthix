-- CreateTable
CREATE TABLE "LivePreview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "personId" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "onMain" BOOLEAN NOT NULL DEFAULT false,
    "copyKind" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "baseCommit" TEXT,
    "headCommit" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "state" JSONB NOT NULL,
    "runs" JSONB NOT NULL DEFAULT '[]',
    "pending" JSONB,
    "containersRemoved" BOOLEAN NOT NULL DEFAULT false,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivePreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LivePreview_workspaceId_live_idx" ON "LivePreview"("workspaceId", "live");

-- CreateIndex
CREATE INDEX "LivePreview_live_idx" ON "LivePreview"("live");

