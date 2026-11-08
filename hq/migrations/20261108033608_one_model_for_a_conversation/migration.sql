-- DropForeignKey
ALTER TABLE "AgentModelChoices" DROP CONSTRAINT "AgentModelChoices_workerProviderId_fkey";

-- DropForeignKey
ALTER TABLE "Org" DROP CONSTRAINT "Org_defaultWorkerProviderId_fkey";

-- AlterTable
ALTER TABLE "AgentModelChoices" DROP COLUMN "workerModel",
DROP COLUMN "workerProviderId";

-- AlterTable
ALTER TABLE "Org" DROP COLUMN "defaultWorkerModel",
DROP COLUMN "defaultWorkerProviderId";

