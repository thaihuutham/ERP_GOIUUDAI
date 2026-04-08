-- CreateEnum
CREATE TYPE "ConversationMessageOrigin" AS ENUM ('EXTERNAL', 'USER', 'CAMPAIGN', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiConversationJobStatus" AS ENUM (
  'QUEUED',
  'DISPATCHING',
  'DISPATCHED',
  'CALLBACK_RECEIVED',
  'REPLIED',
  'RETRIED',
  'FAILED',
  'HANDOFF',
  'SKIPPED_TAKEOVER',
  'SKIPPED_DISABLED'
);

-- CreateEnum
CREATE TYPE "AiConversationOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD');

-- AlterTable
ALTER TABLE "ConversationMessage"
ADD COLUMN "origin" "ConversationMessageOrigin" NOT NULL DEFAULT 'EXTERNAL',
ADD COLUMN "metadataJson" JSONB;

-- CreateTable
CREATE TABLE "ai_industries" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "industryKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "knowledgeSpaceRef" TEXT,
  "piiMaskEnabled" BOOLEAN NOT NULL DEFAULT true,
  "piiMaskConfigJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_routing_channel_accounts" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "channel" "ConversationChannel" NOT NULL,
  "channelAccountId" TEXT NOT NULL,
  "industryId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_routing_channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_industry_bindings" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "industryId" TEXT NOT NULL,
  "workflowKey" TEXT NOT NULL,
  "agentKey" TEXT,
  "webhookPath" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_industry_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_jobs" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "channel" "ConversationChannel" NOT NULL,
  "channelAccountId" TEXT,
  "customerMessageId" TEXT,
  "industryId" TEXT,
  "industryKeySnapshot" TEXT,
  "workflowKeySnapshot" TEXT,
  "agentKeySnapshot" TEXT,
  "routingMode" TEXT NOT NULL DEFAULT 'legacy',
  "status" "AiConversationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "requestPayloadJson" JSONB,
  "callbackPayloadJson" JSONB,
  "resultMetadataJson" JSONB,
  "replyMessageId" TEXT,
  "lastErrorMessage" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchedAt" TIMESTAMP(3),
  "callbackReceivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_conversation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_outbox" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "AiConversationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptNo" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_conversation_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_industries_tenant_Id_industryKey_key" ON "ai_industries"("tenant_Id", "industryKey");

-- CreateIndex
CREATE INDEX "ai_industries_tenant_Id_idx" ON "ai_industries"("tenant_Id");

-- CreateIndex
CREATE INDEX "ai_industries_tenant_Id_isActive_idx" ON "ai_industries"("tenant_Id", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ai_routing_channel_accounts_tenant_Id_channel_channelAccount_key" ON "ai_routing_channel_accounts"("tenant_Id", "channel", "channelAccountId");

-- CreateIndex
CREATE INDEX "ai_routing_channel_accounts_tenant_Id_idx" ON "ai_routing_channel_accounts"("tenant_Id");

-- CreateIndex
CREATE INDEX "ai_routing_channel_accounts_tenant_Id_industryId_isActive_idx" ON "ai_routing_channel_accounts"("tenant_Id", "industryId", "isActive");

-- CreateIndex
CREATE INDEX "ai_routing_channel_accounts_tenant_Id_channel_isActive_idx" ON "ai_routing_channel_accounts"("tenant_Id", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ai_industry_bindings_tenant_Id_industryId_key" ON "ai_industry_bindings"("tenant_Id", "industryId");

-- CreateIndex
CREATE INDEX "ai_industry_bindings_tenant_Id_idx" ON "ai_industry_bindings"("tenant_Id");

-- CreateIndex
CREATE INDEX "ai_industry_bindings_tenant_Id_isActive_idx" ON "ai_industry_bindings"("tenant_Id", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_jobs_tenant_Id_eventId_key" ON "ai_conversation_jobs"("tenant_Id", "eventId");

-- CreateIndex
CREATE INDEX "ai_conversation_jobs_tenant_Id_idx" ON "ai_conversation_jobs"("tenant_Id");

-- CreateIndex
CREATE INDEX "ai_conversation_jobs_tenant_Id_threadId_createdAt_idx" ON "ai_conversation_jobs"("tenant_Id", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversation_jobs_tenant_Id_status_nextRetryAt_idx" ON "ai_conversation_jobs"("tenant_Id", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ai_conversation_jobs_tenant_Id_channel_channelAccountId_createdAt_idx" ON "ai_conversation_jobs"("tenant_Id", "channel", "channelAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_outbox_tenant_Id_eventId_key" ON "ai_conversation_outbox"("tenant_Id", "eventId");

-- CreateIndex
CREATE INDEX "ai_conversation_outbox_tenant_Id_idx" ON "ai_conversation_outbox"("tenant_Id");

-- CreateIndex
CREATE INDEX "ai_conversation_outbox_tenant_Id_status_nextRetryAt_createdAt_idx" ON "ai_conversation_outbox"("tenant_Id", "status", "nextRetryAt", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversation_outbox_tenant_Id_jobId_createdAt_idx" ON "ai_conversation_outbox"("tenant_Id", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_tenant_Id_threadId_origin_sentAt_idx" ON "ConversationMessage"("tenant_Id", "threadId", "origin", "sentAt");

-- AddForeignKey
ALTER TABLE "ai_routing_channel_accounts" ADD CONSTRAINT "ai_routing_channel_accounts_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "ai_industries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_industry_bindings" ADD CONSTRAINT "ai_industry_bindings_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "ai_industries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_jobs" ADD CONSTRAINT "ai_conversation_jobs_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_jobs" ADD CONSTRAINT "ai_conversation_jobs_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "ai_industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_outbox" ADD CONSTRAINT "ai_conversation_outbox_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_conversation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
