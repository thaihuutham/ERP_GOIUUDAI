DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AuditOperationType'
  ) THEN
    CREATE TYPE "AuditOperationType" AS ENUM ('READ', 'WRITE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "operationType" "AuditOperationType" NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT,
  "requestId" TEXT,
  "route" TEXT,
  "method" TEXT,
  "statusCode" INTEGER,
  "ip" TEXT,
  "userAgent" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "changedFields" JSONB,
  "metadata" JSONB,
  "prevHash" TEXT,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_chain_state" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "lastLogId" TEXT,
  "lastHash" TEXT,
  "lastEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_chain_state_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_chain_state_tenant_Id_key'
  ) THEN
    ALTER TABLE "audit_chain_state"
      ADD CONSTRAINT "audit_chain_state_tenant_Id_key" UNIQUE ("tenant_Id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_entity_created_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_entity_created_idx"
      ON "audit_logs"("tenant_Id", "entityType", "entityId", "createdAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_action_created_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_action_created_idx"
      ON "audit_logs"("tenant_Id", "action", "createdAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_actor_created_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_actor_created_idx"
      ON "audit_logs"("tenant_Id", "actorId", "createdAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_module_created_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_module_created_idx"
      ON "audit_logs"("tenant_Id", "module", "createdAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_request_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_request_idx"
      ON "audit_logs"("tenant_Id", "requestId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs_tenant_operation_created_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_logs_tenant_operation_created_idx"
      ON "audit_logs"("tenant_Id", "operationType", "createdAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_chain_state_tenant_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "audit_chain_state_tenant_idx"
      ON "audit_chain_state"("tenant_Id");
  END IF;
END $$;

CREATE OR REPLACE FUNCTION audit_logs_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs is append-only. UPDATE is forbidden.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.audit_prune', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only. DELETE is forbidden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only_guard ON "audit_logs";

CREATE TRIGGER trg_audit_logs_append_only_guard
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION audit_logs_append_only_guard();
