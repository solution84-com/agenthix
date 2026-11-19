-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "voiceExpressiveTone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "voiceHums" BOOLEAN NOT NULL DEFAULT true;
