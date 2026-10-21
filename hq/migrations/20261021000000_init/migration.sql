-- CreateEnum
CREATE TYPE "BusyConversationMode" AS ENUM ('WAIT', 'INTERRUPT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectAccessLevel" AS ENUM ('OPEN', 'PRIVATE');

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('INVITATION', 'FIRST_ADMIN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionClosedReason" AS ENUM ('HARNESS_STATE_MISSING', 'LEFT_PROJECT', 'LEFT_ORGANISATION', 'PROJECT_DELETED');

-- CreateEnum
CREATE TYPE "ConversationHome" AS ENUM ('PERSON', 'PROJECT', 'TASK');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationClosedReason" AS ENUM ('LEFT_PROJECT', 'LEFT_ORGANISATION', 'PROJECT_DELETED', 'TASK_DELETED');

-- CreateEnum
CREATE TYPE "ConversationAccessKind" AS ENUM ('API_KEY', 'CHATGPT_PLAN');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('PERSON', 'AGENT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ConversationMessageKind" AS ENUM ('TEXT', 'OPERATION_STARTED', 'ACTION', 'TASK', 'RESULT', 'APPROVAL_REQUEST', 'APPROVAL_ANSWER', 'SUMMARISED', 'VOICE_STARTED', 'VOICE_ENDED', 'FAILED', 'NOTICE');

-- CreateEnum
CREATE TYPE "ConversationQueueState" AS ENUM ('WAITING', 'TAKEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InferenceTurnState" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InferenceTurnTrigger" AS ENUM ('MESSAGE', 'REPORT', 'CONTINUATION');

-- CreateEnum
CREATE TYPE "OperationKind" AS ENUM ('WORKER', 'TASK', 'TOOL');

-- CreateEnum
CREATE TYPE "OperationMode" AS ENUM ('FOREGROUND', 'BACKGROUND');

-- CreateEnum
CREATE TYPE "OperationState" AS ENUM ('WAITING_FOR_APPROVAL', 'SCHEDULED', 'ACCEPTED', 'QUEUED', 'RUNNING', 'UNCERTAIN', 'COMPLETED', 'FAILED', 'CANCELLED', 'DETACHED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskRunState" AS ENUM ('RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED');

-- CreateEnum
CREATE TYPE "BoardKind" AS ENUM ('PROJECT_TASKS', 'WORKFLOW', 'SPRINTS');

-- CreateEnum
CREATE TYPE "AuthorType" AS ENUM ('AGENT', 'USER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'sunset');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('planning', 'active', 'archived');

-- CreateEnum
CREATE TYPE "LibrarySource" AS ENUM ('BUILT_IN', 'MADE_HERE', 'MARKETPLACE');

-- CreateEnum
CREATE TYPE "SignInShows" AS ENUM ('COVER', 'NAME', 'NOTHING');

-- CreateEnum
CREATE TYPE "SkillScope" AS ENUM ('PLATFORM', 'ORG', 'PROJECT');

-- CreateEnum
CREATE TYPE "WorkspaceOwnerType" AS ENUM ('project', 'user');

-- CreateEnum
CREATE TYPE "PinKind" AS ENUM ('PROJECT', 'BOARD', 'AGENT');

-- CreateEnum
CREATE TYPE "PackageKind" AS ENUM ('AGENT', 'ORG', 'PLATFORM');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('PERSON', 'AGENT_PERSON', 'AGENT_PLACE');

-- CreateEnum
CREATE TYPE "MemoryItemKind" AS ENUM ('FACT', 'PREFERENCE', 'DECISION', 'FEEDBACK', 'PROJECT');

-- CreateEnum
CREATE TYPE "MemoryOutcomeKind" AS ENUM ('INCLUDED', 'HINTED', 'RECALLED', 'USED', 'UNUSED', 'MISSED');

-- CreateEnum
CREATE TYPE "ModelCredentialProvider" AS ENUM ('openrouter', 'openai', 'google', 'anthropic', 'openai_compatible');

-- CreateEnum
CREATE TYPE "ModelCredentialKind" AS ENUM ('API_KEY', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "ModelCredentialOwnerType" AS ENUM ('org', 'project', 'user');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "erasedAt" TIMESTAMP(3),
    "fleetAdmin" BOOLEAN NOT NULL DEFAULT false,
    "fleetAdminSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pledgeDismissedAt" TIMESTAMP(3),
    "pledgeVersionDismissed" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "config" JSONB NOT NULL DEFAULT '{}',
    "busyConversationMode" "BusyConversationMode" NOT NULL DEFAULT 'WAIT',
    "primaryAgentId" TEXT,
    "timezone" TEXT,
    "timezoneChosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "config" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubApp" (
    "id" TEXT NOT NULL,
    "appId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "InviteKind" NOT NULL DEFAULT 'INVITATION',
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "note" TEXT,
    "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "consumedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkRef" TEXT,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "ip" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "MobileAuthToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'phone',
    "deviceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "role" TEXT,
    "defaultModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "runtime" TEXT NOT NULL DEFAULT 'claude-sdk',
    "isKernel" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "allowedTools" JSONB,
    "allowedBashPatterns" JSONB,
    "approval" TEXT NOT NULL DEFAULT 'deferred',
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "voiceId" TEXT,
    "voiceTtsModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "taskId" TEXT,
    "primaryOwnerType" "WorkspaceOwnerType",
    "primaryOwnerId" TEXT,
    "primaryWorkspaceId" TEXT,
    "closedReason" "SessionClosedReason",
    "runtime" TEXT,
    "conversationId" TEXT,
    "workerGeneration" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "home" "ConversationHome" NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "openedById" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedReason" "ConversationClosedReason",
    "title" TEXT,
    "talkingModel" TEXT,
    "talkingProvider" "ModelCredentialProvider",
    "accessOwnerType" "ModelCredentialOwnerType",
    "accessKind" "ConversationAccessKind",
    "refusedAccess" JSONB NOT NULL DEFAULT '[]',
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTurnId" TEXT,
    "activeTurnLeaseUntil" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "keep" BOOLEAN NOT NULL DEFAULT false,
    "voiceHolderId" TEXT,
    "ledger" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "clientMessageId" TEXT,
    "role" "ConversationRole" NOT NULL,
    "authorId" TEXT,
    "agentId" TEXT,
    "kind" "ConversationMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "spoken" BOOLEAN NOT NULL DEFAULT false,
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "withdrawn" BOOLEAN NOT NULL DEFAULT false,
    "encouragement" BOOLEAN NOT NULL DEFAULT false,
    "operationId" TEXT,
    "turnId" TEXT,
    "queueState" "ConversationQueueState",
    "awaitsTurn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "state" "InferenceTurnState" NOT NULL DEFAULT 'QUEUED',
    "trigger" "InferenceTurnTrigger" NOT NULL,
    "actingUserId" TEXT,
    "agentId" TEXT,
    "model" TEXT,
    "provider" "ModelCredentialProvider",
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "contextTokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "errorKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "firstTokenAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InferenceTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT,
    "kind" "OperationKind" NOT NULL,
    "mode" "OperationMode" NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "toolName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "state" "OperationState" NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT,
    "resultSummary" TEXT,
    "error" TEXT,
    "boundaryType" "WorkspaceOwnerType",
    "boundaryId" TEXT,
    "authorisedById" TEXT NOT NULL,
    "siteId" TEXT,
    "runId" TEXT,
    "taskId" TEXT,
    "continuation" JSONB,
    "args" TEXT,
    "workerSessionId" TEXT,
    "noReport" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunResult" (
    "runId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT,
    "result" TEXT,
    "stated" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunResult_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "ConversationReader" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationReader_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ConversationSegment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "firstSeq" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "brief" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ledgerHead" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPolicy" (
    "id" TEXT NOT NULL,
    "ownerType" "ModelCredentialOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "talking" TEXT,
    "lightWork" TEXT,
    "heavyWork" TEXT,
    "allowed" JSONB,
    "ceiling" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Agenthix Site',
    "description" TEXT NOT NULL DEFAULT '',
    "bootstrapRequired" BOOLEAN NOT NULL DEFAULT false,
    "riskRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSecret" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "prefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "cloudOrganisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudAccountLink" (
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudAccountLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CloudSignInAsk" (
    "userId" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudSignInAsk_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OfferDismissal" (
    "userId" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferDismissal_pkey" PRIMARY KEY ("userId","offer")
);

-- CreateTable
CREATE TABLE "PersonConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canChangeTasks" BOOLEAN NOT NULL DEFAULT false,
    "canStartWork" BOOLEAN NOT NULL DEFAULT false,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "allProjects" BOOLEAN NOT NULL DEFAULT true,
    "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionSite" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "siteUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "protocolVersion" TEXT,
    "credentialHash" TEXT,
    "credentialPrefix" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "relayHostId" TEXT,
    "health" JSONB,
    "healthReportedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "leftByItself" BOOLEAN NOT NULL DEFAULT false,
    "replacedCredentialHash" TEXT,
    "replacedAt" TIMESTAMP(3),
    "cloudMachineId" TEXT,

    CONSTRAINT "ExecutionSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeldSiteInstruction" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "sequence" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "HeldSiteInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledChange" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "siteId" TEXT,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "lastUpdate" TEXT NOT NULL,
    "detail" TEXT,
    "expectedMinutes" INTEGER,
    "reason" TEXT,
    "machineName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "vision" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'planning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "executionSiteId" TEXT,
    "productId" TEXT,
    "programId" TEXT,
    "defaultAgentId" TEXT,
    "accessLevel" "ProjectAccessLevel" NOT NULL DEFAULT 'OPEN',
    "runTimeLimitMinutes" INTEGER,
    "runTurnLimit" INTEGER,
    "archiveFinishedAfterDays" INTEGER,
    "personalOwnerId" TEXT,
    "leadUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assetPath" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" "LibrarySource" NOT NULL DEFAULT 'MADE_HERE',
    "packageVersion" TEXT NOT NULL DEFAULT '1',
    "publisher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "BoardKind" NOT NULL DEFAULT 'WORKFLOW',
    "templateId" TEXT,
    "columns" JSONB NOT NULL DEFAULT '[{"name":"todo","label":"To Do","status":"TODO","color":"#6b7280","order":0},{"name":"in_progress","label":"In Progress","status":"IN_PROGRESS","color":"#f59e0b","order":1},{"name":"done","label":"Done","status":"DONE","color":"#10b981","order":2}]',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" DATE NOT NULL,
    "finishDate" DATE NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardShowAlso" (
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "boardIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardShowAlso_pkey" PRIMARY KEY ("userId","boardId")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "direct" BOOLEAN NOT NULL DEFAULT true,
    "ownRole" "ProjectRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectAgent" (
    "projectId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "direct" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAgent_pkey" PRIMARY KEY ("projectId","agentId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "boardId" TEXT NOT NULL,
    "column" TEXT,
    "sprintId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "assignedAgentId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "runState" "TaskRunState" NOT NULL DEFAULT 'RUN_NONE',
    "runStateReason" TEXT,
    "runId" TEXT,
    "result" TEXT,
    "applicationData" JSONB,
    "deferCount" INTEGER NOT NULL DEFAULT 0,
    "lastWorkedAt" TIMESTAMP(3),
    "runStartedBy" TEXT,
    "runOnBehalfOfUserId" TEXT,
    "queueDepth" INTEGER NOT NULL DEFAULT 0,
    "onBehalfOfUserId" TEXT NOT NULL,
    "queuedByUserId" TEXT,
    "queuedByAgentId" TEXT,
    "queuedBySessionId" TEXT,
    "queuedByConnectionId" TEXT,
    "createdByConnectionId" TEXT,
    "scheduleAt" TIMESTAMP(3),
    "scheduleNextDueAt" TIMESTAMP(3),
    "scheduleSetByUserId" TEXT,
    "scheduleSetByAgentId" TEXT,
    "scheduleSetBySessionId" TEXT,
    "scheduleSetByConnectionId" TEXT,
    "routineId" TEXT,
    "roundAt" TIMESTAMP(3),
    "planStart" DATE,
    "planFinish" DATE,
    "isEpic" BOOLEAN NOT NULL DEFAULT false,
    "epicId" TEXT,
    "milestoneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "vision" TEXT NOT NULL DEFAULT '',
    "mission" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "acknowledgedBypassedAgentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "runTimeLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "runTurnLimit" INTEGER NOT NULL DEFAULT 100,
    "automationAllowed" BOOLEAN NOT NULL DEFAULT true,
    "automationIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "automationBatchSize" INTEGER NOT NULL DEFAULT 3,
    "automationQueueLimit" INTEGER NOT NULL DEFAULT 20,
    "automationAgentSchedules" BOOLEAN NOT NULL DEFAULT false,
    "automationThrottle" BOOLEAN NOT NULL DEFAULT false,
    "automationMaxDepth" INTEGER NOT NULL DEFAULT 3,
    "archiveFinishedAfterDays" INTEGER DEFAULT 1,
    "setupCompletedAt" TIMESTAMP(3),
    "signInShows" "SignInShows" NOT NULL DEFAULT 'COVER',
    "conversationArchiveAfterDays" INTEGER NOT NULL DEFAULT 90,
    "memoryEmbeddingModel" TEXT NOT NULL DEFAULT 'local',
    "memoryEmbeddingNext" TEXT,
    "memoryCertainBar" DOUBLE PRECISION,
    "memoryProbableBar" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scope" "SkillScope" NOT NULL,
    "source" "LibrarySource" NOT NULL DEFAULT 'MADE_HERE',
    "packageVersion" TEXT NOT NULL DEFAULT '1',
    "publisher" TEXT,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assetPath" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" "LibrarySource" NOT NULL DEFAULT 'MADE_HERE',
    "packageVersion" TEXT NOT NULL DEFAULT '1',
    "publisher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "handle" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "source" "LibrarySource" NOT NULL DEFAULT 'MADE_HERE',
    "packageVersion" TEXT NOT NULL DEFAULT '1',
    "publisher" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPerson" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPerson_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "TeamAgent" (
    "teamId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAgent_pkey" PRIMARY KEY ("teamId","agentId")
);

-- CreateTable
CREATE TABLE "ProjectTeam" (
    "projectId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTeam_pkey" PRIMARY KEY ("projectId","teamId")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorType" "AuthorType" NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "connectionId" TEXT,
    "runId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspacePlacement" (
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspacePlacement_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "UserStoragePlacement" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStoragePlacement_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RecordedError" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "advice" TEXT NOT NULL,
    "detail" TEXT,
    "siteId" TEXT,
    "agentId" TEXT,
    "projectId" TEXT,
    "runId" TEXT,
    "sessionId" TEXT,
    "occurrenceKey" TEXT,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordedError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "subjectKey" TEXT,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "conversationId" TEXT,
    "operationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PinKind" NOT NULL,
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "siteId" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "ownerType" "WorkspaceOwnerType",
    "ownerId" TEXT,
    "workspaceId" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "kind" "PackageKind" NOT NULL,
    "key" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageContent" (
    "digest" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "PackageContent_pkey" PRIMARY KEY ("digest")
);

-- CreateTable
CREATE TABLE "PackageFile" (
    "id" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "PackageFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOverride" (
    "id" TEXT NOT NULL,
    "boundaryType" "WorkspaceOwnerType" NOT NULL,
    "boundaryId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "model" TEXT,
    "allowedTools" JSONB,
    "allowedBashPatterns" JSONB,
    "approval" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "placeType" "WorkspaceOwnerType",
    "placeId" TEXT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" VARCHAR(1600) NOT NULL,
    "kind" "MemoryItemKind" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "recallCount" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRecalledAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "writtenByAgentId" TEXT,
    "writtenByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryOutcome" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "kind" "MemoryOutcomeKind" NOT NULL,
    "conversationId" TEXT,
    "turnId" TEXT,
    "runId" TEXT,
    "similarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCredential" (
    "id" TEXT NOT NULL,
    "kind" "ModelCredentialKind" NOT NULL,
    "provider" "ModelCredentialProvider" NOT NULL DEFAULT 'anthropic',
    "baseUrl" TEXT,
    "ownerType" "ModelCredentialOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionGrant" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "signedInAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runnerKind" TEXT NOT NULL,
    "runnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAutomation" (
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER,
    "batchSize" INTEGER,
    "queueLimit" INTEGER,
    "agentSchedules" BOOLEAN NOT NULL DEFAULT false,
    "throttle" BOOLEAN NOT NULL DEFAULT false,
    "maxDepth" INTEGER,
    "openRoundId" TEXT,
    "lastRoundFinishedAt" TIMESTAMP(3),
    "pulseDueAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAutomation_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "AutomationStart" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    "started" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "AutomationStart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "assignedAgentId" TEXT,
    "boardId" TEXT,
    "column" TEXT,
    "scheduleAt" TIMESTAMP(3) NOT NULL,
    "scheduleRule" JSONB NOT NULL,
    "scheduleTimezone" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" TEXT,
    "nextRoundAt" TIMESTAMP(3),
    "onBehalfOfUserId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByAgentId" TEXT,
    "createdBySessionId" TEXT,
    "createdByConnectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelayHost" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "signingKey" TEXT NOT NULL,
    "sealingKey" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "consoleFingerprint" TEXT NOT NULL,
    "credentialHash" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "notifyIfSilent" BOOLEAN DEFAULT true,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "RelayHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelayJoin" (
    "id" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "purpose" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "hostFingerprint" TEXT,
    "hostIdentity" JSONB,
    "machineName" TEXT,
    "binding" TEXT,
    "relayHostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelayJoin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsoleCredential" (
    "id" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsoleCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsoleCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsoleCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsoleHandover" (
    "id" TEXT NOT NULL,
    "lookupHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "oldFingerprint" TEXT,
    "newFingerprint" TEXT,
    "certificate" JSONB,
    "credentialHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ConsoleHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetActivity" (
    "id" TEXT NOT NULL,
    "byUserId" TEXT,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "announced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "providerName" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "providerData" TEXT NOT NULL DEFAULT '{}',
    "authId" TEXT NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("providerName","providerUserId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProjectToSkill" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_service_name_key" ON "Provider"("service", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubApp_appId_key" ON "GitHubApp"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileAuthToken_token_key" ON "MobileAuthToken"("token");

-- CreateIndex
CREATE INDEX "DeviceSession_userId_idx" ON "DeviceSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_handle_key" ON "Agent"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_sessionKey_key" ON "AgentSession"("sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_taskId_key" ON "AgentSession"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_conversationId_primaryOwnerType_primaryOwnerId_key" ON "AgentSession"("conversationId", "primaryOwnerType", "primaryOwnerId", "userId", "workerGeneration");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_taskId_key" ON "Conversation"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_activeTurnId_key" ON "Conversation"("activeTurnId");

-- CreateIndex
CREATE INDEX "Conversation_openedById_home_status_lastMessageAt_idx" ON "Conversation"("openedById", "home", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_projectId_openedById_status_idx" ON "Conversation"("projectId", "openedById", "status");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_queueState_idx" ON "ConversationMessage"("conversationId", "queueState");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_awaitsTurn_idx" ON "ConversationMessage"("conversationId", "awaitsTurn");

-- CreateIndex
CREATE INDEX "ConversationMessage_authorId_createdAt_idx" ON "ConversationMessage"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_conversationId_seq_key" ON "ConversationMessage"("conversationId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_conversationId_clientMessageId_key" ON "ConversationMessage"("conversationId", "clientMessageId");

-- CreateIndex
CREATE INDEX "InferenceTurn_conversationId_createdAt_idx" ON "InferenceTurn"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Operation_conversationId_state_idx" ON "Operation"("conversationId", "state");

-- CreateIndex
CREATE INDEX "Operation_siteId_runId_idx" ON "Operation"("siteId", "runId");

-- CreateIndex
CREATE INDEX "Operation_workerSessionId_state_idx" ON "Operation"("workerSessionId", "state");

-- CreateIndex
CREATE INDEX "Operation_taskId_state_idx" ON "Operation"("taskId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_conversationId_idempotencyKey_key" ON "Operation"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RunResult_taskId_createdAt_idx" ON "RunResult"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationReader_userId_idx" ON "ConversationReader"("userId");

-- CreateIndex
CREATE INDEX "ConversationSegment_conversationId_firstSeq_idx" ON "ConversationSegment"("conversationId", "firstSeq");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPolicy_ownerType_ownerId_key" ON "ModelPolicy"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteConfig_siteId_key" ON "SiteConfig"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSecret_type_key" ON "SiteSecret"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CloudAccountLink_issuer_subject_key" ON "CloudAccountLink"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "PersonConnection_tokenHash_key" ON "PersonConnection"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonConnection_userId_idx" ON "PersonConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionSite_siteId_key" ON "ExecutionSite"("siteId");

-- CreateIndex
CREATE INDEX "ExecutionSite_cloudMachineId_idx" ON "ExecutionSite"("cloudMachineId");

-- CreateIndex
CREATE INDEX "HeldSiteInstruction_siteId_acknowledgedAt_sequence_idx" ON "HeldSiteInstruction"("siteId", "acknowledgedAt", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "HeldSiteInstruction_sequence_key" ON "HeldSiteInstruction"("sequence");

-- CreateIndex
CREATE INDEX "ScheduledChange_siteId_idx" ON "ScheduledChange"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledChange_source_changeId_key" ON "ScheduledChange"("source", "changeId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Project_personalOwnerId_key" ON "Project"("personalOwnerId");

-- CreateIndex
CREATE INDEX "Board_projectId_kind_idx" ON "Board"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_boardId_number_key" ON "Sprint"("boardId", "number");

-- CreateIndex
CREATE INDEX "Milestone_projectId_date_idx" ON "Milestone"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE INDEX "Task_boardId_column_idx" ON "Task"("boardId", "column");

-- CreateIndex
CREATE INDEX "Task_sprintId_idx" ON "Task"("sprintId");

-- CreateIndex
CREATE INDEX "Task_epicId_idx" ON "Task"("epicId");

-- CreateIndex
CREATE INDEX "Task_projectId_runState_idx" ON "Task"("projectId", "runState");

-- CreateIndex
CREATE INDEX "Task_scheduleNextDueAt_idx" ON "Task"("scheduleNextDueAt");

-- CreateIndex
CREATE INDEX "Task_onBehalfOfUserId_idx" ON "Task"("onBehalfOfUserId");

-- CreateIndex
CREATE INDEX "Task_doneAt_idx" ON "Task"("doneAt");

-- CreateIndex
CREATE INDEX "Task_routineId_idx" ON "Task"("routineId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_scope_orgId_key" ON "Skill"("slug", "scope", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_slug_key" ON "AgentTemplate"("slug");

-- CreateIndex
CREATE INDEX "TeamPerson_userId_idx" ON "TeamPerson"("userId");

-- CreateIndex
CREATE INDEX "TeamAgent_agentId_idx" ON "TeamAgent"("agentId");

-- CreateIndex
CREATE INDEX "ProjectTeam_teamId_idx" ON "ProjectTeam"("teamId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspacePlacement_siteId_idx" ON "WorkspacePlacement"("siteId");

-- CreateIndex
CREATE INDEX "UserStoragePlacement_siteId_idx" ON "UserStoragePlacement"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordedError_occurrenceKey_key" ON "RecordedError"("occurrenceKey");

-- CreateIndex
CREATE INDEX "RecordedError_lastAt_idx" ON "RecordedError"("lastAt");

-- CreateIndex
CREATE INDEX "RecordedError_groupKey_lastAt_idx" ON "RecordedError"("groupKey", "lastAt");

-- CreateIndex
CREATE INDEX "Notification_type_subjectKey_idx" ON "Notification"("type", "subjectKey");

-- CreateIndex
CREATE INDEX "Pin_userId_position_idx" ON "Pin"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_userId_kind_itemId_key" ON "Pin"("userId", "kind", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewSession_token_key" ON "PreviewSession"("token");

-- CreateIndex
CREATE INDEX "PreviewSession_status_idx" ON "PreviewSession"("status");

-- CreateIndex
CREATE INDEX "PreviewSession_agentId_idx" ON "PreviewSession"("agentId");

-- CreateIndex
CREATE INDEX "Package_digest_idx" ON "Package"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "Package_kind_key_key" ON "Package"("kind", "key");

-- CreateIndex
CREATE INDEX "PackageContent_releasedAt_idx" ON "PackageContent"("releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackageFile_contentDigest_path_key" ON "PackageFile"("contentDigest", "path");

-- CreateIndex
CREATE UNIQUE INDEX "AgentOverride_boundaryType_boundaryId_agentId_key" ON "AgentOverride"("boundaryType", "boundaryId", "agentId");

-- CreateIndex
CREATE INDEX "MemoryItem_scopeKey_archived_idx" ON "MemoryItem"("scopeKey", "archived");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_idx" ON "MemoryItem"("userId");

-- CreateIndex
CREATE INDEX "MemoryItem_agentId_placeType_placeId_idx" ON "MemoryItem"("agentId", "placeType", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryItem_scopeKey_key_key" ON "MemoryItem"("scopeKey", "key");

-- CreateIndex
CREATE INDEX "MemoryOutcome_createdAt_idx" ON "MemoryOutcome"("createdAt");

-- CreateIndex
CREATE INDEX "MemoryOutcome_itemId_idx" ON "MemoryOutcome"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCredential_ownerType_ownerId_provider_kind_key" ON "ModelCredential"("ownerType", "ownerId", "provider", "kind");

-- CreateIndex
CREATE INDEX "SubscriptionGrant_credentialId_idx" ON "SubscriptionGrant"("credentialId");

-- CreateIndex
CREATE INDEX "SubscriptionGrant_expiresAt_idx" ON "SubscriptionGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "ProjectAutomation_pulseDueAt_idx" ON "ProjectAutomation"("pulseDueAt");

-- CreateIndex
CREATE INDEX "AutomationStart_projectId_firedAt_idx" ON "AutomationStart"("projectId", "firedAt");

-- CreateIndex
CREATE INDEX "Routine_nextRoundAt_idx" ON "Routine"("nextRoundAt");

-- CreateIndex
CREATE INDEX "Routine_projectId_idx" ON "Routine"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RelayHost_fingerprint_key" ON "RelayHost"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "RelayHost_credentialHash_key" ON "RelayHost"("credentialHash");

-- CreateIndex
CREATE UNIQUE INDEX "RelayJoin_lookupHash_key" ON "RelayJoin"("lookupHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsoleCredential_credentialHash_key" ON "ConsoleCredential"("credentialHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsoleCode_codeHash_key" ON "ConsoleCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsoleHandover_lookupHash_key" ON "ConsoleHandover"("lookupHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConsoleHandover_credentialHash_key" ON "ConsoleHandover"("credentialHash");

-- CreateIndex
CREATE INDEX "FleetActivity_at_idx" ON "FleetActivity"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_key" ON "Session"("id");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "_ProjectToSkill_AB_unique" ON "_ProjectToSkill"("A", "B");

-- CreateIndex
CREATE INDEX "_ProjectToSkill_B_index" ON "_ProjectToSkill"("B");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAuthToken" ADD CONSTRAINT "MobileAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceTurn" ADD CONSTRAINT "InferenceTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReader" ADD CONSTRAINT "ConversationReader_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSegment" ADD CONSTRAINT "ConversationSegment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudAccountLink" ADD CONSTRAINT "CloudAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudSignInAsk" ADD CONSTRAINT "CloudSignInAsk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferDismissal" ADD CONSTRAINT "OfferDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonConnection" ADD CONSTRAINT "PersonConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionSite" ADD CONSTRAINT "ExecutionSite_relayHostId_fkey" FOREIGN KEY ("relayHostId") REFERENCES "RelayHost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeldSiteInstruction" ADD CONSTRAINT "HeldSiteInstruction_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledChange" ADD CONSTRAINT "ScheduledChange_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("siteId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_executionSiteId_fkey" FOREIGN KEY ("executionSiteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_personalOwnerId_fkey" FOREIGN KEY ("personalOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BoardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardShowAlso" ADD CONSTRAINT "BoardShowAlso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardShowAlso" ADD CONSTRAINT "BoardShowAlso_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgent" ADD CONSTRAINT "ProjectAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPerson" ADD CONSTRAINT "TeamPerson_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPerson" ADD CONSTRAINT "TeamPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAgent" ADD CONSTRAINT "TeamAgent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAgent" ADD CONSTRAINT "TeamAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeam" ADD CONSTRAINT "ProjectTeam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeam" ADD CONSTRAINT "ProjectTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoragePlacement" ADD CONSTRAINT "UserStoragePlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoragePlacement" ADD CONSTRAINT "UserStoragePlacement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageFile" ADD CONSTRAINT "PackageFile_contentDigest_fkey" FOREIGN KEY ("contentDigest") REFERENCES "PackageContent"("digest") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOverride" ADD CONSTRAINT "AgentOverride_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryOutcome" ADD CONSTRAINT "MemoryOutcome_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ModelCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAutomation" ADD CONSTRAINT "ProjectAutomation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStart" ADD CONSTRAINT "AutomationStart_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectToSkill" ADD CONSTRAINT "_ProjectToSkill_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectToSkill" ADD CONSTRAINT "_ProjectToSkill_B_fkey" FOREIGN KEY ("B") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

