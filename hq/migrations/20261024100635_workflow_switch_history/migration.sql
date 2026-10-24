-- CreateTable
CREATE TABLE "WorkflowSwitch" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "byUserId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowSwitch_workflowId_at_idx" ON "WorkflowSwitch"("workflowId", "at");

-- AddForeignKey
ALTER TABLE "WorkflowSwitch" ADD CONSTRAINT "WorkflowSwitch_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
