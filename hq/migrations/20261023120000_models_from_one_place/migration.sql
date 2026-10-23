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
CREATE TYPE "UsagePurpose" AS ENUM ('conversation', 'worker', 'helper', 'title', 'summary', 'stt', 'tts', 'voice_sample');

-- CreateEnum
CREATE TYPE "CostBasis" AS ENUM ('ACTUAL', 'ESTIMATED', 'INCLUDED', 'UNPRICED', 'AWAITING_ACTUAL');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingProfileId" TEXT,
ADD COLUMN     "personalSpace" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "defaultConversationModel" TEXT,
ADD COLUMN     "defaultConversationProviderId" TEXT,
ADD COLUMN     "defaultSttModel" TEXT,
ADD COLUMN     "defaultSttProviderId" TEXT,
ADD COLUMN     "defaultTtsModel" TEXT,
ADD COLUMN     "defaultTtsProviderId" TEXT,
ADD COLUMN     "defaultTtsVoice" TEXT,
ADD COLUMN     "defaultWorkerModel" TEXT,
ADD COLUMN     "defaultWorkerProviderId" TEXT,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

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
    "workerProviderId" TEXT,
    "workerModel" TEXT,
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
CREATE TABLE "CloudUsageCursor" (
    "cloudOrganisationId" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudUsageCursor_pkey" PRIMARY KEY ("cloudOrganisationId")
);

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

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultConversationProviderId_fkey" FOREIGN KEY ("defaultConversationProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultWorkerProviderId_fkey" FOREIGN KEY ("defaultWorkerProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultSttProviderId_fkey" FOREIGN KEY ("defaultSttProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_defaultTtsProviderId_fkey" FOREIGN KEY ("defaultTtsProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProvider" ADD CONSTRAINT "AiProvider_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_conversationProviderId_fkey" FOREIGN KEY ("conversationProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_workerProviderId_fkey" FOREIGN KEY ("workerProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_sttProviderId_fkey" FOREIGN KEY ("sttProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelChoices" ADD CONSTRAINT "AgentModelChoices_ttsProviderId_fkey" FOREIGN KEY ("ttsProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelListEntry" ADD CONSTRAINT "ModelListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ModelList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEntry" ADD CONSTRAINT "UsageEntry_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "BillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Partial unique indexes Prisma's schema cannot express (each is named in a comment in schema.prisma)
CREATE UNIQUE INDEX "AiProvider_organisation_vendor_key" ON "AiProvider"("vendor") WHERE "ownerUserId" IS NULL;
CREATE UNIQUE INDEX "AiProvider_person_vendor_key" ON "AiProvider"("ownerUserId", "vendor") WHERE "ownerUserId" IS NOT NULL;
CREATE UNIQUE INDEX "BillingProfile_default_key" ON "BillingProfile"("isDefault") WHERE "isDefault";
CREATE UNIQUE INDEX "BillingProfile_name_active_key" ON "BillingProfile"("name") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "UsageEntry_call_callId_key" ON "UsageEntry"("callId") WHERE "kind" = 'CALL';
CREATE UNIQUE INDEX "Project_personalSpace_owner_key" ON "Project"("personalOwnerId") WHERE "personalSpace";
