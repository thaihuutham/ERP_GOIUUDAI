-- CreateEnum
CREATE TYPE "CheckoutOrderGroup" AS ENUM ('INSURANCE', 'TELECOM', 'DIGITAL');

-- CreateEnum
CREATE TYPE "CheckoutOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'ACTIVATING', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckoutLineActivationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('RECEIVED', 'APPLIED', 'DUPLICATE', 'REJECTED');

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "checkoutStatus" "CheckoutOrderStatus",
  ADD COLUMN "commercialLockedAt" TIMESTAMP(3),
  ADD COLUMN "commercialSnapshotJson" JSONB,
  ADD COLUMN "orderGroup" "CheckoutOrderGroup";

-- AlterTable
ALTER TABLE "OrderItem"
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "activationRef" TEXT,
  ADD COLUMN "activationStatus" "CheckoutLineActivationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "serviceMetaJson" JSONB;

-- CreateTable
CREATE TABLE "PaymentIntent" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "intentCode" TEXT NOT NULL,
  "amountLocked" DECIMAL(18, 2) NOT NULL,
  "paidAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "qrPayload" TEXT,
  "paymentLink" TEXT,
  "qrActive" BOOLEAN NOT NULL DEFAULT true,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'UNPAID',
  "paidAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "transactionRef" TEXT NOT NULL,
  "bankTxnAt" TIMESTAMP(3),
  "amount" DECIMAL(18, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "rawPayloadJson" JSONB,
  "dedupeHash" TEXT NOT NULL,
  "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
  "note" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOverrideLog" (
  "id" TEXT NOT NULL,
  "tenant_Id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "overrideBy" TEXT NOT NULL,
  "overrideRole" TEXT,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "amount" DECIMAL(18, 2) NOT NULL,
  "note" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentOverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentIntent_tenant_Id_idx" ON "PaymentIntent"("tenant_Id");
CREATE INDEX "PaymentIntent_tenant_Id_status_idx" ON "PaymentIntent"("tenant_Id", "status");
CREATE INDEX "PaymentIntent_tenant_Id_createdAt_idx" ON "PaymentIntent"("tenant_Id", "createdAt");
CREATE UNIQUE INDEX "PaymentIntent_tenant_Id_orderId_key" ON "PaymentIntent"("tenant_Id", "orderId");
CREATE UNIQUE INDEX "PaymentIntent_tenant_Id_intentCode_key" ON "PaymentIntent"("tenant_Id", "intentCode");

CREATE INDEX "PaymentTransaction_tenant_Id_idx" ON "PaymentTransaction"("tenant_Id");
CREATE INDEX "PaymentTransaction_tenant_Id_intentId_createdAt_idx" ON "PaymentTransaction"("tenant_Id", "intentId", "createdAt");
CREATE INDEX "PaymentTransaction_tenant_Id_transactionRef_idx" ON "PaymentTransaction"("tenant_Id", "transactionRef");
CREATE UNIQUE INDEX "PaymentTransaction_tenant_Id_dedupeHash_key" ON "PaymentTransaction"("tenant_Id", "dedupeHash");

CREATE INDEX "PaymentOverrideLog_tenant_Id_idx" ON "PaymentOverrideLog"("tenant_Id");
CREATE INDEX "PaymentOverrideLog_tenant_Id_intentId_createdAt_idx" ON "PaymentOverrideLog"("tenant_Id", "intentId", "createdAt");

CREATE INDEX "Order_tenant_Id_orderGroup_idx" ON "Order"("tenant_Id", "orderGroup");
CREATE INDEX "Order_tenant_Id_checkoutStatus_idx" ON "Order"("tenant_Id", "checkoutStatus");

CREATE INDEX "OrderItem_tenant_Id_activationStatus_idx" ON "OrderItem"("tenant_Id", "activationStatus");
CREATE INDEX "OrderItem_tenant_Id_effectiveTo_idx" ON "OrderItem"("tenant_Id", "effectiveTo");

-- AddForeignKey
ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOverrideLog"
  ADD CONSTRAINT "PaymentOverrideLog_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
