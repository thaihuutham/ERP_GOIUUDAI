-- CreateEnum
CREATE TYPE "IamSubjectType" AS ENUM ('USER', 'POSITION', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "IamScopeMode" AS ENUM ('SELF', 'SUBTREE', 'UNIT_FULL');

-- CreateEnum
CREATE TYPE "IamGrantReason" AS ENUM ('WORKFLOW_ASSIGNMENT', 'MANUAL_OVERRIDE', 'SYSTEM_SYNC');

-- CreateTable
CREATE TABLE "iam_action_grants" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "subjectType" "IamSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_action_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_capability_grants" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "subjectType" "IamSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_scope_override" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeMode" "IamScopeMode" NOT NULL,
    "rootOrgUnitId" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_user_scope_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_permission_ceiling" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "moduleKey" TEXT,
    "action" "PermissionAction",
    "capabilityKey" TEXT,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "reason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_permission_ceiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_resolved_scope_members" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeVersion" INTEGER NOT NULL DEFAULT 1,
    "employeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orgUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_resolved_scope_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_record_access_grants" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "grantReason" "IamGrantReason" NOT NULL DEFAULT 'WORKFLOW_ASSIGNMENT',
    "actions" "PermissionAction"[] DEFAULT ARRAY[]::"PermissionAction"[],
    "expiresAt" TIMESTAMP(3),
    "sourceRef" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iam_record_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iam_action_grants_tenant_Id_idx" ON "iam_action_grants"("tenant_Id");

-- CreateIndex
CREATE INDEX "iam_action_grants_tenant_Id_subjectType_subjectId_moduleKey_idx" ON "iam_action_grants"("tenant_Id", "subjectType", "subjectId", "moduleKey", "action");

-- CreateIndex
CREATE INDEX "iam_action_grants_tenant_Id_moduleKey_action_idx" ON "iam_action_grants"("tenant_Id", "moduleKey", "action");

-- CreateIndex
CREATE INDEX "iam_capability_grants_tenant_Id_idx" ON "iam_capability_grants"("tenant_Id");

-- CreateIndex
CREATE INDEX "iam_capability_grants_tenant_Id_subjectType_subjectId_capab_idx" ON "iam_capability_grants"("tenant_Id", "subjectType", "subjectId", "capabilityKey");

-- CreateIndex
CREATE INDEX "iam_user_scope_override_tenant_Id_scopeMode_idx" ON "iam_user_scope_override"("tenant_Id", "scopeMode");

-- CreateIndex
CREATE INDEX "iam_user_scope_override_tenant_Id_rootOrgUnitId_idx" ON "iam_user_scope_override"("tenant_Id", "rootOrgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "iam_user_scope_override_tenant_Id_userId_key" ON "iam_user_scope_override"("tenant_Id", "userId");

-- CreateIndex
CREATE INDEX "iam_permission_ceiling_tenant_Id_idx" ON "iam_permission_ceiling"("tenant_Id");

-- CreateIndex
CREATE INDEX "iam_permission_ceiling_tenant_Id_actorUserId_idx" ON "iam_permission_ceiling"("tenant_Id", "actorUserId");

-- CreateIndex
CREATE INDEX "iam_permission_ceiling_tenant_Id_actorUserId_moduleKey_acti_idx" ON "iam_permission_ceiling"("tenant_Id", "actorUserId", "moduleKey", "action");

-- CreateIndex
CREATE INDEX "iam_permission_ceiling_tenant_Id_actorUserId_capabilityKey_idx" ON "iam_permission_ceiling"("tenant_Id", "actorUserId", "capabilityKey");

-- CreateIndex
CREATE INDEX "iam_resolved_scope_members_tenant_Id_expiresAt_idx" ON "iam_resolved_scope_members"("tenant_Id", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "iam_resolved_scope_members_tenant_Id_userId_key" ON "iam_resolved_scope_members"("tenant_Id", "userId");

-- CreateIndex
CREATE INDEX "iam_record_access_grants_tenant_Id_idx" ON "iam_record_access_grants"("tenant_Id");

-- CreateIndex
CREATE INDEX "iam_record_access_grants_tenant_Id_actorUserId_recordType_r_idx" ON "iam_record_access_grants"("tenant_Id", "actorUserId", "recordType", "recordId");

-- CreateIndex
CREATE INDEX "iam_record_access_grants_tenant_Id_recordType_recordId_idx" ON "iam_record_access_grants"("tenant_Id", "recordType", "recordId");

-- CreateIndex
CREATE INDEX "iam_record_access_grants_tenant_Id_expiresAt_idx" ON "iam_record_access_grants"("tenant_Id", "expiresAt");

