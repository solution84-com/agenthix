-- DropIndex
DROP INDEX "AgentSession_conversationId_primaryOwnerType_primaryOwnerId_key";

-- DropIndex
DROP INDEX "Conversation_workspaceId_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "workspaceId";

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_conversationId_primaryOwnerType_primaryOwnerId_key" ON "AgentSession"("conversationId", "primaryOwnerType", "primaryOwnerId", "userId", "primaryWorkspaceId", "workerGeneration");

