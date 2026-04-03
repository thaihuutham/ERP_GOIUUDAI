ALTER TABLE "Approval"
  ADD COLUMN "assignmentType" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN "assignmentSource" TEXT,
  ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "requiredApprovals" INTEGER,
  ADD COLUMN "resolutionMetaJson" JSONB,
  ADD COLUMN "escalationCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "decisionActorId" TEXT,
  ADD COLUMN "migratedFromApprovalId" TEXT;

UPDATE "Approval"
SET
  "assignmentSource" = COALESCE("assignmentSource", "approverId"),
  "assignmentType" = CASE
    WHEN "approverId" LIKE 'ROLE:%' THEN 'ROLE'
    WHEN "approverId" LIKE 'DEPT:%' THEN 'DEPARTMENT'
    ELSE 'USER'
  END;

CREATE INDEX IF NOT EXISTS "Approval_tenant_status_approver_dueAt_idx"
  ON "Approval"("tenant_Id", "status", "approverId", "dueAt");

CREATE INDEX IF NOT EXISTS "Approval_tenant_requester_status_createdAt_idx"
  ON "Approval"("tenant_Id", "requesterId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Approval_tenant_migratedFromApprovalId_idx"
  ON "Approval"("tenant_Id", "migratedFromApprovalId");
