-- Board templates (the built-ins hq seeds at boot, and any proposed or published) are wiped: until 0.1.0-rc.1 nothing is converted.
DELETE FROM "Proposal" WHERE "kind" = 'BOARD';
DELETE FROM "Asset" WHERE "kind" = 'BOARD';

-- AlterEnum
BEGIN;
CREATE TYPE "AssetKind_new" AS ENUM ('SKILL', 'AGENT', 'TEAM', 'TASK_TEMPLATE');
ALTER TABLE "Proposal" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "Asset" ALTER COLUMN "kind" TYPE "AssetKind_new" USING ("kind"::text::"AssetKind_new");
ALTER TABLE "Proposal" ALTER COLUMN "kind" TYPE "AssetKind_new" USING ("kind"::text::"AssetKind_new");
ALTER TYPE "AssetKind" RENAME TO "AssetKind_old";
ALTER TYPE "AssetKind_new" RENAME TO "AssetKind";
DROP TYPE "AssetKind_old";
ALTER TABLE "Proposal" ALTER COLUMN "kind" SET DEFAULT 'SKILL';
COMMIT;

