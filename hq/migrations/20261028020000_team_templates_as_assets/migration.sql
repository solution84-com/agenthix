-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "madeFromVersionId" TEXT;

-- DropTable
DROP TABLE "WorkforceTemplate";

-- DropEnum
DROP TYPE "LibrarySource";

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

