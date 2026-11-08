-- DropForeignKey
ALTER TABLE "Sprint" DROP CONSTRAINT "Sprint_boardId_fkey";

-- DropIndex
DROP INDEX "Sprint_boardId_number_key";

-- AlterTable
ALTER TABLE "Routine" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sprint" DROP COLUMN "boardId",
ALTER COLUMN "projectId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Routine_projectId_position_idx" ON "Routine"("projectId", "position");

