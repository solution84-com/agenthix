-- CreateTable
CREATE TABLE "RelayUsageReport" (
    "callId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasUsage" BOOLEAN NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "upstreamStatus" INTEGER NOT NULL,
    "errorKind" TEXT,
    "ledgeredAt" TIMESTAMP(3),

    CONSTRAINT "RelayUsageReport_pkey" PRIMARY KEY ("callId")
);

-- CreateIndex
CREATE INDEX "RelayUsageReport_ledgeredAt_receivedAt_idx" ON "RelayUsageReport"("ledgeredAt", "receivedAt");

-- CreateIndex
CREATE INDEX "RelayUsageReport_runId_idx" ON "RelayUsageReport"("runId");

