-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "voiceEnabled",
DROP COLUMN "voiceId",
DROP COLUMN "voiceTtsModel";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "modelChoice" TEXT;

-- AlterTable
ALTER TABLE "Routine" ADD COLUMN     "modelChoice" TEXT;

