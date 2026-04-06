-- CreateEnum
CREATE TYPE "ZaloCampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ZaloCampaignSelectionPolicy" AS ENUM ('PRIORITIZE_RECENT_INTERACTION', 'AVOID_PREVIOUSLY_INTERACTED_ACCOUNT');

-- CreateEnum
CREATE TYPE "ZaloCampaignAccountStatus" AS ENUM ('READY', 'PAUSED_ERROR', 'DONE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ZaloCampaignRecipientStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ZaloCampaignAttemptStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "zalo_campaigns" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "status" "ZaloCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "windowMorningStartMinutes" INTEGER NOT NULL DEFAULT 420,
    "windowMorningEndMinutes" INTEGER NOT NULL DEFAULT 690,
    "windowAfternoonStartMinutes" INTEGER NOT NULL DEFAULT 840,
    "windowAfternoonEndMinutes" INTEGER NOT NULL DEFAULT 1200,
    "delayMinSeconds" INTEGER NOT NULL DEFAULT 180,
    "delayMaxSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxConsecutiveErrors" INTEGER NOT NULL DEFAULT 3,
    "maxRecipients" INTEGER,
    "selectionPolicy" "ZaloCampaignSelectionPolicy" NOT NULL DEFAULT 'PRIORITIZE_RECENT_INTERACTION',
    "allowedVariableKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientFilterJson" JSONB,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_campaign_accounts" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "zaloAccountId" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "quota" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveErrorCount" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "status" "ZaloCampaignAccountStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_campaign_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_campaign_operators" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_campaign_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_campaign_recipients" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalThreadId" TEXT,
    "targetAccountId" TEXT,
    "status" "ZaloCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "failedReason" TEXT,
    "variablePayloadJson" JSONB,
    "customerSnapshotJson" JSONB,
    "messagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_campaign_message_attempts" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignAccountId" TEXT,
    "recipientId" TEXT,
    "customerId" TEXT,
    "zaloAccountId" TEXT,
    "externalThreadId" TEXT,
    "status" "ZaloCampaignAttemptStatus" NOT NULL,
    "renderedContent" TEXT,
    "missingVariables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "responseJson" JSONB,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_campaign_message_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zalo_campaigns_tenant_Id_idx" ON "zalo_campaigns"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_campaigns_tenant_Id_status_idx" ON "zalo_campaigns"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX "zalo_campaigns_tenant_Id_createdAt_idx" ON "zalo_campaigns"("tenant_Id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_campaigns_tenant_Id_code_key" ON "zalo_campaigns"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "zalo_campaign_accounts_tenant_Id_idx" ON "zalo_campaign_accounts"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_campaign_accounts_tenant_Id_campaignId_status_nextSendAt_idx" ON "zalo_campaign_accounts"("tenant_Id", "campaignId", "status", "nextSendAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_accounts_tenant_Id_zaloAccountId_status_idx" ON "zalo_campaign_accounts"("tenant_Id", "zaloAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_campaign_accounts_tenant_Id_campaignId_zaloAccountId_key" ON "zalo_campaign_accounts"("tenant_Id", "campaignId", "zaloAccountId");

-- CreateIndex
CREATE INDEX "zalo_campaign_operators_tenant_Id_idx" ON "zalo_campaign_operators"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_campaign_operators_tenant_Id_campaignId_userId_revokedAt_idx" ON "zalo_campaign_operators"("tenant_Id", "campaignId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_operators_tenant_Id_userId_revokedAt_idx" ON "zalo_campaign_operators"("tenant_Id", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_recipients_tenant_Id_idx" ON "zalo_campaign_recipients"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_campaign_recipients_tenant_Id_campaignId_status_targetAccountId_createdAt_idx" ON "zalo_campaign_recipients"("tenant_Id", "campaignId", "status", "targetAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_recipients_tenant_Id_campaignId_targetAccountId_status_idx" ON "zalo_campaign_recipients"("tenant_Id", "campaignId", "targetAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_campaign_recipients_tenant_Id_campaignId_customerId_key" ON "zalo_campaign_recipients"("tenant_Id", "campaignId", "customerId");

-- CreateIndex
CREATE INDEX "zalo_campaign_message_attempts_tenant_Id_idx" ON "zalo_campaign_message_attempts"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_campaign_message_attempts_tenant_Id_campaignId_attemptedAt_idx" ON "zalo_campaign_message_attempts"("tenant_Id", "campaignId", "attemptedAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_message_attempts_tenant_Id_recipientId_attemptedAt_idx" ON "zalo_campaign_message_attempts"("tenant_Id", "recipientId", "attemptedAt");

-- CreateIndex
CREATE INDEX "zalo_campaign_message_attempts_tenant_Id_campaignAccountId_attemptedAt_idx" ON "zalo_campaign_message_attempts"("tenant_Id", "campaignAccountId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "zalo_campaign_accounts" ADD CONSTRAINT "zalo_campaign_accounts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "zalo_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_accounts" ADD CONSTRAINT "zalo_campaign_accounts_zaloAccountId_fkey" FOREIGN KEY ("zaloAccountId") REFERENCES "ZaloAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_operators" ADD CONSTRAINT "zalo_campaign_operators_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "zalo_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_recipients" ADD CONSTRAINT "zalo_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "zalo_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_recipients" ADD CONSTRAINT "zalo_campaign_recipients_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_recipients" ADD CONSTRAINT "zalo_campaign_recipients_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "ZaloAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_message_attempts" ADD CONSTRAINT "zalo_campaign_message_attempts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "zalo_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_message_attempts" ADD CONSTRAINT "zalo_campaign_message_attempts_campaignAccountId_fkey" FOREIGN KEY ("campaignAccountId") REFERENCES "zalo_campaign_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_message_attempts" ADD CONSTRAINT "zalo_campaign_message_attempts_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "zalo_campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_message_attempts" ADD CONSTRAINT "zalo_campaign_message_attempts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_campaign_message_attempts" ADD CONSTRAINT "zalo_campaign_message_attempts_zaloAccountId_fkey" FOREIGN KEY ("zaloAccountId") REFERENCES "ZaloAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
