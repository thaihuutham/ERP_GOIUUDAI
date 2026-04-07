-- CreateEnum
CREATE TYPE "CustomerCareStatus" AS ENUM (
  'MOI_CHUA_TU_VAN',
  'DANG_SUY_NGHI',
  'DONG_Y_CHUYEN_THANH_KH',
  'KH_TU_CHOI',
  'KH_DA_MUA_BEN_KHAC',
  'NGUOI_NHA_LAM_THUE_BAO',
  'KHONG_NGHE_MAY_LAN_1',
  'KHONG_NGHE_MAY_LAN_2',
  'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA'
);

-- CreateEnum
CREATE TYPE "CustomerZaloNickType" AS ENUM (
  'CHUA_KIEM_TRA',
  'CHUA_CO_NICK_ZALO',
  'CHAN_NGUOI_LA',
  'GUI_DUOC_TIN_NHAN'
);

-- Add zaloNickType first so existing rows are backfilled with default
ALTER TABLE "Customer"
ADD COLUMN "zaloNickType" "CustomerZaloNickType" NOT NULL DEFAULT 'CHUA_KIEM_TRA';

-- Migrate old GenericStatus-based customer status to dedicated care status enum
ALTER TABLE "Customer"
ADD COLUMN "status_new" "CustomerCareStatus" NOT NULL DEFAULT 'MOI_CHUA_TU_VAN';

UPDATE "Customer"
SET "status_new" = 'MOI_CHUA_TU_VAN';

ALTER TABLE "Customer" DROP COLUMN "status";
ALTER TABLE "Customer" RENAME COLUMN "status_new" TO "status";

-- Add indices to support CRM/campaign filters
CREATE INDEX "Customer_tenant_Id_status_idx" ON "Customer"("tenant_Id", "status");
CREATE INDEX "Customer_tenant_Id_zaloNickType_idx" ON "Customer"("tenant_Id", "zaloNickType");
