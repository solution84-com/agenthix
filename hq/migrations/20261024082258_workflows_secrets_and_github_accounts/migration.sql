-- CreateEnum
CREATE TYPE "GitHubInstallationState" AS ENUM ('WANTS_TO_CONNECT', 'ALLOWED', 'IGNORED');

-- CreateEnum
CREATE TYPE "GitHubProjectRule" AS ENUM ('EVERY_PROJECT', 'CHOSEN_PROJECTS');

-- CreateEnum
CREATE TYPE "WorkflowVersionState" AS ENUM ('PROPOSED', 'APPROVED', 'DECLINED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "WorkflowVersionOrigin" AS ENUM ('PROPOSED', 'STARTER', 'IMAGE_UPGRADE');

-- CreateEnum
CREATE TYPE "WorkflowReviewLevel" AS ENUM ('LOW', 'LOOK_CLOSELY', 'HIGH');

-- CreateEnum
CREATE TYPE "WorkflowRunState" AS ENUM ('WAITING', 'RUNNING', 'PASSED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "WorkflowStepState" AS ENUM ('WAITING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED', 'STOPPED');

-- CreateEnum
CREATE TYPE "PlaceSecretKind" AS ENUM ('TEXT', 'FILE');

-- CreateEnum
CREATE TYPE "SecretRecordAction" AS ENUM ('SET', 'REPLACED', 'DELETED', 'USED', 'PRINTED', 'TURNED_OFF_USERS');

-- CreateEnum
CREATE TYPE "VariableChangeAction" AS ENUM ('SET', 'CHANGED', 'DELETED');

-- AlterTable
ALTER TABLE "GitHubInstallation" ADD COLUMN     "accountId" BIGINT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "projectRule" "GitHubProjectRule" NOT NULL DEFAULT 'CHOSEN_PROJECTS',
ADD COLUMN     "repositorySelection" TEXT,
ADD COLUMN     "state" "GitHubInstallationState" NOT NULL DEFAULT 'WANTS_TO_CONNECT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultGitHubInstallationId" TEXT;

-- CreateTable
CREATE TABLE "GitHubInstallationProject" (
    "installationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubInstallationProject_pkey" PRIMARY KEY ("installationId","projectId")
);

-- CreateTable
CREATE TABLE "GitHubInstallationPerson" (
    "installationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubInstallationPerson_pkey" PRIMARY KEY ("installationId","userId")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledChangedById" TEXT,
    "enabledChangedAt" TIMESTAMP(3),
    "agentRunsPerHour" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "githubSecretNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "executorImageDigest" TEXT NOT NULL,
    "state" "WorkflowVersionState" NOT NULL DEFAULT 'PROPOSED',
    "origin" "WorkflowVersionOrigin" NOT NULL DEFAULT 'PROPOSED',
    "upgradeOfId" TEXT,
    "proposedByAgentId" TEXT,
    "proposedByRunId" TEXT,
    "proposedForUserId" TEXT,
    "checkFlags" JSONB,
    "checkSummary" TEXT,
    "cardMayApprove" BOOLEAN,
    "reviewLevel" "WorkflowReviewLevel",
    "reviewPoints" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "declinedById" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersionFile" (
    "versionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "executable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkflowVersionFile_pkey" PRIMARY KEY ("versionId","path")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "approvedById" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "siteId" TEXT NOT NULL,
    "onBehalfOfUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "agentRunId" TEXT,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "state" "WorkflowRunState" NOT NULL DEFAULT 'WAITING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "printedSecret" BOOLEAN NOT NULL DEFAULT false,
    "leaks" JSONB,
    "writeBack" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" "WorkflowStepState" NOT NULL DEFAULT 'WAITING',
    "exitCode" INTEGER,
    "output" TEXT NOT NULL DEFAULT '',
    "outputTruncated" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowMintedToken" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowMintedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceSecret" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlaceSecretKind" NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "description" TEXT NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT '',
    "renewAt" TEXT NOT NULL DEFAULT '',
    "rotateBy" TIMESTAMP(3),
    "rotateNoticeSentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretRecord" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "secretName" TEXT NOT NULL,
    "secretId" TEXT,
    "action" "SecretRecordAction" NOT NULL,
    "byUserId" TEXT,
    "runId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceVariable" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceVariableChange" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" "VariableChangeAction" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceVariableChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubInstallationProject_projectId_idx" ON "GitHubInstallationProject"("projectId");

-- CreateIndex
CREATE INDEX "GitHubInstallationPerson_userId_idx" ON "GitHubInstallationPerson"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_placeType_placeId_name_key" ON "Workflow"("placeType", "placeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_number_key" ON "WorkflowVersion"("workflowId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_hash_key" ON "WorkflowVersion"("workflowId", "hash");

-- CreateIndex
CREATE INDEX "WorkflowApproval_placeType_placeId_idx" ON "WorkflowApproval"("placeType", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowApproval_workflowId_hash_key" ON "WorkflowApproval"("workflowId", "hash");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_createdAt_idx" ON "WorkflowRun"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_agentId_createdAt_idx" ON "WorkflowRun"("workflowId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_placeType_placeId_createdAt_idx" ON "WorkflowRun"("placeType", "placeId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_state_idx" ON "WorkflowRun"("state");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepRun_runId_index_key" ON "WorkflowStepRun"("runId", "index");

-- CreateIndex
CREATE INDEX "WorkflowMintedToken_placeType_placeId_expiresAt_idx" ON "WorkflowMintedToken"("placeType", "placeId", "expiresAt");

-- CreateIndex
CREATE INDEX "WorkflowMintedToken_runId_idx" ON "WorkflowMintedToken"("runId");

-- CreateIndex
CREATE INDEX "PlaceSecret_rotateBy_idx" ON "PlaceSecret"("rotateBy");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceSecret_placeType_placeId_name_key" ON "PlaceSecret"("placeType", "placeId", "name");

-- CreateIndex
CREATE INDEX "SecretRecord_placeType_placeId_secretName_at_idx" ON "SecretRecord"("placeType", "placeId", "secretName", "at");

-- CreateIndex
CREATE INDEX "SecretRecord_runId_idx" ON "SecretRecord"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceVariable_placeType_placeId_name_key" ON "PlaceVariable"("placeType", "placeId", "name");

-- CreateIndex
CREATE INDEX "PlaceVariableChange_placeType_placeId_name_at_idx" ON "PlaceVariableChange"("placeType", "placeId", "name", "at");

-- AddForeignKey
ALTER TABLE "GitHubInstallationProject" ADD CONSTRAINT "GitHubInstallationProject_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationProject" ADD CONSTRAINT "GitHubInstallationProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationPerson" ADD CONSTRAINT "GitHubInstallationPerson_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationPerson" ADD CONSTRAINT "GitHubInstallationPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultGitHubInstallationId_fkey" FOREIGN KEY ("defaultGitHubInstallationId") REFERENCES "GitHubInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersionFile" ADD CONSTRAINT "WorkflowVersionFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowMintedToken" ADD CONSTRAINT "WorkflowMintedToken_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
