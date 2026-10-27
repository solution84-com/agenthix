-- CreateEnum
CREATE TYPE "RelayState" AS ENUM ('ON', 'QUIET', 'REMOVED');

-- AlterTable
ALTER TABLE "ExecutionSite" ADD COLUMN     "relayId" TEXT;

-- CreateTable
CREATE TABLE "Relay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isHq" BOOLEAN NOT NULL DEFAULT false,
    "credentialHash" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "load" JSONB,
    "state" "RelayState" NOT NULL DEFAULT 'ON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Relay_credentialHash_key" ON "Relay"("credentialHash");

-- CreateIndex
CREATE INDEX "ExecutionSite_relayId_idx" ON "ExecutionSite"("relayId");

-- AddForeignKey
ALTER TABLE "ExecutionSite" ADD CONSTRAINT "ExecutionSite_relayId_fkey" FOREIGN KEY ("relayId") REFERENCES "Relay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

