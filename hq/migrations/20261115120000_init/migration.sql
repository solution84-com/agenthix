-- CreateEnum
CREATE TYPE "BusyConversationMode" AS ENUM ('WAIT', 'INTERRUPT');

-- CreateEnum
CREATE TYPE "GitHubInstallationState" AS ENUM ('WANTS_TO_CONNECT', 'ALLOWED', 'IGNORED');

-- CreateEnum
CREATE TYPE "GitHubProjectRule" AS ENUM ('EVERY_PROJECT', 'CHOSEN_PROJECTS');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectAccessLevel" AS ENUM ('OPEN', 'PRIVATE');

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('INVITATION', 'FIRST_ADMIN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionClosedReason" AS ENUM ('HARNESS_STATE_MISSING', 'LEFT_PROJECT', 'LEFT_ORGANISATION', 'PROJECT_DELETED');

-- CreateEnum
CREATE TYPE "ConversationHome" AS ENUM ('PERSON', 'PROJECT', 'TASK');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationClosedReason" AS ENUM ('LEFT_PROJECT', 'LEFT_ORGANISATION', 'PROJECT_DELETED', 'TASK_DELETED');

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
CREATE TYPE "OperationState" AS ENUM ('WAITING_FOR_APPROVAL', 'ACCEPTED', 'QUEUED', 'RUNNING', 'UNCERTAIN', 'COMPLETED', 'FAILED', 'CANCELLED', 'DETACHED');

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskTypeKind" AS ENUM ('TASK', 'EPIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskExecutionState" AS ENUM ('NOT_STARTED', 'WAITING', 'RUNNING', 'NEEDS_YOU', 'FAILED', 'FINISHED');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('SINGLE_SELECT');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskRunState" AS ENUM ('RUN_NONE', 'RUN_QUEUED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED');

-- CreateEnum
CREATE TYPE "BoardViewKind" AS ENUM ('TYPE', 'STATE', 'EXECUTION', 'FIELD');

-- CreateEnum
CREATE TYPE "AuthorType" AS ENUM ('AGENT', 'USER');

-- CreateEnum
CREATE TYPE "RelayState" AS ENUM ('ON', 'REMOVED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'sunset');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('planning', 'active', 'archived');

-- CreateEnum
CREATE TYPE "SignInShows" AS ENUM ('COVER', 'NAME', 'NOTHING');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('SKILL', 'AGENT', 'TEAM', 'TASK_TEMPLATE');

-- CreateEnum
CREATE TYPE "AssetVersionSource" AS ENUM ('BUILT_IN', 'UPLOAD', 'URL', 'MADE_HERE');

-- CreateEnum
CREATE TYPE "AssetSignerKind" AS ENUM ('NONE', 'KEYLESS', 'KEY');

-- CreateEnum
CREATE TYPE "ProposalAim" AS ENUM ('ORGANISATION', 'PROJECT', 'PERSON');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('OPEN', 'ACCEPTED', 'ACCEPTED_WITH_CHANGES', 'REJECTED');

-- CreateEnum
CREATE TYPE "FileSkillsDefault" AS ENUM ('ON', 'OFF', 'NEVER');

-- CreateEnum
CREATE TYPE "OutsideInstallers" AS ENUM ('ADMINS', 'ADMINS_AND_MAINTAINERS');

-- CreateEnum
CREATE TYPE "PlaceSkillGroup" AS ENUM ('PLACE', 'AGENT', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "PlaceSkillSwitch" AS ENUM ('ON', 'OFF');

-- CreateEnum
CREATE TYPE "TaskActivityKind" AS ENUM ('CREATED', 'EDITED', 'MOVED', 'ASSIGNED', 'RUN_STARTED', 'RUN_FINISHED', 'RUN_FAILED', 'RUN_STOPPED', 'APPROVED', 'DENIED', 'COMMENTED', 'ARCHIVED', 'UNARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceOwnerType" AS ENUM ('project', 'user');

-- CreateEnum
CREATE TYPE "WorkspaceBranchState" AS ENUM ('OPEN', 'MERGED', 'DELETED');

-- CreateEnum
CREATE TYPE "BranchCopyState" AS ENUM ('MAKING', 'READY', 'REMOVING', 'REMOVED');

-- CreateEnum
CREATE TYPE "KnowledgePlaceKind" AS ENUM ('PROJECT', 'USER', 'ORG');

-- CreateEnum
CREATE TYPE "KnowledgeChangeKind" AS ENUM ('CREATED', 'EDITED', 'MOVED', 'DELETED', 'RESTORED');

-- CreateEnum
CREATE TYPE "PinKind" AS ENUM ('PROJECT', 'BOARD', 'AGENT');

-- CreateEnum
CREATE TYPE "PackageKind" AS ENUM ('AGENT', 'ORG', 'PLATFORM');

-- CreateEnum
CREATE TYPE "MemoryItemKind" AS ENUM ('FACT', 'RULE');

-- CreateEnum
CREATE TYPE "MemoryOutcomeKind" AS ENUM ('INCLUDED', 'HINTED', 'RECALLED', 'USED', 'UNUSED', 'MISSED');

-- CreateEnum
CREATE TYPE "RoutineRunState" AS ENUM ('STARTING', 'RUNNING', 'FINISHED', 'FAILED', 'STOPPED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiProviderVendor" AS ENUM ('anthropic', 'openai', 'google', 'openrouter', 'openai_compatible', 'assemblyai', 'inworld', 'cloud');

-- CreateEnum
CREATE TYPE "AiProviderCredentialKind" AS ENUM ('api_key', 'subscription', 'none');

-- CreateEnum
CREATE TYPE "AiProviderState" AS ENUM ('works', 'key_refused', 'out_of_credit', 'unreachable', 'not_available', 'disconnected');

-- CreateEnum
CREATE TYPE "AiProviderRecordAction" AS ENUM ('added', 'key_replaced', 'renamed', 'removed', 'revoked', 'state_changed');

-- CreateEnum
CREATE TYPE "AiProviderRecordActor" AS ENUM ('organisation_admin', 'machine', 'cloud_controller', 'hq');

-- CreateEnum
CREATE TYPE "ModelListOwner" AS ENUM ('organisation', 'agent', 'project', 'person');

-- CreateEnum
CREATE TYPE "ModelListMode" AS ENUM ('every', 'only_these');

-- CreateEnum
CREATE TYPE "ModelListEffect" AS ENUM ('allow', 'never');

-- CreateEnum
CREATE TYPE "UsageEntryKind" AS ENUM ('CALL', 'ACTUAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "UsagePurpose" AS ENUM ('conversation', 'worker', 'helper', 'title', 'summary', 'stt', 'tts', 'voice_sample', 'workflow_review');

-- CreateEnum
CREATE TYPE "CostBasis" AS ENUM ('ACTUAL', 'ESTIMATED', 'INCLUDED', 'UNPRICED', 'AWAITING_ACTUAL');

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

-- CreateEnum
CREATE TYPE "LivePreviewState" AS ENUM ('STARTING', 'RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "LivePreviewCopyKind" AS ENUM ('BRANCH', 'MAIN', 'BUNDLE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "avatarRecipe" JSONB,
    "coverRecipe" JSONB,
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
    "adaptiveVoice" BOOLEAN NOT NULL DEFAULT true,
    "voiceSounds" BOOLEAN NOT NULL DEFAULT true,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountId" BIGINT NOT NULL,
    "repositorySelection" TEXT,
    "state" "GitHubInstallationState" NOT NULL DEFAULT 'WANTS_TO_CONNECT',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "projectRule" "GitHubProjectRule" NOT NULL DEFAULT 'CHOSEN_PROJECTS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

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
    "isKernel" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "avatarRecipe" JSONB,
    "coverRecipe" JSONB,
    "allowedTools" JSONB,
    "allowedBashPatterns" JSONB,
    "approval" TEXT NOT NULL DEFAULT 'deferred',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "madeFromVersionId" TEXT,

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
    "talkingProviderId" TEXT,
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
    "providerId" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunResult" (
    "runId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT,
    "number" INTEGER,
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
    "relayId" TEXT,
    "livePreviewsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "livePreviewLimit" INTEGER,
    "livePreviewIdleMinutes" INTEGER NOT NULL DEFAULT 120,
    "livePreviewsMemoryHigh" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExecutionSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isHq" BOOLEAN NOT NULL DEFAULT false,
    "credentialHash" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "load" JSONB,
    "state" "RelayState" NOT NULL DEFAULT 'ON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileOpened" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "space" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "workspaceId" TEXT,
    "taskId" TEXT,
    "path" TEXT NOT NULL,
    "pageVersionId" TEXT,
    "version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "siteId" TEXT,
    "relayId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileOpened_pkey" PRIMARY KEY ("id")
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
    "agentSchedules" BOOLEAN NOT NULL DEFAULT false,
    "archiveFinishedAfterDays" INTEGER,
    "fileSkillsDefault" "FileSkillsDefault",
    "personalOwnerId" TEXT,
    "personalSpace" BOOLEAN NOT NULL DEFAULT false,
    "billingProfileId" TEXT,
    "leadUserId" TEXT,
    "defaultGitHubInstallationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "view" "BoardViewKind" NOT NULL,
    "typeId" TEXT,
    "fieldId" TEXT,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "goal" TEXT,
    "startDate" DATE NOT NULL,
    "finishDate" DATE NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "unfinishedCount" INTEGER,
    "unfinishedMovedOn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskType" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'task',
    "kind" "TaskTypeKind" NOT NULL DEFAULT 'CUSTOM',
    "order" INTEGER NOT NULL DEFAULT 0,
    "madeFromVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypeColumn" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'neutral',
    "order" INTEGER NOT NULL,
    "state" "TaskState" NOT NULL,
    "defaultForState" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypeColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'SINGLE_SELECT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "madeFromVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'neutral',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFieldValue" (
    "taskId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskFieldValue_pkey" PRIMARY KEY ("taskId","fieldId")
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
    "position" INTEGER,
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
    "typeId" TEXT,
    "columnId" TEXT,
    "state" "TaskState" NOT NULL DEFAULT 'BACKLOG',
    "rank" TEXT,
    "executionState" "TaskExecutionState" NOT NULL DEFAULT 'NOT_STARTED',
    "sprintId" TEXT,
    "assignedAgentId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "runState" "TaskRunState" NOT NULL DEFAULT 'RUN_NONE',
    "runStateReason" TEXT,
    "runId" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "applicationData" JSONB,
    "lastWorkedAt" TIMESTAMP(3),
    "runStartedBy" TEXT,
    "runOnBehalfOfUserId" TEXT,
    "queueDepth" INTEGER NOT NULL DEFAULT 0,
    "onBehalfOfUserId" TEXT NOT NULL,
    "modelChoice" TEXT,
    "queuedByUserId" TEXT,
    "queuedByAgentId" TEXT,
    "queuedBySessionId" TEXT,
    "scheduleAt" TIMESTAMP(3),
    "scheduleNextDueAt" TIMESTAMP(3),
    "scheduleSetByUserId" TEXT,
    "scheduleSetByAgentId" TEXT,
    "planStart" DATE,
    "planFinish" DATE,
    "epicId" TEXT,
    "milestoneId" TEXT,
    "workspaceId" TEXT,
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
    "avatarRecipe" JSONB,
    "coverRecipe" JSONB,
    "acknowledgedBypassedAgentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "runTimeLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "runTurnLimit" INTEGER NOT NULL DEFAULT 100,
    "automationAgentSchedules" BOOLEAN NOT NULL DEFAULT false,
    "automationMaxDepth" INTEGER NOT NULL DEFAULT 3,
    "archiveFinishedAfterDays" INTEGER DEFAULT 1,
    "setupCompletedAt" TIMESTAMP(3),
    "signInShows" "SignInShows" NOT NULL DEFAULT 'COVER',
    "memoryCertainBar" DOUBLE PRECISION,
    "memoryProbableBar" DOUBLE PRECISION,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultConversationProviderId" TEXT,
    "defaultConversationModel" TEXT,
    "defaultSttProviderId" TEXT,
    "defaultSttModel" TEXT,
    "defaultTtsProviderId" TEXT,
    "defaultTtsModel" TEXT,
    "defaultTtsVoice" TEXT,
    "unsignedAssetsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "outsideInstallers" "OutsideInstallers" NOT NULL DEFAULT 'ADMINS',
    "fileSkillsDefault" "FileSkillsDefault" NOT NULL DEFAULT 'OFF',
    "personalSkillsOutsideSpace" BOOLEAN NOT NULL DEFAULT true,
    "publisherName" TEXT,
    "trustedPackageScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featureSwitches" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "publisher" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "givenToAll" BOOLEAN NOT NULL DEFAULT false,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "switchedOff" BOOLEAN NOT NULL DEFAULT false,
    "setAsideById" TEXT,
    "suitedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "skippedVersion" TEXT,
    "newsSeenVersion" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedAgentId" TEXT,
    "lastUsedPlaceType" "WorkspaceOwnerType",
    "lastUsedPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "source" "AssetVersionSource" NOT NULL,
    "sourceUrl" TEXT,
    "signerKind" "AssetSignerKind" NOT NULL DEFAULT 'NONE',
    "signerIdentity" TEXT,
    "trustedPublisherId" TEXT,
    "basedOn" JSONB NOT NULL DEFAULT '[]',
    "licence" TEXT,
    "note" TEXT,
    "byId" TEXT,
    "requestedByAgentId" TEXT,
    "withdrawn" BOOLEAN NOT NULL DEFAULT false,
    "withdrawnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPinChange" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromVersionId" TEXT,
    "toVersionId" TEXT NOT NULL,
    "byId" TEXT,
    "requestedByAgentId" TEXT,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPinChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetGrant" (
    "assetId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetGrant_pkey" PRIMARY KEY ("assetId","agentId")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "placeSkillId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "authorId" TEXT,
    "proposedByAgentId" TEXT,
    "proposedByRunId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'SKILL',
    "aim" "ProposalAim" NOT NULL,
    "placeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "why" TEXT NOT NULL DEFAULT '',
    "assetId" TEXT,
    "placeSkillId" TEXT,
    "digest" TEXT NOT NULL,
    "agentId" TEXT,
    "forUserId" TEXT,
    "conversationId" TEXT,
    "runId" TEXT,
    "state" "ProposalState" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resultVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedPublisher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "signerKind" "AssetSignerKind" NOT NULL,
    "signerIdentity" TEXT NOT NULL,
    "issuer" TEXT,
    "certificateIdentity" TEXT,
    "repository" TEXT,
    "allowTags" BOOLEAN NOT NULL DEFAULT true,
    "allowedBranch" TEXT,
    "publicKey" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedPublisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryMaintainer" (
    "userId" TEXT NOT NULL,
    "namedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMaintainer_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PlaceSkill" (
    "id" TEXT NOT NULL,
    "placeType" "WorkspaceOwnerType" NOT NULL,
    "placeId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "group" "PlaceSkillGroup" NOT NULL,
    "agentId" TEXT,
    "workspaceId" TEXT,
    "switch" "PlaceSkillSwitch",
    "switchFingerprint" TEXT,
    "switchedById" TEXT,
    "switchedAt" TIMESTAMP(3),
    "lastFingerprint" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "goneAt" TIMESTAMP(3),
    "setAsideReason" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceSkillVersion" (
    "id" TEXT NOT NULL,
    "placeSkillId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "publishedById" TEXT,
    "requestedByAgentId" TEXT,
    "note" TEXT,
    "originIdentity" TEXT,
    "originVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceSkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "avatarRecipe" JSONB,
    "coverRecipe" JSONB,
    "createdBy" TEXT,
    "madeFromVersionId" TEXT,
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
    "runId" TEXT,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "savedFromConversation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "TaskActivityKind" NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "runId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "OrgKnowledgePlacement" (
    "id" TEXT NOT NULL DEFAULT 'org',
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgKnowledgePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChange" (
    "id" TEXT NOT NULL,
    "placeKind" "KnowledgePlaceKind" NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "page" TEXT NOT NULL,
    "kind" "KnowledgeChangeKind" NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "agentId" TEXT,
    "conversationId" TEXT,
    "runId" TEXT,

    CONSTRAINT "KnowledgeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationPlace" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "placeKind" "KnowledgePlaceKind" NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationPlace_pkey" PRIMARY KEY ("id")
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
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "placeType" "WorkspaceOwnerType",
    "placeId" TEXT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" VARCHAR(1600) NOT NULL,
    "kind" "MemoryItemKind" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "recallCount" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRecalledAt" TIMESTAMP(3),
    "writtenByAgentId" TEXT,
    "savedInPlaceType" "WorkspaceOwnerType",
    "savedInPlaceId" TEXT,
    "savedInConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryOutcome" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "kind" "MemoryOutcomeKind" NOT NULL,
    "turnId" TEXT,
    "similarity" DOUBLE PRECISION,
    "weighted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionGrant" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "signedInAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "runnerKind" TEXT NOT NULL,
    "runnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agentId" TEXT,
    "instructions" TEXT NOT NULL DEFAULT '',
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" TEXT,
    "onBehalfOfUserId" TEXT NOT NULL,
    "modelChoice" TEXT,
    "createdByUserId" TEXT,
    "createdByAgentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRun" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "number" INTEGER,
    "dueAt" TIMESTAMP(3),
    "startedByUserId" TEXT,
    "onBehalfOfUserId" TEXT NOT NULL,
    "state" "RoutineRunState" NOT NULL,
    "reason" TEXT,
    "ask" TEXT,
    "sessionId" TEXT,
    "runId" TEXT,
    "siteId" TEXT,
    "timeLimitMinutes" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "AiProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" "AiProviderVendor" NOT NULL,
    "credentialKind" "AiProviderCredentialKind" NOT NULL,
    "baseUrl" TEXT,
    "secret" TEXT,
    "keyHint" TEXT,
    "ownerUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "state" "AiProviderState" NOT NULL DEFAULT 'works',
    "stateSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stateDetail" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastWorkedAt" TIMESTAMP(3),
    "failuresInRow" INTEGER NOT NULL DEFAULT 0,
    "lastFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentModelChoices" (
    "agentId" TEXT NOT NULL,
    "conversationProviderId" TEXT,
    "conversationModel" TEXT,
    "sttProviderId" TEXT,
    "sttModel" TEXT,
    "ttsProviderId" TEXT,
    "ttsModel" TEXT,
    "ttsVoice" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentModelChoices_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "AiProviderRecord" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "action" "AiProviderRecordAction" NOT NULL,
    "actor" "AiProviderRecordActor" NOT NULL,
    "byUserId" TEXT,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProviderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelList" (
    "id" TEXT NOT NULL,
    "owner" "ModelListOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mode" "ModelListMode" NOT NULL DEFAULT 'every',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelListEntry" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "effect" "ModelListEffect" NOT NULL,
    "pattern" TEXT NOT NULL,

    CONSTRAINT "ModelListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEntry" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "UsageEntryKind" NOT NULL,
    "callId" TEXT NOT NULL,
    "refersTo" TEXT,
    "purpose" "UsagePurpose" NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "audioMs" INTEGER NOT NULL DEFAULT 0,
    "characters" INTEGER NOT NULL DEFAULT 0,
    "amountMicros" BIGINT,
    "currency" TEXT,
    "basis" "CostBasis" NOT NULL,
    "priceRef" TEXT,
    "billingProfileId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "userId" TEXT,
    "conversationId" TEXT,
    "runId" TEXT,
    "turnId" TEXT,

    CONSTRAINT "UsageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunCosting" (
    "runId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "conversationId" TEXT,
    "billingProfileId" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "subscription" BOOLEAN NOT NULL DEFAULT false,
    "baseInputTokens" INTEGER NOT NULL DEFAULT 0,
    "baseOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "baseCacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "baseCacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunCosting_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "ProjectBillingChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromProfileId" TEXT,
    "toProfileId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBillingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudUsageCursor" (
    "cloudOrganisationId" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudUsageCursor_pkey" PRIMARY KEY ("cloudOrganisationId")
);

-- CreateTable
CREATE TABLE "RelayUsageReport" (
    "callId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasUsage" BOOLEAN NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "upstreamStatus" INTEGER NOT NULL,
    "errorKind" TEXT,
    "ledgeredAt" TIMESTAMP(3),

    CONSTRAINT "RelayUsageReport_pkey" PRIMARY KEY ("callId")
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
CREATE TABLE "WorkflowSwitch" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "byUserId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowSwitch_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_service_name_key" ON "Provider"("service", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubApp_appId_key" ON "GitHubApp"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE INDEX "GitHubInstallationProject_projectId_idx" ON "GitHubInstallationProject"("projectId");

-- CreateIndex
CREATE INDEX "GitHubInstallationPerson_userId_idx" ON "GitHubInstallationPerson"("userId");

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
CREATE UNIQUE INDEX "AgentSession_conversationId_primaryOwnerType_primaryOwnerId_key" ON "AgentSession"("conversationId", "primaryOwnerType", "primaryOwnerId", "userId", "primaryWorkspaceId", "workerGeneration");

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
CREATE UNIQUE INDEX "RunResult_taskId_number_key" ON "RunResult"("taskId", "number");

-- CreateIndex
CREATE INDEX "ConversationReader_userId_idx" ON "ConversationReader"("userId");

-- CreateIndex
CREATE INDEX "ConversationSegment_conversationId_firstSeq_idx" ON "ConversationSegment"("conversationId", "firstSeq");

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
CREATE INDEX "ExecutionSite_relayId_idx" ON "ExecutionSite"("relayId");

-- CreateIndex
CREATE UNIQUE INDEX "Relay_credentialHash_key" ON "Relay"("credentialHash");

-- CreateIndex
CREATE INDEX "FileOpened_personId_openedAt_idx" ON "FileOpened"("personId", "openedAt");

-- CreateIndex
CREATE INDEX "FileOpened_ownerType_ownerId_openedAt_idx" ON "FileOpened"("ownerType", "ownerId", "openedAt");

-- CreateIndex
CREATE INDEX "FileOpened_openedAt_idx" ON "FileOpened"("openedAt");

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
CREATE INDEX "Project_personalOwnerId_idx" ON "Project"("personalOwnerId");

-- CreateIndex
CREATE INDEX "Board_projectId_idx" ON "Board"("projectId");

-- CreateIndex
CREATE INDEX "Board_typeId_idx" ON "Board"("typeId");

-- CreateIndex
CREATE INDEX "Board_fieldId_idx" ON "Board"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_projectId_number_key" ON "Sprint"("projectId", "number");

-- CreateIndex
CREATE INDEX "TaskType_madeFromVersionId_idx" ON "TaskType"("madeFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskType_projectId_name_key" ON "TaskType"("projectId", "name");

-- CreateIndex
CREATE INDEX "TypeColumn_typeId_order_idx" ON "TypeColumn"("typeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TypeColumn_typeId_name_key" ON "TypeColumn"("typeId", "name");

-- CreateIndex
CREATE INDEX "CustomField_madeFromVersionId_idx" ON "CustomField"("madeFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_projectId_name_key" ON "CustomField"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_fieldId_name_key" ON "FieldOption"("fieldId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_id_fieldId_key" ON "FieldOption"("id", "fieldId");

-- CreateIndex
CREATE INDEX "TaskFieldValue_optionId_idx" ON "TaskFieldValue"("optionId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_date_idx" ON "Milestone"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "Task_projectId_state_idx" ON "Task"("projectId", "state");

-- CreateIndex
CREATE INDEX "Task_projectId_rank_idx" ON "Task"("projectId", "rank");

-- CreateIndex
CREATE INDEX "Task_typeId_idx" ON "Task"("typeId");

-- CreateIndex
CREATE INDEX "Task_columnId_idx" ON "Task"("columnId");

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
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_currentVersionId_key" ON "Asset"("currentVersionId");

-- CreateIndex
CREATE INDEX "Asset_kind_givenToAll_idx" ON "Asset"("kind", "givenToAll");

-- CreateIndex
CREATE INDEX "Asset_kind_builtIn_idx" ON "Asset"("kind", "builtIn");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_kind_publisher_name_key" ON "Asset"("kind", "publisher", "name");

-- CreateIndex
CREATE INDEX "AssetVersion_assetId_createdAt_idx" ON "AssetVersion"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetVersion_digest_idx" ON "AssetVersion"("digest");

-- CreateIndex
CREATE INDEX "AssetVersion_trustedPublisherId_idx" ON "AssetVersion"("trustedPublisherId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_version_key" ON "AssetVersion"("assetId", "version");

-- CreateIndex
CREATE INDEX "AssetPinChange_assetId_at_idx" ON "AssetPinChange"("assetId", "at");

-- CreateIndex
CREATE INDEX "AssetGrant_agentId_idx" ON "AssetGrant"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_assetId_key" ON "Draft"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_placeSkillId_key" ON "Draft"("placeSkillId");

-- CreateIndex
CREATE INDEX "Draft_digest_idx" ON "Draft"("digest");

-- CreateIndex
CREATE INDEX "DraftRevision_digest_idx" ON "DraftRevision"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "DraftRevision_draftId_number_key" ON "DraftRevision"("draftId", "number");

-- CreateIndex
CREATE INDEX "Proposal_aim_placeId_state_idx" ON "Proposal"("aim", "placeId", "state");

-- CreateIndex
CREATE INDEX "Proposal_runId_idx" ON "Proposal"("runId");

-- CreateIndex
CREATE INDEX "Proposal_state_reviewedAt_idx" ON "Proposal"("state", "reviewedAt");

-- CreateIndex
CREATE INDEX "Proposal_digest_idx" ON "Proposal"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedPublisher_name_key" ON "TrustedPublisher"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedPublisher_signerIdentity_key" ON "TrustedPublisher"("signerIdentity");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceSkill_placeType_placeId_path_key" ON "PlaceSkill"("placeType", "placeId", "path");

-- CreateIndex
CREATE INDEX "PlaceSkillVersion_digest_idx" ON "PlaceSkillVersion"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceSkillVersion_placeSkillId_number_key" ON "PlaceSkillVersion"("placeSkillId", "number");

-- CreateIndex
CREATE INDEX "TeamPerson_userId_idx" ON "TeamPerson"("userId");

-- CreateIndex
CREATE INDEX "TeamAgent_agentId_idx" ON "TeamAgent"("agentId");

-- CreateIndex
CREATE INDEX "ProjectTeam_teamId_idx" ON "ProjectTeam"("teamId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskComment_parentId_idx" ON "TaskComment"("parentId");

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskActivity_runId_kind_key" ON "TaskActivity"("runId", "kind");

-- CreateIndex
CREATE INDEX "WorkspacePlacement_siteId_idx" ON "WorkspacePlacement"("siteId");

-- CreateIndex
CREATE INDEX "UserStoragePlacement_siteId_idx" ON "UserStoragePlacement"("siteId");

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
CREATE INDEX "OrgKnowledgePlacement_siteId_idx" ON "OrgKnowledgePlacement"("siteId");

-- CreateIndex
CREATE INDEX "KnowledgeChange_placeKind_projectId_userId_page_createdAt_idx" ON "KnowledgeChange"("placeKind", "projectId", "userId", "page", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChange_projectId_createdAt_idx" ON "KnowledgeChange"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChange_userId_createdAt_idx" ON "KnowledgeChange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationPlace_conversationId_idx" ON "ConversationPlace"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationPlace_projectId_idx" ON "ConversationPlace"("projectId");

-- CreateIndex
CREATE INDEX "ConversationPlace_userId_idx" ON "ConversationPlace"("userId");

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
CREATE INDEX "MemoryItem_userId_archived_idx" ON "MemoryItem"("userId", "archived");

-- CreateIndex
CREATE INDEX "MemoryItem_agentId_idx" ON "MemoryItem"("agentId");

-- CreateIndex
CREATE INDEX "MemoryItem_placeType_placeId_idx" ON "MemoryItem"("placeType", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryItem_scopeKey_key_key" ON "MemoryItem"("scopeKey", "key");

-- CreateIndex
CREATE INDEX "MemoryOutcome_createdAt_idx" ON "MemoryOutcome"("createdAt");

-- CreateIndex
CREATE INDEX "MemoryOutcome_itemId_idx" ON "MemoryOutcome"("itemId");

-- CreateIndex
CREATE INDEX "SubscriptionGrant_providerId_idx" ON "SubscriptionGrant"("providerId");

-- CreateIndex
CREATE INDEX "SubscriptionGrant_expiresAt_idx" ON "SubscriptionGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "Routine_nextDueAt_idx" ON "Routine"("nextDueAt");

-- CreateIndex
CREATE INDEX "Routine_projectId_position_idx" ON "Routine"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRun_sessionId_key" ON "RoutineRun"("sessionId");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_createdAt_idx" ON "RoutineRun"("routineId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_state_idx" ON "RoutineRun"("routineId", "state");

-- CreateIndex
CREATE INDEX "RoutineRun_runId_idx" ON "RoutineRun"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRun_routineId_number_key" ON "RoutineRun"("routineId", "number");

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
CREATE INDEX "AiProvider_ownerUserId_idx" ON "AiProvider"("ownerUserId");

-- CreateIndex
CREATE INDEX "AiProviderRecord_providerId_at_idx" ON "AiProviderRecord"("providerId", "at");

-- CreateIndex
CREATE INDEX "AiProviderRecord_at_idx" ON "AiProviderRecord"("at");

-- CreateIndex
CREATE UNIQUE INDEX "ModelList_owner_ownerId_key" ON "ModelList"("owner", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelListEntry_listId_pattern_key" ON "ModelListEntry"("listId", "pattern");

-- CreateIndex
CREATE INDEX "UsageEntry_at_idx" ON "UsageEntry"("at");

-- CreateIndex
CREATE INDEX "UsageEntry_billingProfileId_at_idx" ON "UsageEntry"("billingProfileId", "at");

-- CreateIndex
CREATE INDEX "UsageEntry_projectId_at_idx" ON "UsageEntry"("projectId", "at");

-- CreateIndex
CREATE INDEX "UsageEntry_callId_idx" ON "UsageEntry"("callId");

-- CreateIndex
CREATE INDEX "UsageEntry_refersTo_idx" ON "UsageEntry"("refersTo");

-- CreateIndex
CREATE INDEX "RunCosting_dispatchedAt_idx" ON "RunCosting"("dispatchedAt");

-- CreateIndex
CREATE INDEX "ProjectBillingChange_projectId_changedAt_idx" ON "ProjectBillingChange"("projectId", "changedAt");

-- CreateIndex
CREATE INDEX "RelayUsageReport_ledgeredAt_receivedAt_idx" ON "RelayUsageReport"("ledgeredAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_placeType_placeId_name_key" ON "Workflow"("placeType", "placeId", "name");

-- CreateIndex
CREATE INDEX "WorkflowSwitch_workflowId_at_idx" ON "WorkflowSwitch"("workflowId", "at");

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
CREATE UNIQUE INDEX "PlaceVariable_placeType_placeId_name_key" ON "PlaceVariable"("placeType", "placeId", "name");

-- CreateIndex
CREATE INDEX "PlaceVariableChange_placeType_placeId_name_at_idx" ON "PlaceVariableChange"("placeType", "placeId", "name", "at");

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

-- CreateIndex
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_key" ON "Session"("id");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationProject" ADD CONSTRAINT "GitHubInstallationProject_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationProject" ADD CONSTRAINT "GitHubInstallationProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationPerson" ADD CONSTRAINT "GitHubInstallationPerson_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallationPerson" ADD CONSTRAINT "GitHubInstallationPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileAuthToken" ADD CONSTRAINT "MobileAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "ExecutionSite" ADD CONSTRAINT "ExecutionSite_relayId_fkey" FOREIGN KEY ("relayId") REFERENCES "Relay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Project" ADD CONSTRAINT "Project_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultGitHubInstallationId_fkey" FOREIGN KEY ("defaultGitHubInstallationId") REFERENCES "GitHubInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeColumn" ADD CONSTRAINT "TypeColumn_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOption" ADD CONSTRAINT "FieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_optionId_fieldId_fkey" FOREIGN KEY ("optionId", "fieldId") REFERENCES "FieldOption"("id", "fieldId") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Task" ADD CONSTRAINT "Task_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TypeColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultConversationProviderId_fkey" FOREIGN KEY ("defaultConversationProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultSttProviderId_fkey" FOREIGN KEY ("defaultSttProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultTtsProviderId_fkey" FOREIGN KEY ("defaultTtsProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "AssetVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_setAsideById_fkey" FOREIGN KEY ("setAsideById") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_trustedPublisherId_fkey" FOREIGN KEY ("trustedPublisherId") REFERENCES "TrustedPublisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPinChange" ADD CONSTRAINT "AssetPinChange_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPinChange" ADD CONSTRAINT "AssetPinChange_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "AssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPinChange" ADD CONSTRAINT "AssetPinChange_toVersionId_fkey" FOREIGN KEY ("toVersionId") REFERENCES "AssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetGrant" ADD CONSTRAINT "AssetGrant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetGrant" ADD CONSTRAINT "AssetGrant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_placeSkillId_fkey" FOREIGN KEY ("placeSkillId") REFERENCES "PlaceSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_placeSkillId_fkey" FOREIGN KEY ("placeSkillId") REFERENCES "PlaceSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMaintainer" ADD CONSTRAINT "LibraryMaintainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSkillVersion" ADD CONSTRAINT "PlaceSkillVersion_placeSkillId_fkey" FOREIGN KEY ("placeSkillId") REFERENCES "PlaceSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSkillVersion" ADD CONSTRAINT "PlaceSkillVersion_digest_fkey" FOREIGN KEY ("digest") REFERENCES "PackageContent"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoragePlacement" ADD CONSTRAINT "UserStoragePlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoragePlacement" ADD CONSTRAINT "UserStoragePlacement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBranch" ADD CONSTRAINT "WorkspaceBranch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBranch" ADD CONSTRAINT "WorkspaceBranch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "WorkspaceBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCopy" ADD CONSTRAINT "BranchCopy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgKnowledgePlacement" ADD CONSTRAINT "OrgKnowledgePlacement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ExecutionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChange" ADD CONSTRAINT "KnowledgeChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChange" ADD CONSTRAINT "KnowledgeChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPlace" ADD CONSTRAINT "ConversationPlace_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPlace" ADD CONSTRAINT "ConversationPlace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPlace" ADD CONSTRAINT "ConversationPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_writtenByAgentId_fkey" FOREIGN KEY ("writtenByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_savedInConversationId_fkey" FOREIGN KEY ("savedInConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryOutcome" ADD CONSTRAINT "MemoryOutcome_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_conversationProviderId_fkey" FOREIGN KEY ("conversationProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_ttsProviderId_fkey" FOREIGN KEY ("ttsProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelListEntry" ADD CONSTRAINT "ModelListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ModelList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEntry" ADD CONSTRAINT "UsageEntry_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowSwitch" ADD CONSTRAINT "WorkflowSwitch_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "LiveApp" ADD CONSTRAINT "LiveApp_livePreviewId_fkey" FOREIGN KEY ("livePreviewId") REFERENCES "LivePreview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAppRun" ADD CONSTRAINT "LiveAppRun_appId_fkey" FOREIGN KEY ("appId") REFERENCES "LiveApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- What the schema cannot express (Prisma models none of it): the partial and expression unique indexes, the
-- check constraints, and the view of each call with its latest cost.
ALTER TABLE "ConversationPlace" ADD CONSTRAINT "ConversationPlace_place_check" CHECK (((("placeKind" = 'PROJECT'::"KnowledgePlaceKind") AND ("projectId" IS NOT NULL) AND ("userId" IS NULL)) OR (("placeKind" = 'USER'::"KnowledgePlaceKind") AND ("userId" IS NOT NULL) AND ("projectId" IS NULL))));
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_one_owner_check" CHECK ((("assetId" IS NULL) <> ("placeSkillId" IS NULL)));
ALTER TABLE "KnowledgeChange" ADD CONSTRAINT "KnowledgeChange_place_check" CHECK (((("placeKind" = 'PROJECT'::"KnowledgePlaceKind") AND ("projectId" IS NOT NULL) AND ("userId" IS NULL)) OR (("placeKind" = 'USER'::"KnowledgePlaceKind") AND ("userId" IS NOT NULL) AND ("projectId" IS NULL)) OR (("placeKind" = 'ORG'::"KnowledgePlaceKind") AND ("projectId" IS NULL) AND ("userId" IS NULL))));
CREATE UNIQUE INDEX "AiProvider_organisation_vendor_key" ON "AiProvider" USING btree (vendor) WHERE ("ownerUserId" IS NULL);
CREATE UNIQUE INDEX "AiProvider_person_vendor_key" ON "AiProvider" USING btree ("ownerUserId", vendor) WHERE ("ownerUserId" IS NOT NULL);
CREATE UNIQUE INDEX "BillingProfile_default_key" ON "BillingProfile" USING btree ("isDefault") WHERE "isDefault";
CREATE UNIQUE INDEX "BillingProfile_name_active_key" ON "BillingProfile" USING btree (name) WHERE ("archivedAt" IS NULL);
CREATE UNIQUE INDEX "ConversationPlace_conversationId_projectId_key" ON "ConversationPlace" USING btree ("conversationId", "projectId") WHERE ("projectId" IS NOT NULL);
CREATE UNIQUE INDEX "ConversationPlace_conversationId_userId_key" ON "ConversationPlace" USING btree ("conversationId", "userId") WHERE ("userId" IS NOT NULL);
CREATE UNIQUE INDEX "Project_personalSpace_owner_key" ON "Project" USING btree ("personalOwnerId") WHERE "personalSpace";
CREATE UNIQUE INDEX "Proposal_open_name_key" ON "Proposal" USING btree (kind, aim, COALESCE("placeId", ''::text), name) WHERE (state = 'OPEN'::"ProposalState");
CREATE UNIQUE INDEX "TaskType_builtIn_key" ON "TaskType" USING btree ("projectId", kind) WHERE (kind = ANY (ARRAY['TASK'::"TaskTypeKind", 'EPIC'::"TaskTypeKind"]));
CREATE UNIQUE INDEX "TypeColumn_default_key" ON "TypeColumn" USING btree ("typeId", state) WHERE "defaultForState";
CREATE UNIQUE INDEX "UsageEntry_call_callId_key" ON "UsageEntry" USING btree ("callId") WHERE (kind = 'CALL'::"UsageEntryKind");
CREATE VIEW "UsageCallCost" AS
 SELECT c.id AS "callRowId",
    c."callId",
    c.at,
    c.purpose,
    c."providerId",
    c."providerName",
    c.model,
    c."inputTokens",
    c."outputTokens",
    c."cacheReadTokens",
    c."cacheWriteTokens",
    c."audioMs",
    c.characters,
    c."billingProfileId",
    c."projectId",
    c."agentId",
    c."userId",
    c."conversationId",
    c."runId",
    c."turnId",
    p."amountMicros",
    COALESCE(p.currency, c.currency) AS currency,
    COALESCE(p.basis, c.basis) AS basis,
    COALESCE(p."priceRef", c."priceRef") AS "priceRef"
   FROM "UsageEntry" c
     LEFT JOIN LATERAL ( SELECT e."amountMicros",
            e.currency,
            e.basis,
            e."priceRef"
           FROM "UsageEntry" e
          WHERE (e.id = c.id OR e."refersTo" = c.id) AND e."amountMicros" IS NOT NULL
          ORDER BY (
                CASE e.kind
                    WHEN 'CORRECTION'::"UsageEntryKind" THEN 2
                    WHEN 'ACTUAL'::"UsageEntryKind" THEN 1
                    ELSE 0
                END) DESC, e."recordedAt" DESC
         LIMIT 1) p ON true
  WHERE c.kind = 'CALL'::"UsageEntryKind";
