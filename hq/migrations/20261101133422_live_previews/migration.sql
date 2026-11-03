-- CreateEnum
CREATE TYPE "LivePreviewState" AS ENUM ('STARTING', 'RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "LivePreviewCopyKind" AS ENUM ('BRANCH', 'MAIN', 'BUNDLE');

-- AlterTable
ALTER TABLE "ExecutionSite" ADD COLUMN     "livePreviewIdleMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "livePreviewLimit" INTEGER,
ADD COLUMN     "livePreviewsAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "livePreviewsMemoryHigh" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "trustedPackageScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LivePreview" (
    "id" TEXT NOT NULL,
    "executionSiteId" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceName" TEXT,
    "branchId" TEXT,
    "branch" TEXT NOT NULL,
    "onMain" BOOLEAN NOT NULL DEFAULT false,
    "copyKind" "LivePreviewCopyKind" NOT NULL,
    "copyId" TEXT NOT NULL,
    "bundleId" TEXT,
    "headCommit" TEXT,
    "userId" TEXT NOT NULL,
    "state" "LivePreviewState" NOT NULL DEFAULT 'STARTING',
    "reason" TEXT,
    "signal" TEXT,
    "detail" TEXT,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoReload" BOOLEAN NOT NULL DEFAULT true,
    "pendingBack" JSONB,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivePreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveApp" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'stopped',
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT,
    "lastLines" JSONB NOT NULL DEFAULT '[]',
    "livePreviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAppRun" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "livePreviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "runId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "ending" TEXT,
    "lastLines" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "LiveAppRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivePreviewGuardReport" (
    "executionSiteId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivePreviewGuardReport_pkey" PRIMARY KEY ("executionSiteId")
);

-- CreateIndex
CREATE INDEX "LivePreview_workspaceId_state_idx" ON "LivePreview"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "LivePreview_executionSiteId_state_idx" ON "LivePreview"("executionSiteId", "state");

-- CreateIndex
CREATE INDEX "LivePreview_branchId_state_idx" ON "LivePreview"("branchId", "state");

-- CreateIndex
CREATE INDEX "LivePreview_userId_state_idx" ON "LivePreview"("userId", "state");

-- CreateIndex
CREATE INDEX "LiveApp_livePreviewId_idx" ON "LiveApp"("livePreviewId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveApp_workspaceId_branch_name_key" ON "LiveApp"("workspaceId", "branch", "name");

-- CreateIndex
CREATE INDEX "LiveAppRun_livePreviewId_idx" ON "LiveAppRun"("livePreviewId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveAppRun_appId_startedAt_key" ON "LiveAppRun"("appId", "startedAt");

-- AddForeignKey
ALTER TABLE "LiveApp" ADD CONSTRAINT "LiveApp_livePreviewId_fkey" FOREIGN KEY ("livePreviewId") REFERENCES "LivePreview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAppRun" ADD CONSTRAINT "LiveAppRun_appId_fkey" FOREIGN KEY ("appId") REFERENCES "LiveApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

