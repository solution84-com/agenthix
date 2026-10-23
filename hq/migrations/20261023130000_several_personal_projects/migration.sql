-- DropIndex
DROP INDEX "Project_personalOwnerId_key";

-- CreateIndex
CREATE INDEX "Project_personalOwnerId_idx" ON "Project"("personalOwnerId");

