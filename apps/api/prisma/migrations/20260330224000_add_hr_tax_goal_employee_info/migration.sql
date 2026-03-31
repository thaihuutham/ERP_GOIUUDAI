-- CreateTable
CREATE TABLE "PersonalIncomeTaxProfile" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taxCode" TEXT,
    "personalDeduction" DECIMAL(18,2),
    "dependentCount" INTEGER NOT NULL DEFAULT 0,
    "dependentDeduction" DECIMAL(18,2),
    "insuranceDeduction" DECIMAL(18,2),
    "otherDeduction" DECIMAL(18,2),
    "taxRate" DECIMAL(7,4),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalIncomeTaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalIncomeTaxRecord" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollId" TEXT,
    "taxProfileId" TEXT,
    "taxMonth" INTEGER NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "grossTaxable" DECIMAL(18,2) NOT NULL,
    "deduction" DECIMAL(18,2) NOT NULL,
    "taxableIncome" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(7,4) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalIncomeTaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrGoal" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "goalCode" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "period" TEXT NOT NULL,
    "targetValue" DECIMAL(18,2),
    "currentValue" DECIMAL(18,2),
    "progressPercent" DOUBLE PRECISION DEFAULT 0,
    "weight" DOUBLE PRECISION DEFAULT 1,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalIncomeTaxProfile_tenant_Id_employeeId_key" ON "PersonalIncomeTaxProfile"("tenant_Id", "employeeId");

-- CreateIndex
CREATE INDEX "PersonalIncomeTaxProfile_tenant_Id_idx" ON "PersonalIncomeTaxProfile"("tenant_Id");

-- CreateIndex
CREATE INDEX "PersonalIncomeTaxProfile_tenant_Id_taxCode_idx" ON "PersonalIncomeTaxProfile"("tenant_Id", "taxCode");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalIncomeTaxRecord_tenant_Id_employeeId_taxYear_taxMonth_key" ON "PersonalIncomeTaxRecord"("tenant_Id", "employeeId", "taxYear", "taxMonth");

-- CreateIndex
CREATE INDEX "PersonalIncomeTaxRecord_tenant_Id_idx" ON "PersonalIncomeTaxRecord"("tenant_Id");

-- CreateIndex
CREATE INDEX "PersonalIncomeTaxRecord_tenant_Id_payrollId_idx" ON "PersonalIncomeTaxRecord"("tenant_Id", "payrollId");

-- CreateIndex
CREATE INDEX "PersonalIncomeTaxRecord_tenant_Id_taxYear_taxMonth_idx" ON "PersonalIncomeTaxRecord"("tenant_Id", "taxYear", "taxMonth");

-- CreateIndex
CREATE UNIQUE INDEX "HrGoal_tenant_Id_goalCode_key" ON "HrGoal"("tenant_Id", "goalCode");

-- CreateIndex
CREATE INDEX "HrGoal_tenant_Id_idx" ON "HrGoal"("tenant_Id");

-- CreateIndex
CREATE INDEX "HrGoal_tenant_Id_employeeId_period_idx" ON "HrGoal"("tenant_Id", "employeeId", "period");

-- CreateIndex
CREATE INDEX "HrGoal_tenant_Id_status_idx" ON "HrGoal"("tenant_Id", "status");
