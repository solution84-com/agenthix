-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskTypeKind" AS ENUM ('TASK', 'EPIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskExecutionState" AS ENUM ('NOT_STARTED', 'WAITING', 'RUNNING', 'NEEDS_YOU', 'FAILED', 'FINISHED');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('SINGLE_SELECT');

-- CreateEnum
CREATE TYPE "BoardViewKind" AS ENUM ('TYPE', 'STATE', 'EXECUTION', 'FIELD');

-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'TASK_TEMPLATE';

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "fieldId" TEXT,
ADD COLUMN     "filter" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "typeId" TEXT,
ADD COLUMN     "view" "BoardViewKind";

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "kind" "AssetKind" NOT NULL DEFAULT 'SKILL';

-- AlterTable
ALTER TABLE "Routine" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "cron" TEXT,
ADD COLUMN     "instructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nextDueAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "columnId" TEXT,
ADD COLUMN     "executionState" "TaskExecutionState" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "rank" TEXT,
ADD COLUMN     "state" "TaskState" NOT NULL DEFAULT 'BACKLOG',
ADD COLUMN     "typeId" TEXT;

-- CreateTable
CREATE TABLE "TaskType" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'task',
    "kind" "TaskTypeKind" NOT NULL DEFAULT 'CUSTOM',
    "order" INTEGER NOT NULL DEFAULT 0,
    "madeFromVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypeColumn" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'neutral',
    "order" INTEGER NOT NULL,
    "state" "TaskState" NOT NULL,
    "defaultForState" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypeColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'SINGLE_SELECT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "madeFromVersionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'neutral',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFieldValue" (
    "taskId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskFieldValue_pkey" PRIMARY KEY ("taskId","fieldId")
);

-- CreateIndex
CREATE INDEX "TaskType_madeFromVersionId_idx" ON "TaskType"("madeFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskType_projectId_name_key" ON "TaskType"("projectId", "name");

-- CreateIndex
CREATE INDEX "TypeColumn_typeId_order_idx" ON "TypeColumn"("typeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TypeColumn_typeId_name_key" ON "TypeColumn"("typeId", "name");

-- CreateIndex
CREATE INDEX "CustomField_madeFromVersionId_idx" ON "CustomField"("madeFromVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_projectId_name_key" ON "CustomField"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_fieldId_name_key" ON "FieldOption"("fieldId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_id_fieldId_key" ON "FieldOption"("id", "fieldId");

-- CreateIndex
CREATE INDEX "TaskFieldValue_optionId_idx" ON "TaskFieldValue"("optionId");

-- CreateIndex
CREATE INDEX "Board_typeId_idx" ON "Board"("typeId");

-- CreateIndex
CREATE INDEX "Board_fieldId_idx" ON "Board"("fieldId");

-- CreateIndex
CREATE INDEX "Routine_nextDueAt_idx" ON "Routine"("nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_projectId_number_key" ON "Sprint"("projectId", "number");

-- CreateIndex
CREATE INDEX "Task_projectId_state_idx" ON "Task"("projectId", "state");

-- CreateIndex
CREATE INDEX "Task_projectId_rank_idx" ON "Task"("projectId", "rank");

-- CreateIndex
CREATE INDEX "Task_typeId_idx" ON "Task"("typeId");

-- CreateIndex
CREATE INDEX "Task_columnId_idx" ON "Task"("columnId");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeColumn" ADD CONSTRAINT "TypeColumn_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_madeFromVersionId_fkey" FOREIGN KEY ("madeFromVersionId") REFERENCES "AssetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOption" ADD CONSTRAINT "FieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFieldValue" ADD CONSTRAINT "TaskFieldValue_optionId_fieldId_fkey" FOREIGN KEY ("optionId", "fieldId") REFERENCES "FieldOption"("id", "fieldId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "TypeColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One Task and one Epic per project, and one default column per state of a type (partial unique indexes Prisma cannot express).
CREATE UNIQUE INDEX "TaskType_builtIn_key" ON "TaskType"("projectId", "kind") WHERE "kind" IN ('TASK', 'EPIC');
CREATE UNIQUE INDEX "TypeColumn_default_key" ON "TypeColumn"("typeId", "state") WHERE "defaultForState";

-- Ranks compare by code unit (core/src/tasks/rank.ts); the database must sort them the same way.
ALTER TABLE "Task" ALTER COLUMN "rank" TYPE TEXT COLLATE "C";
