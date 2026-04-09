-- Normalize system role model to ADMIN|USER and add multi-position assignment table.

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'USER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

UPDATE "User"
SET "role" = 'USER'
WHERE "role"::text IN ('MANAGER', 'STAFF');

ALTER TABLE "User"
ALTER COLUMN "role" TYPE "UserRole_new"
USING (
  CASE
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
    ELSE 'USER'
  END
)::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

CREATE TABLE "UserPositionAssignment" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "note" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserPositionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPositionAssignment_tenant_Id_userId_positionId_key"
  ON "UserPositionAssignment"("tenant_Id", "userId", "positionId");

CREATE INDEX "UserPositionAssignment_tenant_Id_idx"
  ON "UserPositionAssignment"("tenant_Id");

CREATE INDEX "UserPositionAssignment_tenant_Id_userId_status_idx"
  ON "UserPositionAssignment"("tenant_Id", "userId", "status");

CREATE INDEX "UserPositionAssignment_tenant_Id_positionId_status_idx"
  ON "UserPositionAssignment"("tenant_Id", "positionId", "status");

-- Backfill assignments from current employee.positionId for smooth cutover.
INSERT INTO "UserPositionAssignment" (
  "id",
  "tenant_Id",
  "userId",
  "positionId",
  "isPrimary",
  "status",
  "createdBy",
  "updatedBy"
)
SELECT
  'upa_' || substr(md5(random()::text || clock_timestamp()::text || u."id" || e."positionId"), 1, 24) AS id,
  u."tenant_Id",
  u."id",
  e."positionId",
  true,
  'ACTIVE'::"GenericStatus",
  'migration_20260409120000',
  'migration_20260409120000'
FROM "User" u
JOIN "Employee" e ON e."id" = u."employeeId"
WHERE e."positionId" IS NOT NULL
ON CONFLICT ("tenant_Id", "userId", "positionId") DO NOTHING;
