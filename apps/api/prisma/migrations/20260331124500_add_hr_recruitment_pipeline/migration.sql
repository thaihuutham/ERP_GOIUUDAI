-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentStage') THEN
    CREATE TYPE "RecruitmentStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentApplicationStatus') THEN
    CREATE TYPE "RecruitmentApplicationStatus" AS ENUM ('ACTIVE', 'REJECTED', 'WITHDRAWN', 'HIRED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentSource') THEN
    CREATE TYPE "RecruitmentSource" AS ENUM (
      'REFERRAL',
      'JOB_BOARD',
      'SOCIAL_MEDIA',
      'CAREER_SITE',
      'AGENCY',
      'CAMPUS',
      'OTHER'
    );
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentInterviewStatus') THEN
    CREATE TYPE "RecruitmentInterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitmentOfferStatus') THEN
    CREATE TYPE "RecruitmentOfferStatus" AS ENUM (
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'ACCEPTED',
      'DECLINED',
      'CANCELED'
    );
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentRequisition" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "code" TEXT,
  "title" TEXT NOT NULL,
  "department" TEXT,
  "positionId" TEXT,
  "recruiterId" TEXT,
  "hiringManagerId" TEXT,
  "openings" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruitmentRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentCandidate" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "source" "RecruitmentSource" NOT NULL DEFAULT 'OTHER',
  "cvExternalUrl" TEXT,
  "currentCompany" TEXT,
  "yearsExperience" DOUBLE PRECISION,
  "note" TEXT,
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruitmentCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentApplication" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "recruiterId" TEXT,
  "currentStage" "RecruitmentStage" NOT NULL DEFAULT 'APPLIED',
  "status" "RecruitmentApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hiredAt" TIMESTAMP(3),
  "convertedEmployeeId" TEXT,
  "rejectedReason" TEXT,
  "withdrawnReason" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruitmentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentStageHistory" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStage" "RecruitmentStage",
  "toStage" "RecruitmentStage",
  "fromStatus" "RecruitmentApplicationStatus",
  "toStatus" "RecruitmentApplicationStatus",
  "actionType" TEXT NOT NULL,
  "reason" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecruitmentStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentInterview" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "stage" "RecruitmentStage" NOT NULL DEFAULT 'INTERVIEW',
  "interviewerId" TEXT,
  "interviewerName" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "mode" TEXT,
  "location" TEXT,
  "meetingUrl" TEXT,
  "feedback" TEXT,
  "score" DOUBLE PRECISION,
  "status" "RecruitmentInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruitmentInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitmentOffer" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "offeredPosition" TEXT,
  "offeredLevel" TEXT,
  "offeredSalary" DECIMAL(18,2),
  "currency" TEXT,
  "proposedStartDate" TIMESTAMP(3),
  "note" TEXT,
  "status" "RecruitmentOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "workflowInstanceId" TEXT,
  "workflowDefinitionId" TEXT,
  "offeredAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruitmentOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentRequisition_tenant_Id_code_key"
ON "RecruitmentRequisition"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentRequisition_tenant_Id_idx"
ON "RecruitmentRequisition"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentRequisition_tenant_Id_status_idx"
ON "RecruitmentRequisition"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentRequisition_tenant_Id_recruiterId_idx"
ON "RecruitmentRequisition"("tenant_Id", "recruiterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentCandidate_tenant_Id_idx"
ON "RecruitmentCandidate"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentCandidate_tenant_Id_status_idx"
ON "RecruitmentCandidate"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentCandidate_tenant_Id_source_idx"
ON "RecruitmentCandidate"("tenant_Id", "source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentCandidate_tenant_Id_email_idx"
ON "RecruitmentCandidate"("tenant_Id", "email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentCandidate_tenant_Id_phone_idx"
ON "RecruitmentCandidate"("tenant_Id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_requisitionId_candidateId_key"
ON "RecruitmentApplication"("tenant_Id", "requisitionId", "candidateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_idx"
ON "RecruitmentApplication"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_currentStage_idx"
ON "RecruitmentApplication"("tenant_Id", "currentStage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_status_idx"
ON "RecruitmentApplication"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_recruiterId_idx"
ON "RecruitmentApplication"("tenant_Id", "recruiterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_requisitionId_idx"
ON "RecruitmentApplication"("tenant_Id", "requisitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_candidateId_idx"
ON "RecruitmentApplication"("tenant_Id", "candidateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentApplication_tenant_Id_convertedEmployeeId_idx"
ON "RecruitmentApplication"("tenant_Id", "convertedEmployeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentStageHistory_tenant_Id_idx"
ON "RecruitmentStageHistory"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentStageHistory_tenant_Id_applicationId_createdAt_idx"
ON "RecruitmentStageHistory"("tenant_Id", "applicationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentInterview_tenant_Id_idx"
ON "RecruitmentInterview"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentInterview_tenant_Id_applicationId_scheduledAt_idx"
ON "RecruitmentInterview"("tenant_Id", "applicationId", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentInterview_tenant_Id_status_idx"
ON "RecruitmentInterview"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentOffer_tenant_Id_idx"
ON "RecruitmentOffer"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentOffer_tenant_Id_applicationId_idx"
ON "RecruitmentOffer"("tenant_Id", "applicationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentOffer_tenant_Id_status_idx"
ON "RecruitmentOffer"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecruitmentOffer_tenant_Id_workflowInstanceId_idx"
ON "RecruitmentOffer"("tenant_Id", "workflowInstanceId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RecruitmentApplication_requisitionId_fkey'
      AND table_name = 'RecruitmentApplication'
  ) THEN
    ALTER TABLE "RecruitmentApplication"
      ADD CONSTRAINT "RecruitmentApplication_requisitionId_fkey"
      FOREIGN KEY ("requisitionId") REFERENCES "RecruitmentRequisition"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RecruitmentApplication_candidateId_fkey'
      AND table_name = 'RecruitmentApplication'
  ) THEN
    ALTER TABLE "RecruitmentApplication"
      ADD CONSTRAINT "RecruitmentApplication_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RecruitmentStageHistory_applicationId_fkey'
      AND table_name = 'RecruitmentStageHistory'
  ) THEN
    ALTER TABLE "RecruitmentStageHistory"
      ADD CONSTRAINT "RecruitmentStageHistory_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RecruitmentInterview_applicationId_fkey'
      AND table_name = 'RecruitmentInterview'
  ) THEN
    ALTER TABLE "RecruitmentInterview"
      ADD CONSTRAINT "RecruitmentInterview_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RecruitmentOffer_applicationId_fkey'
      AND table_name = 'RecruitmentOffer'
  ) THEN
    ALTER TABLE "RecruitmentOffer"
      ADD CONSTRAINT "RecruitmentOffer_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill legacy Recruitment rows to ATS tables
WITH mapped AS (
  SELECT
    r.*,
    CASE
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%screen%' THEN 'SCREENING'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%interview%' OR LOWER(COALESCE(r."stage", '')) LIKE '%phong van%' THEN 'INTERVIEW'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%assessment%' OR LOWER(COALESCE(r."stage", '')) LIKE '%test%' OR LOWER(COALESCE(r."stage", '')) LIKE '%danh gia%' THEN 'ASSESSMENT'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%offer%' OR LOWER(COALESCE(r."stage", '')) LIKE '%de nghi%' THEN 'OFFER'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%hired%' OR LOWER(COALESCE(r."stage", '')) LIKE '%nhan viec%' THEN 'HIRED'
      ELSE 'APPLIED'
    END AS stage_text,
    CASE
      WHEN r."status" = 'APPROVED' THEN 'HIRED'
      WHEN r."status" = 'REJECTED' THEN 'REJECTED'
      WHEN r."status" IN ('INACTIVE', 'ARCHIVED') THEN 'WITHDRAWN'
      ELSE 'ACTIVE'
    END AS app_status_text
  FROM "Recruitment" r
)
INSERT INTO "RecruitmentRequisition" (
  "id",
  "tenant_Id",
  "code",
  "title",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('legacy_req_', m."id"),
  m."tenant_Id",
  CONCAT('LEGACY-', m."id"),
  COALESCE(NULLIF(TRIM(m."jobTitle"), ''), 'Legacy Role'),
  'ACTIVE'::"GenericStatus",
  m."createdAt",
  m."updatedAt"
FROM mapped m
WHERE NOT EXISTS (
  SELECT 1
  FROM "RecruitmentRequisition" rr
  WHERE rr."id" = CONCAT('legacy_req_', m."id")
);

WITH mapped AS (
  SELECT *
  FROM "Recruitment"
)
INSERT INTO "RecruitmentCandidate" (
  "id",
  "tenant_Id",
  "fullName",
  "source",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('legacy_candidate_', m."id"),
  m."tenant_Id",
  COALESCE(NULLIF(TRIM(m."candidateName"), ''), CONCAT('Legacy Candidate ', m."id")),
  'OTHER'::"RecruitmentSource",
  'ACTIVE'::"GenericStatus",
  m."createdAt",
  m."updatedAt"
FROM mapped m
WHERE NOT EXISTS (
  SELECT 1
  FROM "RecruitmentCandidate" rc
  WHERE rc."id" = CONCAT('legacy_candidate_', m."id")
);

WITH mapped AS (
  SELECT
    r.*,
    CASE
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%screen%' THEN 'SCREENING'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%interview%' OR LOWER(COALESCE(r."stage", '')) LIKE '%phong van%' THEN 'INTERVIEW'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%assessment%' OR LOWER(COALESCE(r."stage", '')) LIKE '%test%' OR LOWER(COALESCE(r."stage", '')) LIKE '%danh gia%' THEN 'ASSESSMENT'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%offer%' OR LOWER(COALESCE(r."stage", '')) LIKE '%de nghi%' THEN 'OFFER'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%hired%' OR LOWER(COALESCE(r."stage", '')) LIKE '%nhan viec%' THEN 'HIRED'
      ELSE 'APPLIED'
    END AS stage_text,
    CASE
      WHEN r."status" = 'APPROVED' THEN 'HIRED'
      WHEN r."status" = 'REJECTED' THEN 'REJECTED'
      WHEN r."status" IN ('INACTIVE', 'ARCHIVED') THEN 'WITHDRAWN'
      ELSE 'ACTIVE'
    END AS app_status_text
  FROM "Recruitment" r
)
INSERT INTO "RecruitmentApplication" (
  "id",
  "tenant_Id",
  "requisitionId",
  "candidateId",
  "currentStage",
  "status",
  "appliedAt",
  "stageEnteredAt",
  "lastActivityAt",
  "hiredAt",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('legacy_application_', m."id"),
  m."tenant_Id",
  CONCAT('legacy_req_', m."id"),
  CONCAT('legacy_candidate_', m."id"),
  (
    CASE
      WHEN m.app_status_text = 'HIRED' THEN 'HIRED'
      ELSE m.stage_text
    END
  )::"RecruitmentStage",
  m.app_status_text::"RecruitmentApplicationStatus",
  m."createdAt",
  m."updatedAt",
  m."updatedAt",
  CASE WHEN m.app_status_text = 'HIRED' THEN m."updatedAt" ELSE NULL END,
  CONCAT('Backfilled from legacy Recruitment row ', m."id"),
  m."createdAt",
  m."updatedAt"
FROM mapped m
WHERE NOT EXISTS (
  SELECT 1
  FROM "RecruitmentApplication" ra
  WHERE ra."id" = CONCAT('legacy_application_', m."id")
);

WITH mapped AS (
  SELECT
    r.*,
    CASE
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%screen%' THEN 'SCREENING'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%interview%' OR LOWER(COALESCE(r."stage", '')) LIKE '%phong van%' THEN 'INTERVIEW'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%assessment%' OR LOWER(COALESCE(r."stage", '')) LIKE '%test%' OR LOWER(COALESCE(r."stage", '')) LIKE '%danh gia%' THEN 'ASSESSMENT'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%offer%' OR LOWER(COALESCE(r."stage", '')) LIKE '%de nghi%' THEN 'OFFER'
      WHEN LOWER(COALESCE(r."stage", '')) LIKE '%hired%' OR LOWER(COALESCE(r."stage", '')) LIKE '%nhan viec%' THEN 'HIRED'
      ELSE 'APPLIED'
    END AS stage_text,
    CASE
      WHEN r."status" = 'APPROVED' THEN 'HIRED'
      WHEN r."status" = 'REJECTED' THEN 'REJECTED'
      WHEN r."status" IN ('INACTIVE', 'ARCHIVED') THEN 'WITHDRAWN'
      ELSE 'ACTIVE'
    END AS app_status_text
  FROM "Recruitment" r
)
INSERT INTO "RecruitmentStageHistory" (
  "id",
  "tenant_Id",
  "applicationId",
  "toStage",
  "toStatus",
  "actionType",
  "reason",
  "createdAt"
)
SELECT
  CONCAT('legacy_history_', m."id"),
  m."tenant_Id",
  CONCAT('legacy_application_', m."id"),
  (
    CASE
      WHEN m.app_status_text = 'HIRED' THEN 'HIRED'
      ELSE m.stage_text
    END
  )::"RecruitmentStage",
  m.app_status_text::"RecruitmentApplicationStatus",
  'BACKFILLED_LEGACY',
  'Migrated from legacy Recruitment table',
  m."updatedAt"
FROM mapped m
WHERE NOT EXISTS (
  SELECT 1
  FROM "RecruitmentStageHistory" sh
  WHERE sh."id" = CONCAT('legacy_history_', m."id")
);
