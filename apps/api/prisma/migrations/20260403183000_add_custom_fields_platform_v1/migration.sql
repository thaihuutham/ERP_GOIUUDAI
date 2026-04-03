-- CreateEnum
CREATE TYPE "CustomFieldEntityType" AS ENUM ('CUSTOMER', 'PRODUCT', 'EMPLOYEE', 'SALES_ORDER', 'PURCHASE_ORDER', 'INVOICE', 'PROJECT', 'HR_EVENT', 'WORKFLOW_DEFINITION');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN', 'SELECT', 'MULTISELECT', 'RELATION', 'FORMULA');

-- CreateEnum
CREATE TYPE "CustomFieldLifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomFieldWidgetChartType" AS ENUM ('KPI', 'TABLE', 'BAR', 'LINE', 'PIE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "HrEvent" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "WorkflowDefinition" ADD COLUMN     "customFieldSchemaVersion" INTEGER;

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "fieldType" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValueJson" JSONB,
    "optionsJson" JSONB,
    "relationEntityType" "CustomFieldEntityType",
    "formulaExpression" TEXT,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "status" "CustomFieldLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "latestPublishedVersion" INTEGER,
    "fieldVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldSchemaVersion" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "definitionSnapshotJson" JSONB NOT NULL,
    "impactSummaryJson" JSONB,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldSchemaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(20,4),
    "valueDate" TIMESTAMP(3),
    "valueBool" BOOLEAN,
    "valueJson" JSONB,
    "valueSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldIndexSpec" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "indexName" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldIndexSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldReportWidget" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "chartType" "CustomFieldWidgetChartType" NOT NULL DEFAULT 'TABLE',
    "metricType" TEXT NOT NULL,
    "metricFieldKey" TEXT,
    "groupByFieldKey" TEXT,
    "filtersJson" JSONB,
    "configJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldReportWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenant_Id_idx" ON "CustomFieldDefinition"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenant_Id_entityType_status_idx" ON "CustomFieldDefinition"("tenant_Id", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenant_Id_entityType_fieldKey_key" ON "CustomFieldDefinition"("tenant_Id", "entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldSchemaVersion_tenant_Id_idx" ON "CustomFieldSchemaVersion"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomFieldSchemaVersion_tenant_Id_entityType_publishedAt_idx" ON "CustomFieldSchemaVersion"("tenant_Id", "entityType", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldSchemaVersion_tenant_Id_entityType_version_key" ON "CustomFieldSchemaVersion"("tenant_Id", "entityType", "version");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_idx" ON "CustomFieldValue"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_entityType_entityId_idx" ON "CustomFieldValue"("tenant_Id", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_entityType_fieldKey_valueText_idx" ON "CustomFieldValue"("tenant_Id", "entityType", "fieldKey", "valueText");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_entityType_fieldKey_valueNumber_idx" ON "CustomFieldValue"("tenant_Id", "entityType", "fieldKey", "valueNumber");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_entityType_fieldKey_valueDate_idx" ON "CustomFieldValue"("tenant_Id", "entityType", "fieldKey", "valueDate");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenant_Id_entityType_fieldKey_valueBool_idx" ON "CustomFieldValue"("tenant_Id", "entityType", "fieldKey", "valueBool");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_tenant_Id_entityType_entityId_fieldKey_key" ON "CustomFieldValue"("tenant_Id", "entityType", "entityId", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldIndexSpec_tenant_Id_idx" ON "CustomFieldIndexSpec"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomFieldIndexSpec_tenant_Id_entityType_indexed_idx" ON "CustomFieldIndexSpec"("tenant_Id", "entityType", "indexed");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldIndexSpec_tenant_Id_entityType_fieldKey_key" ON "CustomFieldIndexSpec"("tenant_Id", "entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldReportWidget_tenant_Id_idx" ON "CustomFieldReportWidget"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomFieldReportWidget_tenant_Id_entityType_isActive_idx" ON "CustomFieldReportWidget"("tenant_Id", "entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldReportWidget_tenant_Id_name_key" ON "CustomFieldReportWidget"("tenant_Id", "name");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_customFieldSchemaVersion_idx" ON "Employee"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "Customer_tenant_Id_customFieldSchemaVersion_idx" ON "Customer"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "Product_tenant_Id_customFieldSchemaVersion_idx" ON "Product"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "Order_tenant_Id_customFieldSchemaVersion_idx" ON "Order"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "HrEvent_tenant_Id_customFieldSchemaVersion_idx" ON "HrEvent"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "Invoice_tenant_Id_customFieldSchemaVersion_idx" ON "Invoice"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenant_Id_customFieldSchemaVersion_idx" ON "PurchaseOrder"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "Project_tenant_Id_customFieldSchemaVersion_idx" ON "Project"("tenant_Id", "customFieldSchemaVersion");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_tenant_Id_customFieldSchemaVersion_idx" ON "WorkflowDefinition"("tenant_Id", "customFieldSchemaVersion");

