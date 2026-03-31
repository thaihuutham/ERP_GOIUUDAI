CREATE TYPE "HrGoalTrackingMode" AS ENUM ('MANUAL', 'AUTO', 'HYBRID');

ALTER TABLE "Order"
  ADD COLUMN "employeeId" TEXT;

ALTER TABLE "HrGoal"
  ADD COLUMN "trackingMode" "HrGoalTrackingMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "autoCurrentValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "manualAdjustmentValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "workflowDefinitionId" TEXT,
  ADD COLUMN "workflowInstanceId" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "lastAutoSyncedAt" TIMESTAMP(3);

ALTER TABLE "HrGoal"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

UPDATE "Order" o
SET "employeeId" = e."id"
FROM "Employee" e
WHERE o."employeeId" IS NULL
  AND o."tenant_Id" = e."tenant_Id"
  AND (
    o."createdBy" = e."id"
    OR (e."code" IS NOT NULL AND o."createdBy" = e."code")
    OR (e."email" IS NOT NULL AND LOWER(o."createdBy") = LOWER(e."email"))
  );

UPDATE "HrGoal"
SET
  "trackingMode" = 'MANUAL',
  "autoCurrentValue" = 0,
  "manualAdjustmentValue" = COALESCE("currentValue", 0),
  "approvedAt" = CASE
    WHEN "status" = 'APPROVED' THEN COALESCE("completedAt", "updatedAt")
    ELSE "approvedAt"
  END,
  "rejectedAt" = CASE
    WHEN "status" = 'REJECTED' THEN "updatedAt"
    ELSE "rejectedAt"
  END;

CREATE TABLE "HrGoalMetricBinding" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "configJson" JSONB,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "lastComputedValue" DECIMAL(18,2),
  "lastComputedAt" TIMESTAMP(3),
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HrGoalMetricBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HrGoalTimeline" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorId" TEXT,
  "fromStatus" "GenericStatus",
  "toStatus" "GenericStatus",
  "progressPercent" DOUBLE PRECISION,
  "note" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HrGoalTimeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Order_tenant_Id_employeeId_idx" ON "Order"("tenant_Id", "employeeId");
CREATE INDEX "HrGoal_tenant_Id_trackingMode_idx" ON "HrGoal"("tenant_Id", "trackingMode");
CREATE INDEX "HrGoal_tenant_Id_workflowInstanceId_idx" ON "HrGoal"("tenant_Id", "workflowInstanceId");
CREATE INDEX "HrGoalMetricBinding_tenant_Id_idx" ON "HrGoalMetricBinding"("tenant_Id");
CREATE INDEX "HrGoalMetricBinding_tenant_Id_goalId_idx" ON "HrGoalMetricBinding"("tenant_Id", "goalId");
CREATE INDEX "HrGoalMetricBinding_tenant_Id_sourceSystem_metricKey_idx" ON "HrGoalMetricBinding"("tenant_Id", "sourceSystem", "metricKey");
CREATE INDEX "HrGoalTimeline_tenant_Id_idx" ON "HrGoalTimeline"("tenant_Id");
CREATE INDEX "HrGoalTimeline_tenant_Id_goalId_createdAt_idx" ON "HrGoalTimeline"("tenant_Id", "goalId", "createdAt");

ALTER TABLE "HrGoalMetricBinding"
  ADD CONSTRAINT "HrGoalMetricBinding_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "HrGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HrGoalTimeline"
  ADD CONSTRAINT "HrGoalTimeline_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "HrGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
