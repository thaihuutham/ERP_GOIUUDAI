DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AuditArchiveStatus'
  ) THEN
    CREATE TYPE "AuditArchiveStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'NOOP');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "audit_archive_manifests" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "objectKey" TEXT,
  "objectVersion" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "checksumSha256" TEXT,
  "gzChecksumSha256" TEXT,
  "firstHash" TEXT,
  "lastHash" TEXT,
  "status" "AuditArchiveStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "archivedAt" TIMESTAMP(3),
  "prunedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_archive_manifests_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_archive_manifests_tenant_Id_windowStart_windowEnd_key'
  ) THEN
    ALTER TABLE "audit_archive_manifests"
      ADD CONSTRAINT "audit_archive_manifests_tenant_Id_windowStart_windowEnd_key"
      UNIQUE ("tenant_Id", "windowStart", "windowEnd");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_archive_manifests_tenant_status_window_start_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_archive_manifests_tenant_status_window_start_idx"
      ON "audit_archive_manifests"("tenant_Id", "status", "windowStart");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_archive_manifests_tenant_window_range_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_archive_manifests_tenant_window_range_idx"
      ON "audit_archive_manifests"("tenant_Id", "windowStart", "windowEnd");
  END IF;
END $$;
