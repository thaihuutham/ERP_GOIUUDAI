-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mfaSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaEnrolledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "templateVersion" TEXT;

-- AlterTable
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "numberingSeries" TEXT,
  ADD COLUMN IF NOT EXISTS "numberingSeq" INTEGER,
  ADD COLUMN IF NOT EXISTS "documentLayout" TEXT;

-- AlterTable
ALTER TABLE "JournalEntry"
  ADD COLUMN IF NOT EXISTS "numberingSeries" TEXT,
  ADD COLUMN IF NOT EXISTS "numberingSeq" INTEGER,
  ADD COLUMN IF NOT EXISTS "documentLayout" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "warehouseCode" TEXT;

-- AlterTable
ALTER TABLE "Shipment"
  ADD COLUMN IF NOT EXISTS "warehouseCode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationDispatch" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRetryAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDispatch_tenant_Id_idx" ON "NotificationDispatch"("tenant_Id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDispatch_tenant_Id_status_nextRetryAt_idx" ON "NotificationDispatch"("tenant_Id", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationDispatch_tenant_Id_notificationId_idx" ON "NotificationDispatch"("tenant_Id", "notificationId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationDispatch_notificationId_fkey'
      AND table_name = 'NotificationDispatch'
  ) THEN
    ALTER TABLE "NotificationDispatch"
      ADD CONSTRAINT "NotificationDispatch_notificationId_fkey"
      FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
