-- Clean slate before 0.1.0-rc.1: memory is reshaped, not carried over.
DELETE FROM "MemoryOutcome";
DELETE FROM "MemoryItem";

-- AlterEnum
BEGIN;
CREATE TYPE "MemoryItemKind_new" AS ENUM ('FACT', 'RULE');
ALTER TABLE "MemoryItem" ALTER COLUMN "kind" TYPE "MemoryItemKind_new" USING ("kind"::text::"MemoryItemKind_new");
ALTER TYPE "MemoryItemKind" RENAME TO "MemoryItemKind_old";
ALTER TYPE "MemoryItemKind_new" RENAME TO "MemoryItemKind";
DROP TYPE "MemoryItemKind_old";
COMMIT;

-- DropIndex
DROP INDEX "MemoryItem_agentId_placeType_placeId_idx";

-- DropIndex
DROP INDEX "MemoryItem_scopeKey_archived_idx";

-- DropIndex
DROP INDEX "MemoryItem_userId_idx";

-- AlterTable
ALTER TABLE "MemoryItem" DROP COLUMN "pinned",
DROP COLUMN "scope",
DROP COLUMN "writtenByUserId",
ADD COLUMN     "savedInPlaceId" TEXT,
ADD COLUMN     "savedInPlaceType" "WorkspaceOwnerType",
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MemoryOutcome" ADD COLUMN     "weighted" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "MemoryScope";

-- CreateIndex
CREATE INDEX "MemoryItem_userId_archived_idx" ON "MemoryItem"("userId", "archived");

-- CreateIndex
CREATE INDEX "MemoryItem_agentId_idx" ON "MemoryItem"("agentId");

-- CreateIndex
CREATE INDEX "MemoryItem_placeType_placeId_idx" ON "MemoryItem"("placeType", "placeId");

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_writtenByAgentId_fkey" FOREIGN KEY ("writtenByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

