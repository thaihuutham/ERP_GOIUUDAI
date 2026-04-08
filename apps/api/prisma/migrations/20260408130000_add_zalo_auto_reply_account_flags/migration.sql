-- Add per-account AI auto-reply controls for Zalo personal
ALTER TABLE "ZaloAccount"
  ADD COLUMN "aiAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiAutoReplyTakeoverMinutes" INTEGER NOT NULL DEFAULT 5;
