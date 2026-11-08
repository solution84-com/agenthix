-- DropForeignKey
ALTER TABLE "Board" DROP CONSTRAINT "Board_madeFromVersionId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_boardId_fkey";

-- Boards that were not saved views (every Project Tasks board and old workflow board) are wiped once no task points at them: until 0.1.0-rc.1 nothing is converted.
DELETE FROM "Board" WHERE "view" IS NULL;

-- DropIndex
DROP INDEX "Board_madeFromVersionId_idx";

-- DropIndex
DROP INDEX "Board_projectId_kind_idx";

-- DropIndex
DROP INDEX "Task_boardId_column_idx";

-- AlterTable
ALTER TABLE "Board" DROP COLUMN "archivedAt",
DROP COLUMN "columns",
DROP COLUMN "kind",
DROP COLUMN "madeFromVersionId",
ALTER COLUMN "view" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "boardId",
DROP COLUMN "column";

-- DropEnum
DROP TYPE "BoardKind";

-- CreateIndex
CREATE INDEX "Board_projectId_idx" ON "Board"("projectId");

