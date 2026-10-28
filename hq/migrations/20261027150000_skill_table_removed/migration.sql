-- DropForeignKey
ALTER TABLE "Skill" DROP CONSTRAINT "Skill_orgId_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectToSkill" DROP CONSTRAINT "_ProjectToSkill_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectToSkill" DROP CONSTRAINT "_ProjectToSkill_B_fkey";

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "publisherName" TEXT;

-- DropTable
DROP TABLE "Skill";

-- DropTable
DROP TABLE "_ProjectToSkill";

-- DropEnum
DROP TYPE "SkillScope";

