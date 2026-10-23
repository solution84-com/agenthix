-- CreateTable
CREATE TABLE "RunCosting" (
    "runId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "conversationId" TEXT,
    "billingProfileId" TEXT NOT NULL,
    "providerId" TEXT,
    "model" TEXT,
    "subscription" BOOLEAN NOT NULL DEFAULT false,
    "baseInputTokens" INTEGER NOT NULL DEFAULT 0,
    "baseOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "baseCacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "baseCacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunCosting_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "ProjectBillingChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromProfileId" TEXT,
    "toProfileId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBillingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunCosting_dispatchedAt_idx" ON "RunCosting"("dispatchedAt");

-- CreateIndex
CREATE INDEX "ProjectBillingChange_projectId_changedAt_idx" ON "ProjectBillingChange"("projectId", "changedAt");

-- CreateIndex
CREATE INDEX "UsageEntry_refersTo_idx" ON "UsageEntry"("refersTo");


-- Each call's cost: its latest row with an amount (hq/src/billing/callCostView.sql)
-- Each call's cost (models from one place, part 5, R1): one row per CALL row, carrying the amount of the latest row
-- with an amount that is the call or points at it. A CORRECTION wins over an ACTUAL, an ACTUAL over the call itself,
-- and among rows of one kind the later written. A call no row prices keeps its own basis with no amount.
-- The migration that adds the ledger's report creates this view; every report reads it, so all read the same cost.
CREATE VIEW "UsageCallCost" AS
SELECT
  c."id" AS "callRowId", c."callId", c."at", c."purpose", c."providerId", c."providerName", c."model",
  c."inputTokens", c."outputTokens", c."cacheReadTokens", c."cacheWriteTokens", c."audioMs", c."characters",
  c."billingProfileId", c."projectId", c."agentId", c."userId", c."conversationId", c."runId", c."turnId",
  p."amountMicros",
  COALESCE(p."currency", c."currency") AS "currency",
  COALESCE(p."basis", c."basis") AS "basis",
  COALESCE(p."priceRef", c."priceRef") AS "priceRef"
FROM "UsageEntry" c
LEFT JOIN LATERAL (
  SELECT e."amountMicros", e."currency", e."basis", e."priceRef"
  FROM "UsageEntry" e
  WHERE (e."id" = c."id" OR e."refersTo" = c."id") AND e."amountMicros" IS NOT NULL
  ORDER BY CASE e."kind" WHEN 'CORRECTION' THEN 2 WHEN 'ACTUAL' THEN 1 ELSE 0 END DESC, e."recordedAt" DESC
  LIMIT 1
) p ON TRUE
WHERE c."kind" = 'CALL';
