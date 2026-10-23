-- Clean slate: grants pointed at ModelCredential rows, which go; none is carried over.
DELETE FROM "SubscriptionGrant";

-- DropForeignKey
ALTER TABLE "SubscriptionGrant" DROP CONSTRAINT "SubscriptionGrant_credentialId_fkey";

-- DropIndex
DROP INDEX "SubscriptionGrant_credentialId_idx";

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "accessKind",
DROP COLUMN "accessOwnerType",
DROP COLUMN "refusedAccess",
DROP COLUMN "talkingProvider",
ADD COLUMN     "talkingProviderId" TEXT;

-- AlterTable
ALTER TABLE "InferenceTurn" DROP COLUMN "provider",
ADD COLUMN     "providerId" TEXT;

-- AlterTable
ALTER TABLE "AgentOverride" DROP COLUMN "model";

-- AlterTable
ALTER TABLE "SubscriptionGrant" DROP COLUMN "credentialId",
ADD COLUMN     "providerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "ModelPolicy";

-- DropTable
DROP TABLE "ModelCredential";

-- DropEnum
DROP TYPE "ConversationAccessKind";

-- DropEnum
DROP TYPE "ModelCredentialProvider";

-- DropEnum
DROP TYPE "ModelCredentialKind";

-- DropEnum
DROP TYPE "ModelCredentialOwnerType";

-- CreateIndex
CREATE INDEX "SubscriptionGrant_providerId_idx" ON "SubscriptionGrant"("providerId");

-- AddForeignKey
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

