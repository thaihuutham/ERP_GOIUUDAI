-- CreateEnum
CREATE TYPE "ZaloAccountPermissionLevel" AS ENUM ('READ', 'CHAT', 'ADMIN');

-- CreateTable
CREATE TABLE "zalo_account_assignments" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "zaloAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionLevel" "ZaloAccountPermissionLevel" NOT NULL DEFAULT 'READ',
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zalo_account_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zalo_account_assignments_tenant_Id_idx" ON "zalo_account_assignments"("tenant_Id");

-- CreateIndex
CREATE INDEX "zalo_account_assignments_tenant_Id_userId_revokedAt_idx" ON "zalo_account_assignments"("tenant_Id", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "zalo_account_assignments_tenant_Id_zaloAccountId_revokedAt_idx" ON "zalo_account_assignments"("tenant_Id", "zaloAccountId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_account_assignments_tenant_account_user_active_key" ON "zalo_account_assignments"("tenant_Id", "zaloAccountId", "userId") WHERE "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "zalo_account_assignments" ADD CONSTRAINT "zalo_account_assignments_zaloAccountId_fkey" FOREIGN KEY ("zaloAccountId") REFERENCES "ZaloAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
