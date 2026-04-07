-- CreateEnum
CREATE TYPE "ServiceContractProductType" AS ENUM ('TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE');

-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ServiceContractSourceType" AS ENUM ('MANUAL', 'SALES_ORDER', 'EXTERNAL_SYNC', 'EXCEL_BASELINE', 'OCR_APPROVED');

-- CreateEnum
CREATE TYPE "ContractRenewalReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CustomerSocialPlatform" AS ENUM ('ZALO', 'FACEBOOK', 'TIKTOK');

-- CreateEnum
CREATE TYPE "TelecomBeneficiaryType" AS ENUM ('SELF', 'RELATIVE');

-- CreateEnum
CREATE TYPE "VehicleKind" AS ENUM ('AUTO', 'MOTO');

-- CreateEnum
CREATE TYPE "InboundPolicyDocumentSourceType" AS ENUM ('API_SYNC', 'MANUAL_UPLOAD', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "InboundPolicyExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "InboundPolicyReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CustomFieldEntityType" ADD VALUE 'SERVICE_CONTRACT';
ALTER TYPE "CustomFieldEntityType" ADD VALUE 'VEHICLE';
ALTER TYPE "CustomFieldEntityType" ADD VALUE 'INSURANCE_POLICY';

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "productType" "ServiceContractProductType" NOT NULL,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "renewalLeadDaysOverride" INTEGER,
    "ownerStaffId" TEXT,
    "sourceType" "ServiceContractSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "metadataJson" JSONB,
    "customFieldSchemaVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractRenewalReminder" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "assigneeStaffId" TEXT,
    "status" "ContractRenewalReminderStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNote" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractRenewalReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSocialIdentity" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" "CustomerSocialPlatform" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "phoneHint" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSocialIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelecomServiceLine" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "servicePhone" TEXT NOT NULL,
    "servicePhoneNormalized" TEXT,
    "packageCode" TEXT,
    "packageName" TEXT NOT NULL,
    "termDays" INTEGER NOT NULL,
    "currentExpiryAt" TIMESTAMP(3) NOT NULL,
    "beneficiaryType" "TelecomBeneficiaryType" NOT NULL DEFAULT 'SELF',
    "beneficiaryCustomerId" TEXT,
    "beneficiaryName" TEXT,
    "beneficiaryPhone" TEXT,
    "beneficiaryPhoneNormalized" TEXT,
    "beneficiaryRelation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelecomServiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "ownerCustomerId" TEXT,
    "ownerFullName" TEXT NOT NULL,
    "ownerAddress" TEXT,
    "plateNumber" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "engineNumber" TEXT NOT NULL,
    "vehicleKind" "VehicleKind" NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "seatCount" INTEGER,
    "loadKg" INTEGER,
    "customFieldSchemaVersion" INTEGER,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoInsurancePolicyDetail" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "soGCN" TEXT NOT NULL,
    "policyFromAt" TIMESTAMP(3) NOT NULL,
    "policyToAt" TIMESTAMP(3) NOT NULL,
    "premiumWithVat" DECIMAL(18,2),
    "issuedAt" TIMESTAMP(3),
    "voluntary" BOOLEAN NOT NULL DEFAULT false,
    "tnDriverSeatCount" INTEGER,
    "tnPassengerSeatCount" INTEGER,
    "tnInsuredAmountPerEvent" DECIMAL(18,2),
    "tnPremium" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoInsurancePolicyDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotoInsurancePolicyDetail" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "soGCN" TEXT NOT NULL,
    "policyFromAt" TIMESTAMP(3) NOT NULL,
    "policyToAt" TIMESTAMP(3) NOT NULL,
    "premiumWithVat" DECIMAL(18,2),
    "issuedAt" TIMESTAMP(3),
    "voluntary" BOOLEAN NOT NULL DEFAULT false,
    "tnInsuredPersons" TEXT,
    "tnInsuredAmountPerEvent" DECIMAL(18,2),
    "tnPremium" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotoInsurancePolicyDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalServiceDetail" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "planName" TEXT,
    "termDays" INTEGER,
    "serviceAccountRef" TEXT,
    "provider" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalServiceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundPolicyDocument" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "uploadUrl" TEXT NOT NULL,
    "sourceType" "InboundPolicyDocumentSourceType" NOT NULL,
    "sourceRef" TEXT,
    "extractionStatus" "InboundPolicyExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "InboundPolicyReviewStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundPolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundPolicyExtraction" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractionStatus" "InboundPolicyExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "InboundPolicyReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayloadJson" JSONB,
    "normalizedPayloadJson" JSONB,
    "confidence" DECIMAL(6,4),
    "provider" TEXT,
    "errorMessage" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundPolicyExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOrderIngest" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "customerId" TEXT,
    "salesOrderId" TEXT,
    "serviceContractId" TEXT,
    "payloadJson" JSONB,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrderIngest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_idx" ON "ServiceContract"("tenant_Id");

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_customerId_endsAt_idx" ON "ServiceContract"("tenant_Id", "customerId", "endsAt");

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_productType_endsAt_idx" ON "ServiceContract"("tenant_Id", "productType", "endsAt");

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_ownerStaffId_endsAt_idx" ON "ServiceContract"("tenant_Id", "ownerStaffId", "endsAt");

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_salesOrderId_idx" ON "ServiceContract"("tenant_Id", "salesOrderId");

-- CreateIndex
CREATE INDEX "ServiceContract_tenant_Id_customFieldSchemaVersion_idx" ON "ServiceContract"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_tenant_Id_idx" ON "ContractRenewalReminder"("tenant_Id");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_tenant_Id_contractId_idx" ON "ContractRenewalReminder"("tenant_Id", "contractId");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_tenant_Id_status_dueAt_idx" ON "ContractRenewalReminder"("tenant_Id", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_tenant_Id_assigneeStaffId_status_du_idx" ON "ContractRenewalReminder"("tenant_Id", "assigneeStaffId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractRenewalReminder_tenant_Id_dedupeKey_key" ON "ContractRenewalReminder"("tenant_Id", "dedupeKey");

-- CreateIndex
CREATE INDEX "CustomerSocialIdentity_tenant_Id_idx" ON "CustomerSocialIdentity"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomerSocialIdentity_tenant_Id_customerId_platform_idx" ON "CustomerSocialIdentity"("tenant_Id", "customerId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSocialIdentity_tenant_Id_platform_externalUserId_key" ON "CustomerSocialIdentity"("tenant_Id", "platform", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelecomServiceLine_contractId_key" ON "TelecomServiceLine"("contractId");

-- CreateIndex
CREATE INDEX "TelecomServiceLine_tenant_Id_idx" ON "TelecomServiceLine"("tenant_Id");

-- CreateIndex
CREATE INDEX "TelecomServiceLine_tenant_Id_servicePhoneNormalized_idx" ON "TelecomServiceLine"("tenant_Id", "servicePhoneNormalized");

-- CreateIndex
CREATE INDEX "TelecomServiceLine_tenant_Id_beneficiaryCustomerId_idx" ON "TelecomServiceLine"("tenant_Id", "beneficiaryCustomerId");

-- CreateIndex
CREATE INDEX "TelecomServiceLine_tenant_Id_currentExpiryAt_idx" ON "TelecomServiceLine"("tenant_Id", "currentExpiryAt");

-- CreateIndex
CREATE INDEX "Vehicle_tenant_Id_idx" ON "Vehicle"("tenant_Id");

-- CreateIndex
CREATE INDEX "Vehicle_tenant_Id_ownerCustomerId_idx" ON "Vehicle"("tenant_Id", "ownerCustomerId");

-- CreateIndex
CREATE INDEX "Vehicle_tenant_Id_vehicleKind_plateNumber_idx" ON "Vehicle"("tenant_Id", "vehicleKind", "plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_tenant_Id_plateNumber_idx" ON "Vehicle"("tenant_Id", "plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_tenant_Id_customFieldSchemaVersion_idx" ON "Vehicle"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AutoInsurancePolicyDetail_contractId_key" ON "AutoInsurancePolicyDetail"("contractId");

-- CreateIndex
CREATE INDEX "AutoInsurancePolicyDetail_tenant_Id_idx" ON "AutoInsurancePolicyDetail"("tenant_Id");

-- CreateIndex
CREATE INDEX "AutoInsurancePolicyDetail_tenant_Id_vehicleId_policyToAt_idx" ON "AutoInsurancePolicyDetail"("tenant_Id", "vehicleId", "policyToAt");

-- CreateIndex
CREATE INDEX "AutoInsurancePolicyDetail_tenant_Id_soGCN_idx" ON "AutoInsurancePolicyDetail"("tenant_Id", "soGCN");

-- CreateIndex
CREATE UNIQUE INDEX "MotoInsurancePolicyDetail_contractId_key" ON "MotoInsurancePolicyDetail"("contractId");

-- CreateIndex
CREATE INDEX "MotoInsurancePolicyDetail_tenant_Id_idx" ON "MotoInsurancePolicyDetail"("tenant_Id");

-- CreateIndex
CREATE INDEX "MotoInsurancePolicyDetail_tenant_Id_vehicleId_policyToAt_idx" ON "MotoInsurancePolicyDetail"("tenant_Id", "vehicleId", "policyToAt");

-- CreateIndex
CREATE INDEX "MotoInsurancePolicyDetail_tenant_Id_soGCN_idx" ON "MotoInsurancePolicyDetail"("tenant_Id", "soGCN");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalServiceDetail_contractId_key" ON "DigitalServiceDetail"("contractId");

-- CreateIndex
CREATE INDEX "DigitalServiceDetail_tenant_Id_idx" ON "DigitalServiceDetail"("tenant_Id");

-- CreateIndex
CREATE INDEX "DigitalServiceDetail_tenant_Id_provider_idx" ON "DigitalServiceDetail"("tenant_Id", "provider");

-- CreateIndex
CREATE INDEX "InboundPolicyDocument_tenant_Id_idx" ON "InboundPolicyDocument"("tenant_Id");

-- CreateIndex
CREATE INDEX "InboundPolicyDocument_tenant_Id_customerId_idx" ON "InboundPolicyDocument"("tenant_Id", "customerId");

-- CreateIndex
CREATE INDEX "InboundPolicyDocument_tenant_Id_vehicleId_idx" ON "InboundPolicyDocument"("tenant_Id", "vehicleId");

-- CreateIndex
CREATE INDEX "InboundPolicyDocument_tenant_Id_extractionStatus_reviewStat_idx" ON "InboundPolicyDocument"("tenant_Id", "extractionStatus", "reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "InboundPolicyExtraction_tenant_Id_idx" ON "InboundPolicyExtraction"("tenant_Id");

-- CreateIndex
CREATE INDEX "InboundPolicyExtraction_tenant_Id_documentId_createdAt_idx" ON "InboundPolicyExtraction"("tenant_Id", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "InboundPolicyExtraction_tenant_Id_extractionStatus_reviewSt_idx" ON "InboundPolicyExtraction"("tenant_Id", "extractionStatus", "reviewStatus");

-- CreateIndex
CREATE INDEX "ExternalOrderIngest_tenant_Id_idx" ON "ExternalOrderIngest"("tenant_Id");

-- CreateIndex
CREATE INDEX "ExternalOrderIngest_tenant_Id_sourceSystem_createdAt_idx" ON "ExternalOrderIngest"("tenant_Id", "sourceSystem", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalOrderIngest_tenant_Id_customerId_idx" ON "ExternalOrderIngest"("tenant_Id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrderIngest_tenant_Id_sourceSystem_externalOrderId_key" ON "ExternalOrderIngest"("tenant_Id", "sourceSystem", "externalOrderId");

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractRenewalReminder" ADD CONSTRAINT "ContractRenewalReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSocialIdentity" ADD CONSTRAINT "CustomerSocialIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelecomServiceLine" ADD CONSTRAINT "TelecomServiceLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelecomServiceLine" ADD CONSTRAINT "TelecomServiceLine_beneficiaryCustomerId_fkey" FOREIGN KEY ("beneficiaryCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerCustomerId_fkey" FOREIGN KEY ("ownerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoInsurancePolicyDetail" ADD CONSTRAINT "AutoInsurancePolicyDetail_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoInsurancePolicyDetail" ADD CONSTRAINT "AutoInsurancePolicyDetail_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotoInsurancePolicyDetail" ADD CONSTRAINT "MotoInsurancePolicyDetail_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotoInsurancePolicyDetail" ADD CONSTRAINT "MotoInsurancePolicyDetail_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalServiceDetail" ADD CONSTRAINT "DigitalServiceDetail_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundPolicyDocument" ADD CONSTRAINT "InboundPolicyDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundPolicyDocument" ADD CONSTRAINT "InboundPolicyDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundPolicyExtraction" ADD CONSTRAINT "InboundPolicyExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InboundPolicyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderIngest" ADD CONSTRAINT "ExternalOrderIngest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderIngest" ADD CONSTRAINT "ExternalOrderIngest_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderIngest" ADD CONSTRAINT "ExternalOrderIngest_serviceContractId_fkey" FOREIGN KEY ("serviceContractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
