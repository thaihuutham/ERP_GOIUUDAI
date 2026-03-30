-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "GenericStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "PayrollComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollFormulaType" AS ENUM ('FIXED', 'PERCENT_BASE');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationSenderType" AS ENUM ('AGENT', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConversationEvaluationVerdict" AS ENUM ('PASS', 'FAIL', 'SKIP', 'ERROR');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "nationalId" TEXT,
    "address" TEXT,
    "bankAccountNo" TEXT,
    "bankName" TEXT,
    "taxCode" TEXT,
    "department" TEXT,
    "departmentId" TEXT,
    "position" TEXT,
    "positionId" TEXT,
    "managerId" TEXT,
    "workShiftId" TEXT,
    "joinDate" TIMESTAMP(3),
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "baseSalary" DECIMAL(18,2),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "managerEmployeeId" TEXT,
    "description" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "level" TEXT,
    "description" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "annualQuotaDays" DECIMAL(6,2),
    "carryOverLimitDays" DECIMAL(6,2),
    "maxConsecutiveDays" INTEGER,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerStage" TEXT DEFAULT 'MOI',
    "ownerStaffId" TEXT,
    "consentStatus" TEXT,
    "segment" TEXT,
    "source" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(18,2),
    "lastOrderAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerInteraction" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resultTag" TEXT,
    "staffName" TEXT,
    "staffCode" TEXT,
    "interactionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "invoiceNo" TEXT,
    "orderNo" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "qrCodeUrl" TEXT,
    "amount" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'DA_GUI',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMergeLog" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "primaryCustomerId" TEXT NOT NULL,
    "mergedCustomerId" TEXT NOT NULL,
    "mergedBy" TEXT,
    "note" TEXT,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "categoryPath" TEXT,
    "attributesJson" JSONB,
    "variantOfProductId" TEXT,
    "pricePolicyCode" TEXT,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "orderNo" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "totalAmount" DECIMAL(18,2),
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "workShiftId" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leavePolicyId" TEXT,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" DECIMAL(6,2),
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payMonth" INTEGER NOT NULL,
    "payYear" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "workingDays" DOUBLE PRECISION,
    "paidLeaveDays" DOUBLE PRECISION,
    "unpaidLeaveDays" DOUBLE PRECISION,
    "overtimeHours" DOUBLE PRECISION,
    "grossSalary" DECIMAL(18,2),
    "deduction" DECIMAL(18,2),
    "netSalary" DECIMAL(18,2),
    "note" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeContract" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractNo" TEXT,
    "contractType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(18,2),
    "allowance" DECIMAL(18,2),
    "insuranceSalary" DECIMAL(18,2),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollComponent" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "componentType" "PayrollComponentType" NOT NULL,
    "formulaType" "PayrollFormulaType" NOT NULL DEFAULT 'FIXED',
    "defaultValue" DECIMAL(18,2),
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineItem" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentCode" TEXT,
    "componentName" TEXT NOT NULL,
    "componentType" "PayrollComponentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEvent" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "invoiceType" TEXT NOT NULL,
    "partnerName" TEXT,
    "totalAmount" DECIMAL(18,2),
    "paidAmount" DECIMAL(18,2) DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "balance" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "entryNo" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "debit" DECIMAL(18,2),
    "credit" DECIMAL(18,2),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentRef" TEXT,
    "sourceInvoiceNo" TEXT,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPlan" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fiscalPeriod" TEXT NOT NULL,
    "plannedAmount" DECIMAL(18,2),
    "actualAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "poNo" TEXT,
    "vendorId" TEXT,
    "relatedSalesOrderNo" TEXT,
    "totalAmount" DECIMAL(18,2),
    "receivedAmount" DECIMAL(18,2) DEFAULT 0,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedReceiveAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "shipmentNo" TEXT,
    "orderRef" TEXT,
    "purchaseOrderId" TEXT,
    "carrier" TEXT,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "expectedDeliveryAt" TIMESTAMP(3),
    "onTimeDelivery" BOOLEAN,
    "damageReported" BOOLEAN,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receiptNo" TEXT,
    "invoiceNo" TEXT,
    "receivedAmount" DECIMAL(18,2),
    "receivedQty" INTEGER,
    "acceptedQty" INTEGER,
    "rejectedQty" INTEGER,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "distributionNo" TEXT,
    "destination" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandForecast" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "sku" TEXT,
    "period" TEXT NOT NULL,
    "predictedQty" INTEGER,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyChainRisk" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "mitigation" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyChainRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "assetCode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'PROCURE',
    "purchaseAt" TIMESTAMP(3),
    "value" DECIMAL(18,2),
    "usefulLifeMonths" INTEGER,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "salvageValue" DECIMAL(18,2),
    "depreciationStartAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAllocation" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequencyDays" INTEGER,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastDoneAt" TIMESTAMP(3),
    "note" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciationEntry" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "bookValue" DECIMAL(18,2),
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetDepreciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recruitment" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "candidateName" TEXT,
    "stage" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recruitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employeeId" TEXT,
    "completedAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "reviewerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "baselineStartAt" TIMESTAMP(3),
    "baselineEndAt" TIMESTAMP(3),
    "plannedBudget" DECIMAL(18,2),
    "actualBudget" DECIMAL(18,2),
    "forecastPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedTo" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "actualStartAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectResource" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceRef" TEXT,
    "quantity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "projectId" TEXT,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "definitionJson" JSONB,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "currentStep" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "startedBy" TEXT,
    "contextJson" JSONB,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "instanceId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "stepKey" TEXT,
    "contextJson" JSONB,
    "dueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "delegatedAt" TIMESTAMP(3),
    "delegatedTo" TEXT,
    "decisionNote" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowActionLog" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStep" TEXT,
    "toStep" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "moduleName" TEXT,
    "templateCode" TEXT,
    "outputFormat" TEXT DEFAULT 'JSON',
    "scheduleRule" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "configJson" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL,
    "outputPath" TEXT,
    "summaryJson" JSONB,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "settingValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloAccount" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "displayName" TEXT,
    "zaloUid" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "ownerUserId" TEXT,
    "sessionData" JSONB,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "metadataJson" JSONB,
    "lastConnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZaloAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "channel" "ConversationChannel" NOT NULL,
    "channelAccountId" TEXT,
    "externalThreadId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerDisplayName" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isReplied" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "senderType" "ConversationSenderType" NOT NULL,
    "senderExternalId" TEXT,
    "senderName" TEXT,
    "content" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'TEXT',
    "attachmentsJson" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "aiProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEvaluationJob" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jobType" TEXT NOT NULL DEFAULT 'QC_ANALYSIS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 120,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lookbackHours" INTEGER NOT NULL DEFAULT 24,
    "maxConversationsPerRun" INTEGER NOT NULL DEFAULT 30,
    "batchSize" INTEGER NOT NULL DEFAULT 5,
    "aiProvider" TEXT NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    "aiModel" TEXT,
    "channelFilterJson" JSONB,
    "rulesContent" TEXT,
    "skipConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationEvaluationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEvaluationRun" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEvaluation" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "runId" TEXT,
    "verdict" "ConversationEvaluationVerdict" NOT NULL DEFAULT 'ERROR',
    "score" INTEGER,
    "review" TEXT,
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "rawResponseJson" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationViolation" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "evidence" TEXT,
    "explanation" TEXT,
    "suggestion" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tenant_Id_key" ON "Tenant"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE INDEX "Tenant_tenant_Id_idx" ON "Tenant"("tenant_Id");

-- CreateIndex
CREATE INDEX "User_tenant_Id_idx" ON "User"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenant_Id_email_key" ON "User"("tenant_Id", "email");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_idx" ON "Employee"("tenant_Id");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_departmentId_idx" ON "Employee"("tenant_Id", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_positionId_idx" ON "Employee"("tenant_Id", "positionId");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_managerId_idx" ON "Employee"("tenant_Id", "managerId");

-- CreateIndex
CREATE INDEX "Employee_tenant_Id_workShiftId_idx" ON "Employee"("tenant_Id", "workShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenant_Id_code_key" ON "Employee"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "Department_tenant_Id_idx" ON "Department"("tenant_Id");

-- CreateIndex
CREATE INDEX "Department_tenant_Id_name_idx" ON "Department"("tenant_Id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenant_Id_code_key" ON "Department"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "Position_tenant_Id_idx" ON "Position"("tenant_Id");

-- CreateIndex
CREATE INDEX "Position_tenant_Id_departmentId_idx" ON "Position"("tenant_Id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_tenant_Id_code_key" ON "Position"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "WorkShift_tenant_Id_idx" ON "WorkShift"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_tenant_Id_code_key" ON "WorkShift"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "LeavePolicy_tenant_Id_idx" ON "LeavePolicy"("tenant_Id");

-- CreateIndex
CREATE INDEX "LeavePolicy_tenant_Id_leaveType_idx" ON "LeavePolicy"("tenant_Id", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_tenant_Id_code_key" ON "LeavePolicy"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "Customer_tenant_Id_idx" ON "Customer"("tenant_Id");

-- CreateIndex
CREATE INDEX "Customer_tenant_Id_phone_idx" ON "Customer"("tenant_Id", "phone");

-- CreateIndex
CREATE INDEX "Customer_tenant_Id_email_idx" ON "Customer"("tenant_Id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenant_Id_code_key" ON "Customer"("tenant_Id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenant_Id_phoneNormalized_key" ON "Customer"("tenant_Id", "phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenant_Id_emailNormalized_key" ON "Customer"("tenant_Id", "emailNormalized");

-- CreateIndex
CREATE INDEX "CustomerInteraction_tenant_Id_idx" ON "CustomerInteraction"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomerInteraction_tenant_Id_customerId_idx" ON "CustomerInteraction"("tenant_Id", "customerId");

-- CreateIndex
CREATE INDEX "CustomerInteraction_tenant_Id_interactionAt_idx" ON "CustomerInteraction"("tenant_Id", "interactionAt");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenant_Id_idx" ON "PaymentRequest"("tenant_Id");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenant_Id_customerId_idx" ON "PaymentRequest"("tenant_Id", "customerId");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenant_Id_invoiceNo_idx" ON "PaymentRequest"("tenant_Id", "invoiceNo");

-- CreateIndex
CREATE INDEX "PaymentRequest_tenant_Id_status_idx" ON "PaymentRequest"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX "CustomerMergeLog_tenant_Id_idx" ON "CustomerMergeLog"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomerMergeLog_tenant_Id_primaryCustomerId_idx" ON "CustomerMergeLog"("tenant_Id", "primaryCustomerId");

-- CreateIndex
CREATE INDEX "CustomerMergeLog_tenant_Id_mergedCustomerId_idx" ON "CustomerMergeLog"("tenant_Id", "mergedCustomerId");

-- CreateIndex
CREATE INDEX "Product_tenant_Id_idx" ON "Product"("tenant_Id");

-- CreateIndex
CREATE INDEX "Product_tenant_Id_variantOfProductId_idx" ON "Product"("tenant_Id", "variantOfProductId");

-- CreateIndex
CREATE INDEX "Product_tenant_Id_categoryPath_idx" ON "Product"("tenant_Id", "categoryPath");

-- CreateIndex
CREATE INDEX "Product_tenant_Id_pricePolicyCode_idx" ON "Product"("tenant_Id", "pricePolicyCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenant_Id_sku_key" ON "Product"("tenant_Id", "sku");

-- CreateIndex
CREATE INDEX "Order_tenant_Id_idx" ON "Order"("tenant_Id");

-- CreateIndex
CREATE INDEX "Order_tenant_Id_createdAt_idx" ON "Order"("tenant_Id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenant_Id_orderNo_key" ON "Order"("tenant_Id", "orderNo");

-- CreateIndex
CREATE INDEX "OrderItem_tenant_Id_idx" ON "OrderItem"("tenant_Id");

-- CreateIndex
CREATE INDEX "OrderItem_tenant_Id_orderId_idx" ON "OrderItem"("tenant_Id", "orderId");

-- CreateIndex
CREATE INDEX "Attendance_tenant_Id_idx" ON "Attendance"("tenant_Id");

-- CreateIndex
CREATE INDEX "Attendance_tenant_Id_employeeId_workDate_idx" ON "Attendance"("tenant_Id", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "Attendance_tenant_Id_workShiftId_idx" ON "Attendance"("tenant_Id", "workShiftId");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenant_Id_idx" ON "LeaveRequest"("tenant_Id");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenant_Id_employeeId_idx" ON "LeaveRequest"("tenant_Id", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenant_Id_leavePolicyId_idx" ON "LeaveRequest"("tenant_Id", "leavePolicyId");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenant_Id_leaveType_idx" ON "LeaveRequest"("tenant_Id", "leaveType");

-- CreateIndex
CREATE INDEX "Payroll_tenant_Id_idx" ON "Payroll"("tenant_Id");

-- CreateIndex
CREATE INDEX "Payroll_tenant_Id_payYear_payMonth_idx" ON "Payroll"("tenant_Id", "payYear", "payMonth");

-- CreateIndex
CREATE INDEX "Payroll_tenant_Id_employeeId_payYear_payMonth_idx" ON "Payroll"("tenant_Id", "employeeId", "payYear", "payMonth");

-- CreateIndex
CREATE INDEX "EmployeeContract_tenant_Id_idx" ON "EmployeeContract"("tenant_Id");

-- CreateIndex
CREATE INDEX "EmployeeContract_tenant_Id_employeeId_status_idx" ON "EmployeeContract"("tenant_Id", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeContract_tenant_Id_contractNo_key" ON "EmployeeContract"("tenant_Id", "contractNo");

-- CreateIndex
CREATE INDEX "PayrollComponent_tenant_Id_idx" ON "PayrollComponent"("tenant_Id");

-- CreateIndex
CREATE INDEX "PayrollComponent_tenant_Id_componentType_status_idx" ON "PayrollComponent"("tenant_Id", "componentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollComponent_tenant_Id_code_key" ON "PayrollComponent"("tenant_Id", "code");

-- CreateIndex
CREATE INDEX "PayrollLineItem_tenant_Id_idx" ON "PayrollLineItem"("tenant_Id");

-- CreateIndex
CREATE INDEX "PayrollLineItem_tenant_Id_payrollId_idx" ON "PayrollLineItem"("tenant_Id", "payrollId");

-- CreateIndex
CREATE INDEX "PayrollLineItem_tenant_Id_employeeId_createdAt_idx" ON "PayrollLineItem"("tenant_Id", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "HrEvent_tenant_Id_idx" ON "HrEvent"("tenant_Id");

-- CreateIndex
CREATE INDEX "HrEvent_tenant_Id_employeeId_effectiveAt_idx" ON "HrEvent"("tenant_Id", "employeeId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Invoice_tenant_Id_idx" ON "Invoice"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenant_Id_invoiceNo_key" ON "Invoice"("tenant_Id", "invoiceNo");

-- CreateIndex
CREATE INDEX "Account_tenant_Id_idx" ON "Account"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenant_Id_accountCode_key" ON "Account"("tenant_Id", "accountCode");

-- CreateIndex
CREATE INDEX "JournalEntry_tenant_Id_idx" ON "JournalEntry"("tenant_Id");

-- CreateIndex
CREATE INDEX "JournalEntryLine_tenant_Id_idx" ON "JournalEntryLine"("tenant_Id");

-- CreateIndex
CREATE INDEX "JournalEntryLine_tenant_Id_journalEntryId_createdAt_idx" ON "JournalEntryLine"("tenant_Id", "journalEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tenant_Id_idx" ON "PaymentAllocation"("tenant_Id");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tenant_Id_invoiceId_allocatedAt_idx" ON "PaymentAllocation"("tenant_Id", "invoiceId", "allocatedAt");

-- CreateIndex
CREATE INDEX "BudgetPlan_tenant_Id_idx" ON "BudgetPlan"("tenant_Id");

-- CreateIndex
CREATE INDEX "Vendor_tenant_Id_idx" ON "Vendor"("tenant_Id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenant_Id_idx" ON "PurchaseOrder"("tenant_Id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenant_Id_vendorId_idx" ON "PurchaseOrder"("tenant_Id", "vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenant_Id_lifecycleStatus_idx" ON "PurchaseOrder"("tenant_Id", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "Shipment_tenant_Id_idx" ON "Shipment"("tenant_Id");

-- CreateIndex
CREATE INDEX "Shipment_tenant_Id_purchaseOrderId_idx" ON "Shipment"("tenant_Id", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "Shipment_tenant_Id_lifecycleStatus_idx" ON "Shipment"("tenant_Id", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_tenant_Id_idx" ON "PurchaseReceipt"("tenant_Id");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_tenant_Id_purchaseOrderId_receivedAt_idx" ON "PurchaseReceipt"("tenant_Id", "purchaseOrderId", "receivedAt");

-- CreateIndex
CREATE INDEX "Distribution_tenant_Id_idx" ON "Distribution"("tenant_Id");

-- CreateIndex
CREATE INDEX "DemandForecast_tenant_Id_idx" ON "DemandForecast"("tenant_Id");

-- CreateIndex
CREATE INDEX "SupplyChainRisk_tenant_Id_idx" ON "SupplyChainRisk"("tenant_Id");

-- CreateIndex
CREATE INDEX "Asset_tenant_Id_idx" ON "Asset"("tenant_Id");

-- CreateIndex
CREATE INDEX "Asset_tenant_Id_lifecycleStatus_idx" ON "Asset"("tenant_Id", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "AssetAllocation_tenant_Id_idx" ON "AssetAllocation"("tenant_Id");

-- CreateIndex
CREATE INDEX "AssetAllocation_tenant_Id_assetId_status_idx" ON "AssetAllocation"("tenant_Id", "assetId", "status");

-- CreateIndex
CREATE INDEX "AssetMaintenanceSchedule_tenant_Id_idx" ON "AssetMaintenanceSchedule"("tenant_Id");

-- CreateIndex
CREATE INDEX "AssetMaintenanceSchedule_tenant_Id_assetId_nextDueAt_idx" ON "AssetMaintenanceSchedule"("tenant_Id", "assetId", "nextDueAt");

-- CreateIndex
CREATE INDEX "AssetDepreciationEntry_tenant_Id_idx" ON "AssetDepreciationEntry"("tenant_Id");

-- CreateIndex
CREATE INDEX "AssetDepreciationEntry_tenant_Id_assetId_postedAt_idx" ON "AssetDepreciationEntry"("tenant_Id", "assetId", "postedAt");

-- CreateIndex
CREATE INDEX "Recruitment_tenant_Id_idx" ON "Recruitment"("tenant_Id");

-- CreateIndex
CREATE INDEX "Training_tenant_Id_idx" ON "Training"("tenant_Id");

-- CreateIndex
CREATE INDEX "Performance_tenant_Id_idx" ON "Performance"("tenant_Id");

-- CreateIndex
CREATE INDEX "Benefit_tenant_Id_idx" ON "Benefit"("tenant_Id");

-- CreateIndex
CREATE INDEX "Project_tenant_Id_idx" ON "Project"("tenant_Id");

-- CreateIndex
CREATE INDEX "ProjectTask_tenant_Id_idx" ON "ProjectTask"("tenant_Id");

-- CreateIndex
CREATE INDEX "ProjectTask_tenant_Id_projectId_status_idx" ON "ProjectTask"("tenant_Id", "projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectResource_tenant_Id_idx" ON "ProjectResource"("tenant_Id");

-- CreateIndex
CREATE INDEX "ProjectResource_tenant_Id_projectId_idx" ON "ProjectResource"("tenant_Id", "projectId");

-- CreateIndex
CREATE INDEX "ProjectBudget_tenant_Id_idx" ON "ProjectBudget"("tenant_Id");

-- CreateIndex
CREATE INDEX "ProjectBudget_tenant_Id_projectId_idx" ON "ProjectBudget"("tenant_Id", "projectId");

-- CreateIndex
CREATE INDEX "TimeEntry_tenant_Id_idx" ON "TimeEntry"("tenant_Id");

-- CreateIndex
CREATE INDEX "TimeEntry_tenant_Id_projectId_workDate_idx" ON "TimeEntry"("tenant_Id", "projectId", "workDate");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_tenant_Id_idx" ON "WorkflowDefinition"("tenant_Id");

-- CreateIndex
CREATE INDEX "WorkflowInstance_tenant_Id_idx" ON "WorkflowInstance"("tenant_Id");

-- CreateIndex
CREATE INDEX "WorkflowInstance_tenant_Id_definitionId_idx" ON "WorkflowInstance"("tenant_Id", "definitionId");

-- CreateIndex
CREATE INDEX "Approval_tenant_Id_idx" ON "Approval"("tenant_Id");

-- CreateIndex
CREATE INDEX "Approval_tenant_Id_instanceId_idx" ON "Approval"("tenant_Id", "instanceId");

-- CreateIndex
CREATE INDEX "Approval_tenant_Id_approverId_idx" ON "Approval"("tenant_Id", "approverId");

-- CreateIndex
CREATE INDEX "WorkflowActionLog_tenant_Id_idx" ON "WorkflowActionLog"("tenant_Id");

-- CreateIndex
CREATE INDEX "WorkflowActionLog_tenant_Id_instanceId_idx" ON "WorkflowActionLog"("tenant_Id", "instanceId");

-- CreateIndex
CREATE INDEX "Notification_tenant_Id_idx" ON "Notification"("tenant_Id");

-- CreateIndex
CREATE INDEX "Report_tenant_Id_idx" ON "Report"("tenant_Id");

-- CreateIndex
CREATE INDEX "Report_tenant_Id_moduleName_idx" ON "Report"("tenant_Id", "moduleName");

-- CreateIndex
CREATE INDEX "Report_tenant_Id_status_idx" ON "Report"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX "ReportRun_tenant_Id_idx" ON "ReportRun"("tenant_Id");

-- CreateIndex
CREATE INDEX "ReportRun_tenant_Id_reportId_createdAt_idx" ON "ReportRun"("tenant_Id", "reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Setting_tenant_Id_idx" ON "Setting"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_tenant_Id_settingKey_key" ON "Setting"("tenant_Id", "settingKey");

-- CreateIndex
CREATE INDEX "ZaloAccount_tenant_Id_idx" ON "ZaloAccount"("tenant_Id");

-- CreateIndex
CREATE INDEX "ZaloAccount_tenant_Id_accountType_idx" ON "ZaloAccount"("tenant_Id", "accountType");

-- CreateIndex
CREATE INDEX "ZaloAccount_tenant_Id_status_idx" ON "ZaloAccount"("tenant_Id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ZaloAccount_tenant_Id_zaloUid_key" ON "ZaloAccount"("tenant_Id", "zaloUid");

-- CreateIndex
CREATE INDEX "ConversationThread_tenant_Id_idx" ON "ConversationThread"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationThread_tenant_Id_channel_lastMessageAt_idx" ON "ConversationThread"("tenant_Id", "channel", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationThread_tenant_Id_customerId_idx" ON "ConversationThread"("tenant_Id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_tenant_Id_channel_channelAccountId_exter_key" ON "ConversationThread"("tenant_Id", "channel", "channelAccountId", "externalThreadId");

-- CreateIndex
CREATE INDEX "ConversationMessage_tenant_Id_idx" ON "ConversationMessage"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationMessage_tenant_Id_threadId_sentAt_idx" ON "ConversationMessage"("tenant_Id", "threadId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_tenant_Id_threadId_externalMessageId_key" ON "ConversationMessage"("tenant_Id", "threadId", "externalMessageId");

-- CreateIndex
CREATE INDEX "ConversationEvaluationJob_tenant_Id_idx" ON "ConversationEvaluationJob"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationEvaluationJob_tenant_Id_isActive_nextRunAt_idx" ON "ConversationEvaluationJob"("tenant_Id", "isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ConversationEvaluationRun_tenant_Id_idx" ON "ConversationEvaluationRun"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationEvaluationRun_tenant_Id_jobId_startedAt_idx" ON "ConversationEvaluationRun"("tenant_Id", "jobId", "startedAt");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_tenant_Id_idx" ON "ConversationEvaluation"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_tenant_Id_threadId_evaluatedAt_idx" ON "ConversationEvaluation"("tenant_Id", "threadId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_tenant_Id_runId_idx" ON "ConversationEvaluation"("tenant_Id", "runId");

-- CreateIndex
CREATE INDEX "ConversationViolation_tenant_Id_idx" ON "ConversationViolation"("tenant_Id");

-- CreateIndex
CREATE INDEX "ConversationViolation_tenant_Id_evaluationId_idx" ON "ConversationViolation"("tenant_Id", "evaluationId");

-- AddForeignKey
ALTER TABLE "CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_primaryCustomerId_fkey" FOREIGN KEY ("primaryCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_mergedCustomerId_fkey" FOREIGN KEY ("mergedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantOfProductId_fkey" FOREIGN KEY ("variantOfProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAllocation" ADD CONSTRAINT "AssetAllocation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationEntry" ADD CONSTRAINT "AssetDepreciationEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectResource" ADD CONSTRAINT "ProjectResource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActionLog" ADD CONSTRAINT "WorkflowActionLog_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ZaloAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvaluationRun" ADD CONSTRAINT "ConversationEvaluationRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConversationEvaluationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvaluation" ADD CONSTRAINT "ConversationEvaluation_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvaluation" ADD CONSTRAINT "ConversationEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ConversationEvaluationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationViolation" ADD CONSTRAINT "ConversationViolation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ConversationEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
