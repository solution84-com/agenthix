-- DropForeignKey
ALTER TABLE "Board" DROP CONSTRAINT "Board_templateId_fkey";

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "madeFromVersionId" TEXT;

-- AlterTable
ALTER TABLE "Board" DROP COLUMN "templateId",
ADD COLUMN     "madeFromVersionId" TEXT;

-- DropTable
DROP TABLE "AgentTemplate";

-- DropTable
DROP TABLE "BoardTemplate";

-- CreateIndex
CREATE INDEX "Board_madeFromVersionId_idx" ON "Board"("madeFromVersionId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

