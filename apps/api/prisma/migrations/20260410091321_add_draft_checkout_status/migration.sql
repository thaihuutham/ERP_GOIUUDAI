-- AlterEnum
ALTER TYPE "CheckoutOrderStatus" ADD VALUE 'DRAFT';

-- DropIndex
DROP INDEX "ReportRun_tenant_Id_runStatus_createdAt_idx";

-- AlterTable
ALTER TABLE "UserPositionAssignment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_archive_manifests" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_chain_state" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "Approval_tenant_migratedFromApprovalId_idx" RENAME TO "Approval_tenant_Id_migratedFromApprovalId_idx";

-- RenameIndex
ALTER INDEX "Approval_tenant_requester_status_createdAt_idx" RENAME TO "Approval_tenant_Id_requesterId_status_createdAt_idx";

-- RenameIndex
ALTER INDEX "Approval_tenant_status_approver_dueAt_idx" RENAME TO "Approval_tenant_Id_status_approverId_dueAt_idx";

-- RenameIndex
ALTER INDEX "PersonalIncomeTaxRecord_tenant_Id_employeeId_taxYear_taxMonth_k" RENAME TO "PersonalIncomeTaxRecord_tenant_Id_employeeId_taxYear_taxMon_key";

-- RenameIndex
ALTER INDEX "ai_conversation_jobs_tenant_Id_channel_channelAccountId_created" RENAME TO "ai_conversation_jobs_tenant_Id_channel_channelAccountId_cre_idx";

-- RenameIndex
ALTER INDEX "ai_conversation_outbox_tenant_Id_status_nextRetryAt_createdAt_i" RENAME TO "ai_conversation_outbox_tenant_Id_status_nextRetryAt_created_idx";

-- RenameIndex
ALTER INDEX "ai_routing_channel_accounts_tenant_Id_channel_channelAccount_ke" RENAME TO "ai_routing_channel_accounts_tenant_Id_channel_channelAccoun_key";

-- RenameIndex
ALTER INDEX "audit_archive_manifests_tenant_status_window_start_idx" RENAME TO "audit_archive_manifests_tenant_Id_status_windowStart_idx";

-- RenameIndex
ALTER INDEX "audit_archive_manifests_tenant_window_range_idx" RENAME TO "audit_archive_manifests_tenant_Id_windowStart_windowEnd_idx";

-- RenameIndex
ALTER INDEX "audit_chain_state_tenant_idx" RENAME TO "audit_chain_state_tenant_Id_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_action_created_idx" RENAME TO "audit_logs_tenant_Id_action_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_actor_created_idx" RENAME TO "audit_logs_tenant_Id_actorId_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_entity_created_idx" RENAME TO "audit_logs_tenant_Id_entityType_entityId_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_module_created_idx" RENAME TO "audit_logs_tenant_Id_module_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_operation_created_idx" RENAME TO "audit_logs_tenant_Id_operationType_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_tenant_request_idx" RENAME TO "audit_logs_tenant_Id_requestId_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_accounts_tenant_Id_campaignId_status_nextSendAt_i" RENAME TO "zalo_campaign_accounts_tenant_Id_campaignId_status_nextSend_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_message_attempts_tenant_Id_campaignAccountId_atte" RENAME TO "zalo_campaign_message_attempts_tenant_Id_campaignAccountId__idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_message_attempts_tenant_Id_campaignId_attemptedAt" RENAME TO "zalo_campaign_message_attempts_tenant_Id_campaignId_attempt_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_message_attempts_tenant_Id_recipientId_attemptedA" RENAME TO "zalo_campaign_message_attempts_tenant_Id_recipientId_attemp_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_operators_tenant_Id_campaignId_userId_revokedAt_i" RENAME TO "zalo_campaign_operators_tenant_Id_campaignId_userId_revoked_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_recipients_tenant_Id_campaignId_status_targetAcco" RENAME TO "zalo_campaign_recipients_tenant_Id_campaignId_status_target_idx";

-- RenameIndex
ALTER INDEX "zalo_campaign_recipients_tenant_Id_campaignId_targetAccountId_s" RENAME TO "zalo_campaign_recipients_tenant_Id_campaignId_targetAccount_idx";
