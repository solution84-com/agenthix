-- CreateEnum
CREATE TYPE "KnowledgePlaceKind" AS ENUM ('PROJECT', 'USER', 'ORG');

-- CreateEnum
CREATE TYPE "KnowledgeChangeKind" AS ENUM ('CREATED', 'EDITED', 'MOVED', 'DELETED', 'RESTORED');

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
    "fromPage" TEXT,
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


-- A row names the place its kind says, and only that: a project, a person's own storage, or the organisation.
ALTER TABLE "KnowledgeChange" ADD CONSTRAINT "KnowledgeChange_place_check" CHECK (
  ("placeKind" = 'PROJECT' AND "projectId" IS NOT NULL AND "userId" IS NULL) OR
  ("placeKind" = 'USER' AND "userId" IS NOT NULL AND "projectId" IS NULL) OR
  ("placeKind" = 'ORG' AND "projectId" IS NULL AND "userId" IS NULL)
);

-- A conversation adds a project or a person's own storage; the organisation is always in reach, never added.
ALTER TABLE "ConversationPlace" ADD CONSTRAINT "ConversationPlace_place_check" CHECK (
  ("placeKind" = 'PROJECT' AND "projectId" IS NOT NULL AND "userId" IS NULL) OR
  ("placeKind" = 'USER' AND "userId" IS NOT NULL AND "projectId" IS NULL)
);

-- A place is added to a conversation once.
CREATE UNIQUE INDEX "ConversationPlace_conversationId_projectId_key" ON "ConversationPlace"("conversationId", "projectId") WHERE "projectId" IS NOT NULL;
CREATE UNIQUE INDEX "ConversationPlace_conversationId_userId_key" ON "ConversationPlace"("conversationId", "userId") WHERE "userId" IS NOT NULL;
