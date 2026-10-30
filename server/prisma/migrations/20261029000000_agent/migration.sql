-- Additive migration. Existing delivery history remains UNKNOWN.
ALTER TABLE "Message"
 ADD COLUMN "source" TEXT NOT NULL DEFAULT 'HUMAN',
 ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN "deliveryError" TEXT,
 ADD COLUMN "statusAt" TIMESTAMP(3),
 ADD COLUMN "mediaId" TEXT,
 ADD COLUMN "mimeType" TEXT,
 ADD COLUMN "replyToId" TEXT;
CREATE UNIQUE INDEX "Message_replyToId_key" ON "Message"("replyToId");
CREATE TABLE "ReplyJob" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "messageId" TEXT NOT NULL,
 "conversationId" TEXT NOT NULL,
 "sequence" BIGSERIAL NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3),
 "errorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReplyJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReplyJob_messageId_key" ON "ReplyJob"("messageId");
CREATE UNIQUE INDEX "ReplyJob_sequence_key" ON "ReplyJob"("sequence");
CREATE INDEX "ReplyJob_state_availableAt_idx" ON "ReplyJob"("state", "availableAt");
CREATE INDEX "ReplyJob_conversationId_sequence_idx" ON "ReplyJob"("conversationId", "sequence");
