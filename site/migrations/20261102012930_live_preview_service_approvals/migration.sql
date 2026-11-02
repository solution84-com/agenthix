-- CreateTable
CREATE TABLE "LivePreviewServiceApproval" (
    "workspaceId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "declarationHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivePreviewServiceApproval_pkey" PRIMARY KEY ("workspaceId","service","declarationHash")
);

