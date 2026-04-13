-- Migration: Replace ElearningQuestionTag enum with dynamic ElearningQuestionCategory table
-- and convert tags/category columns from enum to plain text.

-- 1. Create ElearningQuestionCategory table
CREATE TABLE "ElearningQuestionCategory" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElearningQuestionCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElearningQuestionCategory_tenant_Id_code_key"
    ON "ElearningQuestionCategory"("tenant_Id", "code");

CREATE INDEX "ElearningQuestionCategory_tenant_Id_status_idx"
    ON "ElearningQuestionCategory"("tenant_Id", "status");

-- 2. Seed 7 default categories for every existing tenant
INSERT INTO "ElearningQuestionCategory" ("id", "tenant_Id", "code", "label", "color", "sortOrder", "updatedAt")
SELECT
    gen_random_uuid()::text,
    t."tenant_Id",
    v.code,
    v.label,
    v.color,
    v.sort_order,
    NOW()
FROM "Tenant" t
CROSS JOIN (VALUES
    ('GENERAL',    'Chung',           '#6B7280', 0),
    ('SALES',      'Kinh doanh',      '#3B82F6', 1),
    ('HR',         'Nhân sự',         '#8B5CF6', 2),
    ('FINANCE',    'Tài chính',       '#10B981', 3),
    ('SCM',        'Chuỗi cung ứng',  '#F59E0B', 4),
    ('COMPLIANCE', 'Tuân thủ',        '#EF4444', 5),
    ('ONBOARDING', 'Onboarding',      '#EC4899', 6)
) AS v(code, label, color, sort_order)
ON CONFLICT ("tenant_Id", "code") DO NOTHING;

-- 3. Convert ElearningQuestion.tags from enum[] to text[]
ALTER TABLE "ElearningQuestion"
    ALTER COLUMN "tags" TYPE TEXT[]
    USING "tags"::TEXT[];

ALTER TABLE "ElearningQuestion"
    ALTER COLUMN "tags" SET DEFAULT ARRAY['GENERAL']::TEXT[];

-- 4. Convert ElearningCourse.category from enum to text
ALTER TABLE "ElearningCourse"
    ALTER COLUMN "category" TYPE TEXT
    USING "category"::TEXT;

-- 5. Drop the enum (no longer referenced by any column)
DROP TYPE IF EXISTS "ElearningQuestionTag";
