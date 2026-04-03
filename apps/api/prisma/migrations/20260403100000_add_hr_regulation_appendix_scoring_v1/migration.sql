-- HR Regulation 2026 v1: Appendix digitization + daily scoring + PIP
CREATE TYPE "HrAppendixCode" AS ENUM ('PL01', 'PL02', 'PL03', 'PL04', 'PL05', 'PL06', 'PL10');
CREATE TYPE "HrAppendixSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "HrAppendixEvidenceType" AS ENUM ('LINK', 'FILE');
CREATE TYPE "HrAppendixRevisionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "HrDailyScoreStatus" AS ENUM ('PROVISIONAL', 'FINAL');
CREATE TYPE "HrPipCaseStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

CREATE TABLE "HrAppendixTemplate" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "appendixCode" "HrAppendixCode" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "formSchemaJson" JSONB,
  "activeRulesJson" JSONB,
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrAppendixTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAppendixSubmission" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "appendixCode" "HrAppendixCode" NOT NULL,
  "templateId" TEXT,
  "employeeId" TEXT NOT NULL,
  "workDate" TIMESTAMP(3),
  "period" TEXT,
  "payloadJson" JSONB,
  "status" "HrAppendixSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "dueAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "approverId" TEXT,
  "decisionNote" TEXT,
  "workflowDefinitionId" TEXT,
  "workflowInstanceId" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrAppendixSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAppendixEvidence" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "evidenceType" "HrAppendixEvidenceType" NOT NULL,
  "url" TEXT,
  "objectKey" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrAppendixEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrAppendixRevision" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "requestedBy" TEXT,
  "payloadJson" JSONB,
  "reason" TEXT,
  "status" "HrAppendixRevisionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approverId" TEXT,
  "decisionNote" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrAppendixRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrScoreRoleTemplate" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "roleGroup" TEXT NOT NULL,
  "pillarWeights" JSONB,
  "thresholds" JSONB,
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrScoreRoleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrDailyScoreSnapshot" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workDate" TIMESTAMP(3) NOT NULL,
  "outputScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "HrDailyScoreStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "freezeAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "reasonsJson" JSONB,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrDailyScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrPipCase" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sourceSubmissionId" TEXT,
  "triggerReason" TEXT NOT NULL,
  "baselineJson" JSONB,
  "goalsJson" JSONB,
  "status" "HrPipCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "openedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "closedReason" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrPipCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HrAppendixTemplate_tenant_Id_appendixCode_version_key" ON "HrAppendixTemplate"("tenant_Id", "appendixCode", "version");
CREATE INDEX "HrAppendixTemplate_tenant_Id_idx" ON "HrAppendixTemplate"("tenant_Id");
CREATE INDEX "HrAppendixTemplate_tenant_Id_appendixCode_status_idx" ON "HrAppendixTemplate"("tenant_Id", "appendixCode", "status");

CREATE INDEX "HrAppendixSubmission_tenant_Id_idx" ON "HrAppendixSubmission"("tenant_Id");
CREATE INDEX "HrAppendixSubmission_tenant_Id_appendixCode_status_idx" ON "HrAppendixSubmission"("tenant_Id", "appendixCode", "status");
CREATE INDEX "HrAppendixSubmission_tenant_Id_employeeId_workDate_idx" ON "HrAppendixSubmission"("tenant_Id", "employeeId", "workDate");
CREATE INDEX "HrAppendixSubmission_tenant_Id_employeeId_period_idx" ON "HrAppendixSubmission"("tenant_Id", "employeeId", "period");
CREATE INDEX "HrAppendixSubmission_tenant_Id_workflowInstanceId_idx" ON "HrAppendixSubmission"("tenant_Id", "workflowInstanceId");

CREATE INDEX "HrAppendixEvidence_tenant_Id_idx" ON "HrAppendixEvidence"("tenant_Id");
CREATE INDEX "HrAppendixEvidence_tenant_Id_submissionId_idx" ON "HrAppendixEvidence"("tenant_Id", "submissionId");
CREATE INDEX "HrAppendixEvidence_tenant_Id_evidenceType_idx" ON "HrAppendixEvidence"("tenant_Id", "evidenceType");

CREATE INDEX "HrAppendixRevision_tenant_Id_idx" ON "HrAppendixRevision"("tenant_Id");
CREATE INDEX "HrAppendixRevision_tenant_Id_submissionId_status_idx" ON "HrAppendixRevision"("tenant_Id", "submissionId", "status");
CREATE INDEX "HrAppendixRevision_tenant_Id_createdAt_idx" ON "HrAppendixRevision"("tenant_Id", "createdAt");

CREATE UNIQUE INDEX "HrScoreRoleTemplate_tenant_Id_roleGroup_key" ON "HrScoreRoleTemplate"("tenant_Id", "roleGroup");
CREATE INDEX "HrScoreRoleTemplate_tenant_Id_idx" ON "HrScoreRoleTemplate"("tenant_Id");
CREATE INDEX "HrScoreRoleTemplate_tenant_Id_status_idx" ON "HrScoreRoleTemplate"("tenant_Id", "status");

CREATE UNIQUE INDEX "HrDailyScoreSnapshot_tenant_Id_employeeId_workDate_key" ON "HrDailyScoreSnapshot"("tenant_Id", "employeeId", "workDate");
CREATE INDEX "HrDailyScoreSnapshot_tenant_Id_idx" ON "HrDailyScoreSnapshot"("tenant_Id");
CREATE INDEX "HrDailyScoreSnapshot_tenant_Id_workDate_status_idx" ON "HrDailyScoreSnapshot"("tenant_Id", "workDate", "status");

CREATE INDEX "HrPipCase_tenant_Id_idx" ON "HrPipCase"("tenant_Id");
CREATE INDEX "HrPipCase_tenant_Id_employeeId_status_idx" ON "HrPipCase"("tenant_Id", "employeeId", "status");
CREATE INDEX "HrPipCase_tenant_Id_sourceSubmissionId_idx" ON "HrPipCase"("tenant_Id", "sourceSubmissionId");

ALTER TABLE "HrAppendixSubmission"
  ADD CONSTRAINT "HrAppendixSubmission_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "HrAppendixTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HrAppendixEvidence"
  ADD CONSTRAINT "HrAppendixEvidence_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "HrAppendixSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HrAppendixRevision"
  ADD CONSTRAINT "HrAppendixRevision_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "HrAppendixSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HrPipCase"
  ADD CONSTRAINT "HrPipCase_sourceSubmissionId_fkey"
  FOREIGN KEY ("sourceSubmissionId") REFERENCES "HrAppendixSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
