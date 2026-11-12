-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "avatarRecipe" JSONB,
ADD COLUMN     "coverRecipe" JSONB;

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "avatarRecipe" JSONB,
ADD COLUMN     "coverRecipe" JSONB;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "avatarRecipe" JSONB,
ADD COLUMN     "coverRecipe" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarRecipe" JSONB,
ADD COLUMN     "coverRecipe" JSONB,
ADD COLUMN     "coverUrl" TEXT;

