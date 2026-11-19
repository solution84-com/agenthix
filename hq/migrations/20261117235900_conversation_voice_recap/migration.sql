-- The voice recap: under 100 words on where the conversation is, written after each reply, read by the light model.
ALTER TABLE "Conversation" ADD COLUMN "voiceRecap" TEXT;
