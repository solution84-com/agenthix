-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "defaultModel",
DROP COLUMN "runtime";

-- AlterTable
ALTER TABLE "Org" DROP COLUMN "memoryEmbeddingModel",
DROP COLUMN "memoryEmbeddingNext";

