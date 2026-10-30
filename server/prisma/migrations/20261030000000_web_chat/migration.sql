-- Additive: existing conversations remain WhatsApp. No historical records are removed.
ALTER TABLE "Conversation" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'WHATSAPP';
CREATE INDEX "Conversation_channel_updatedAt_idx" ON "Conversation"("channel", "updatedAt");
CREATE TABLE "WebSession" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "tokenHash" TEXT NOT NULL,
 "conversationId" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WebSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WebSession_tokenHash_key" ON "WebSession"("tokenHash");
CREATE UNIQUE INDEX "WebSession_conversationId_key" ON "WebSession"("conversationId");
CREATE INDEX "WebSession_expiresAt_idx" ON "WebSession"("expiresAt");
CREATE TABLE "PublicRateBucket" (
 "key" TEXT NOT NULL PRIMARY KEY,
 "hits" INTEGER NOT NULL DEFAULT 1,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PublicRateBucket_expiresAt_idx" ON "PublicRateBucket"("expiresAt");
