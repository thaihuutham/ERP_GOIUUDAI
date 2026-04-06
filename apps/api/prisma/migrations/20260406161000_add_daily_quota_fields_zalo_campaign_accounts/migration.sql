-- AlterTable
ALTER TABLE "zalo_campaign_accounts"
ADD COLUMN "dailySentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyQuotaDate" TEXT;
