-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "lastUsedAgentId" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "lastUsedPlaceId" TEXT,
ADD COLUMN     "lastUsedPlaceType" "WorkspaceOwnerType",
ADD COLUMN     "newsSeenVersion" TEXT,
ADD COLUMN     "skippedVersion" TEXT;

-- AlterTable
ALTER TABLE "PlaceSkill" ADD COLUMN     "lastUsedAgentId" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlaceSkillVersion" ADD COLUMN     "originIdentity" TEXT,
ADD COLUMN     "originVersion" TEXT;

