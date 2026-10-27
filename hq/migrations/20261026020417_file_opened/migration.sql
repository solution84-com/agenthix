-- CreateTable
CREATE TABLE "FileOpened" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "space" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "workspaceId" TEXT,
    "taskId" TEXT,
    "path" TEXT NOT NULL,
    "pageVersionId" TEXT,
    "version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "siteId" TEXT,
    "relayId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileOpened_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileOpened_personId_openedAt_idx" ON "FileOpened"("personId", "openedAt");

-- CreateIndex
CREATE INDEX "FileOpened_ownerType_ownerId_openedAt_idx" ON "FileOpened"("ownerType", "ownerId", "openedAt");

-- CreateIndex
CREATE INDEX "FileOpened_openedAt_idx" ON "FileOpened"("openedAt");

