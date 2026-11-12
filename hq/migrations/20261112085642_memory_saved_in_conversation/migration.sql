-- AlterTable
ALTER TABLE "MemoryItem" ADD COLUMN     "savedInConversationId" TEXT;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_savedInConversationId_fkey" FOREIGN KEY ("savedInConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

