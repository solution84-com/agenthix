-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('SKILL', 'AGENT', 'BOARD', 'TEAM');

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

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "fileSkillsDefault" "FileSkillsDefault" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "outsideInstallers" "OutsideInstallers" NOT NULL DEFAULT 'ADMINS',
ADD COLUMN     "personalSkillsOutsideSpace" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsignedAssetsAllowed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "fileSkillsDefault" "FileSkillsDefault";

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
    "goneAt" TIMESTAMP(3),
    "setAsideReason" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceSkillVersion_pkey" PRIMARY KEY ("id")
);

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


-- Written by hand: Prisma cannot express these (see the schema's doc comments).
-- One open proposal per name per place.
CREATE UNIQUE INDEX "Proposal_open_name_key" ON "Proposal"("aim", COALESCE("placeId", ''), "name") WHERE "state" = 'OPEN';

-- A draft belongs to exactly one owner: a Library asset or a place skill.
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_one_owner_check" CHECK (("assetId" IS NULL) <> ("placeSkillId" IS NULL));
