-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionClosedReason" AS ENUM ('HARNESS_STATE_MISSING', 'LEFT_PROJECT', 'LEFT_ORGANISATION', 'PROJECT_DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('SAFE', 'LOW', 'MEDIUM', 'HIGH', 'FLAGGED');

-- CreateEnum
CREATE TYPE "TranscriptEntryKind" AS ENUM ('THOUGHT', 'RUN_FAILED', 'RUN_STOPPED', 'APPROVAL_REQUESTED', 'CONTEXT_SUMMARISED');

-- CreateEnum
CREATE TYPE "WorkspaceOwnerType" AS ENUM ('project', 'user');

-- CreateEnum
CREATE TYPE "ExecutorRunState" AS ENUM ('RUNNING', 'SCANNING', 'WRITING_BACK', 'PASSED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "ExecutorSnapshotKind" AS ENUM ('CLONE', 'COPY');

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "hqUrl" TEXT NOT NULL,
    "hqWsUrl" TEXT,
    "connectionToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LINKING',
    "connectedAt" TIMESTAMP(3),
    "pairedHqUrl" TEXT,
    "movingTo" TEXT,
    "movingSince" TIMESTAMP(3),
    "moveProblem" TEXT,
    "replacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionType" TEXT NOT NULL DEFAULT 'chat',
    "model" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "primaryOwnerType" "WorkspaceOwnerType",
    "primaryOwnerId" TEXT,
    "primaryWorkspaceId" TEXT,
    "closedReason" "SessionClosedReason",
    "runtime" TEXT,
    "harnessSessionId" TEXT,
    "contextUse" JSONB,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "thought" TEXT,
    "thinkingDurationMs" INTEGER,
    "toolName" TEXT,
    "toolInput" JSONB,
    "toolOutput" JSONB,
    "toolUseId" TEXT,
    "model" TEXT,
    "usage" JSONB,
    "runId" TEXT,
    "kind" "TranscriptEntryKind",
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT,
    "routineId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "inputText" TEXT NOT NULL,
    "outputText" TEXT,
    "metadata" JSONB,
    "model" TEXT NOT NULL,
    "usage" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentPackageDigest" TEXT,
    "orgPackageDigest" TEXT,
    "platformPackageDigest" TEXT,
    "skillDigests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manifestStatus" "ManifestStatus",
    "pendingManifest" JSONB,
    "approvedManifest" JSONB,
    "manifestDecidedById" TEXT,
    "manifestDecidedAt" TIMESTAMP(3),
    "contextUse" JSONB,
    "auditSummary" JSONB,
    "skillsUsed" JSONB,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "toolUseId" TEXT,
    "riskLevel" "RiskLevel" NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "allowedTools" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoAttachment" (
    "id" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "repoUrl" TEXT NOT NULL,
    "installationId" INTEGER,
    "repositoryId" BIGINT,
    "accountId" BIGINT,
    "accountLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoAttachment_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "LivePreviewServiceApproval" (
    "workspaceId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "declarationHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePreviewServiceApproval_pkey" PRIMARY KEY ("workspaceId","service","declarationHash")
);

-- CreateTable
CREATE TABLE "ExecutorRun" (
    "id" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT,
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
CREATE UNIQUE INDEX "SiteConfig_siteId_key" ON "SiteConfig"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_sessionKey_key" ON "AgentSession"("sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_taskId_key" ON "AgentSession"("taskId");

-- CreateIndex
CREATE INDEX "AgentSession_agentId_idx" ON "AgentSession"("agentId");

-- CreateIndex
CREATE INDEX "AgentSession_userId_idx" ON "AgentSession"("userId");

-- CreateIndex
CREATE INDEX "TranscriptEntry_sessionId_createdAt_idx" ON "TranscriptEntry"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "TranscriptEntry_sessionId_toolUseId_idx" ON "TranscriptEntry"("sessionId", "toolUseId");

-- CreateIndex
CREATE INDEX "TranscriptEntry_runId_idx" ON "TranscriptEntry"("runId");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_idx" ON "AgentRun"("agentId");

-- CreateIndex
CREATE INDEX "AgentRun_sessionId_createdAt_idx" ON "AgentRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_taskId_createdAt_idx" ON "AgentRun"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_routineId_createdAt_idx" ON "AgentRun"("routineId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_runId_idx" ON "ToolCallLog"("runId");

-- CreateIndex
CREATE INDEX "Workspace_ownerType_ownerId_idx" ON "Workspace"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoAttachment_workspaceId_key" ON "RepoAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "RepoAttachment_ownerType_ownerId_idx" ON "RepoAttachment"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "BranchCopy_workspaceId_idx" ON "BranchCopy"("workspaceId");

-- CreateIndex
CREATE INDEX "BranchCopy_backPending_idx" ON "BranchCopy"("backPending");

-- CreateIndex
CREATE INDEX "LivePreview_workspaceId_live_idx" ON "LivePreview"("workspaceId", "live");

-- CreateIndex
CREATE INDEX "LivePreview_live_idx" ON "LivePreview"("live");

-- CreateIndex
CREATE INDEX "ExecutorRun_state_idx" ON "ExecutorRun"("state");

-- AddForeignKey
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoAttachment" ADD CONSTRAINT "RepoAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutorSnapshot" ADD CONSTRAINT "ExecutorSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ExecutorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

