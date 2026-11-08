-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "goal" TEXT,
ADD COLUMN     "unfinishedCount" INTEGER,
ADD COLUMN     "unfinishedMovedOn" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "boardId" DROP NOT NULL;

