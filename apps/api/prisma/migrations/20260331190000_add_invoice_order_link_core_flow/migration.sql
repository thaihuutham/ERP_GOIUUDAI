ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "orderId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Invoice_orderId_fkey'
  ) THEN
    ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'Invoice_tenant_Id_orderId_idx'
      AND n.nspname = current_schema()
  ) THEN
    CREATE INDEX "Invoice_tenant_Id_orderId_idx"
      ON "Invoice"("tenant_Id", "orderId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'Invoice_tenant_Id_orderId_key'
      AND n.nspname = current_schema()
  ) THEN
    CREATE UNIQUE INDEX "Invoice_tenant_Id_orderId_key"
      ON "Invoice"("tenant_Id", "orderId");
  END IF;
END $$;
