-- Add explicit report run lifecycle + output metadata for real export pipeline
ALTER TABLE "ReportRun"
  ADD COLUMN "runStatus" TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN "outputMimeType" TEXT,
  ADD COLUMN "outputSizeBytes" INTEGER,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "ReportRun_tenant_Id_runStatus_createdAt_idx"
  ON "ReportRun"("tenant_Id", "runStatus", "createdAt");
