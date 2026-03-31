-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "OrgUnitType" AS ENUM ('COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "orgUnitId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "OrgUnitType" NOT NULL,
    "parentId" TEXT,
    "managerEmployeeId" TEXT,
    "description" TEXT,
    "orderNo" INTEGER DEFAULT 0,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionPermissionRule" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "createdBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionPermissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "createdBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgUnit_tenant_Id_idx" ON "OrgUnit"("tenant_Id");

-- CreateIndex
CREATE INDEX "OrgUnit_tenant_Id_type_idx" ON "OrgUnit"("tenant_Id", "type");

-- CreateIndex
CREATE INDEX "OrgUnit_tenant_Id_parentId_idx" ON "OrgUnit"("tenant_Id", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_tenant_Id_code_key" ON "OrgUnit"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "PositionPermissionRule_tenant_Id_idx" ON "PositionPermissionRule"("tenant_Id");

-- CreateIndex
CREATE INDEX "PositionPermissionRule_tenant_Id_positionId_idx" ON "PositionPermissionRule"("tenant_Id", "positionId");

-- CreateIndex
CREATE INDEX "PositionPermissionRule_tenant_Id_moduleKey_action_idx" ON "PositionPermissionRule"("tenant_Id", "moduleKey", "action");

-- CreateIndex
CREATE UNIQUE INDEX "PositionPermissionRule_tenant_Id_positionId_moduleKey_actio_key" ON "PositionPermissionRule"("tenant_Id", "positionId", "moduleKey", "action");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_tenant_Id_idx" ON "UserPermissionOverride"("tenant_Id");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_tenant_Id_userId_idx" ON "UserPermissionOverride"("tenant_Id", "userId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_tenant_Id_moduleKey_action_idx" ON "UserPermissionOverride"("tenant_Id", "moduleKey", "action");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_tenant_Id_userId_moduleKey_action_key" ON "UserPermissionOverride"("tenant_Id", "userId", "moduleKey", "action");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_orgUnitId_idx" ON "Employee"("tenant_Id", "orgUnitId");

-- CreateIndex
CREATE INDEX "User_tenant_Id_employeeId_idx" ON "User"("tenant_Id", "employeeId");

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill root company org-unit per tenant
INSERT INTO "OrgUnit" (
  "id",
  "tenant_Id",
  "code",
  "name",
  "type",
  "parentId",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'org_company_' || md5(src."tenant_Id"),
  src."tenant_Id",
  'COMPANY_ROOT',
  COALESCE(
    NULLIF(
      (
        SELECT (s."settingValue"::jsonb ->> 'companyName')
        FROM "Setting" s
        WHERE s."tenant_Id" = src."tenant_Id"
          AND s."settingKey" = 'settings.org_profile.v1'
        ORDER BY s."updatedAt" DESC
        LIMIT 1
      ),
      ''
    ),
    'Công ty'
  ),
  'COMPANY'::"OrgUnitType",
  NULL,
  'ACTIVE'::"GenericStatus",
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "tenant_Id" FROM "Tenant"
  UNION
  SELECT DISTINCT "tenant_Id" FROM "Department"
  UNION
  SELECT DISTINCT "tenant_Id" FROM "Employee"
  UNION
  SELECT DISTINCT "tenant_Id" FROM "Setting"
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM "OrgUnit" o
  WHERE o."tenant_Id" = src."tenant_Id"
    AND o."type" = 'COMPANY'
);

-- Backfill Department -> OrgUnit(DEPARTMENT)
INSERT INTO "OrgUnit" (
  "id",
  "tenant_Id",
  "code",
  "name",
  "type",
  "parentId",
  "managerEmployeeId",
  "description",
  "orderNo",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'org_dept_' || md5(d."tenant_Id" || ':' || d."id"),
  d."tenant_Id",
  COALESCE(NULLIF(d."code", ''), 'DEPT_' || substr(md5(d."id"), 1, 8)),
  d."name",
  'DEPARTMENT'::"OrgUnitType",
  root."id",
  d."managerEmployeeId",
  d."description",
  100,
  d."status",
  NOW(),
  NOW()
FROM "Department" d
JOIN LATERAL (
  SELECT o."id"
  FROM "OrgUnit" o
  WHERE o."tenant_Id" = d."tenant_Id"
    AND o."type" = 'COMPANY'
  ORDER BY o."createdAt" ASC
  LIMIT 1
) root ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "OrgUnit" o
  WHERE o."tenant_Id" = d."tenant_Id"
    AND o."type" = 'DEPARTMENT'
    AND (
      (d."code" IS NOT NULL AND d."code" <> '' AND o."code" = d."code")
      OR o."name" = d."name"
    )
);

-- Backfill Employee.orgUnitId via Department mapping when possible
UPDATE "Employee" e
SET "orgUnitId" = mapped."orgUnitId"
FROM (
  SELECT
    e2."id" AS "employeeId",
    (
      SELECT o."id"
      FROM "Department" d
      JOIN "OrgUnit" o
        ON o."tenant_Id" = d."tenant_Id"
       AND o."type" = 'DEPARTMENT'
       AND (
         (d."code" IS NOT NULL AND d."code" <> '' AND o."code" = d."code")
         OR o."name" = d."name"
       )
      WHERE d."id" = e2."departmentId"
        AND d."tenant_Id" = e2."tenant_Id"
      ORDER BY
        CASE WHEN d."code" IS NOT NULL AND d."code" <> '' AND o."code" = d."code" THEN 0 ELSE 1 END,
        o."createdAt" ASC
      LIMIT 1
    ) AS "orgUnitId"
  FROM "Employee" e2
  WHERE e2."orgUnitId" IS NULL
    AND e2."departmentId" IS NOT NULL
) mapped
WHERE e."id" = mapped."employeeId"
  AND mapped."orgUnitId" IS NOT NULL;
