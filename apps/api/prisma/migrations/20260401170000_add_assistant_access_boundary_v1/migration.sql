-- Assistant v1 access-boundary schema rollout.
-- Idempotent DDL is used here to reduce risk on environments
-- that may already contain partial objects from manual sync.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantKnowledgeSource" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "rootPath" TEXT,
    "sourceUrl" TEXT,
    "includePatterns" JSONB,
    "metadataJson" JSONB,
    "scopeType" TEXT NOT NULL DEFAULT 'company',
    "scopeRefIds" JSONB,
    "allowedRoles" JSONB,
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "scheduleRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantKnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantKnowledgeDocument" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "checksum" TEXT,
    "contentText" TEXT,
    "metadataJson" JSONB,
    "scopeType" TEXT NOT NULL DEFAULT 'company',
    "scopeRefIds" JSONB,
    "allowedRoles" JSONB,
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "scopeType" TEXT NOT NULL DEFAULT 'company',
    "scopeRefIds" JSONB,
    "allowedRoles" JSONB,
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantReportRun" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'MANUAL',
    "reportPacksJson" JSONB,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "accessSnapshotJson" JSONB,
    "summaryJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantDispatchChannel" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "webhookSecretRef" TEXT,
    "scopeType" TEXT NOT NULL DEFAULT 'company',
    "scopeRefIds" JSONB,
    "allowedReportPacks" JSONB,
    "metadataJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantDispatchChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantReportArtifact" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'company',
    "scopeRefIds" JSONB,
    "status" "GenericStatus" NOT NULL DEFAULT 'PENDING',
    "contentJson" JSONB,
    "channelId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantReportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantDispatchAttempt" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantDispatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantAccessDecisionLog" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "scopeType" TEXT NOT NULL,
    "scopeRefIds" JSONB,
    "allowedModulesJson" JSONB,
    "decisionReason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantAccessDecisionLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "AssistantKnowledgeSource_tenant_Id_idx" ON "AssistantKnowledgeSource"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantKnowledgeSource_tenant_Id_isActive_idx" ON "AssistantKnowledgeSource"("tenant_Id", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantKnowledgeSource_tenant_Id_name_key" ON "AssistantKnowledgeSource"("tenant_Id", "name");

CREATE INDEX IF NOT EXISTS "AssistantKnowledgeDocument_tenant_Id_idx" ON "AssistantKnowledgeDocument"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantKnowledgeDocument_tenant_Id_sourceId_idx" ON "AssistantKnowledgeDocument"("tenant_Id", "sourceId");
CREATE INDEX IF NOT EXISTS "AssistantKnowledgeDocument_tenant_Id_status_idx" ON "AssistantKnowledgeDocument"("tenant_Id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantKnowledgeDocument_tenant_Id_sourceId_uri_key" ON "AssistantKnowledgeDocument"("tenant_Id", "sourceId", "uri");

CREATE INDEX IF NOT EXISTS "AssistantKnowledgeChunk_tenant_Id_idx" ON "AssistantKnowledgeChunk"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantKnowledgeChunk_tenant_Id_documentId_idx" ON "AssistantKnowledgeChunk"("tenant_Id", "documentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantKnowledgeChunk_tenant_Id_documentId_chunkIndex_key" ON "AssistantKnowledgeChunk"("tenant_Id", "documentId", "chunkIndex");

CREATE INDEX IF NOT EXISTS "AssistantReportRun_tenant_Id_idx" ON "AssistantReportRun"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantReportRun_tenant_Id_status_createdAt_idx" ON "AssistantReportRun"("tenant_Id", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "AssistantDispatchChannel_tenant_Id_idx" ON "AssistantDispatchChannel"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantDispatchChannel_tenant_Id_isActive_idx" ON "AssistantDispatchChannel"("tenant_Id", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantDispatchChannel_tenant_Id_name_key" ON "AssistantDispatchChannel"("tenant_Id", "name");

CREATE INDEX IF NOT EXISTS "AssistantReportArtifact_tenant_Id_idx" ON "AssistantReportArtifact"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantReportArtifact_tenant_Id_runId_artifactType_idx" ON "AssistantReportArtifact"("tenant_Id", "runId", "artifactType");
CREATE INDEX IF NOT EXISTS "AssistantReportArtifact_tenant_Id_status_artifactType_idx" ON "AssistantReportArtifact"("tenant_Id", "status", "artifactType");
CREATE INDEX IF NOT EXISTS "AssistantReportArtifact_tenant_Id_channelId_idx" ON "AssistantReportArtifact"("tenant_Id", "channelId");

CREATE INDEX IF NOT EXISTS "AssistantDispatchAttempt_tenant_Id_idx" ON "AssistantDispatchAttempt"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantDispatchAttempt_tenant_Id_artifactId_createdAt_idx" ON "AssistantDispatchAttempt"("tenant_Id", "artifactId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantDispatchAttempt_tenant_Id_channelId_createdAt_idx" ON "AssistantDispatchAttempt"("tenant_Id", "channelId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantDispatchAttempt_tenant_Id_status_nextRetryAt_idx" ON "AssistantDispatchAttempt"("tenant_Id", "status", "nextRetryAt");

CREATE INDEX IF NOT EXISTS "AssistantAccessDecisionLog_tenant_Id_idx" ON "AssistantAccessDecisionLog"("tenant_Id");
CREATE INDEX IF NOT EXISTS "AssistantAccessDecisionLog_tenant_Id_actorUserId_createdAt_idx" ON "AssistantAccessDecisionLog"("tenant_Id", "actorUserId", "createdAt");

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantKnowledgeDocument_sourceId_fkey') THEN
    ALTER TABLE "AssistantKnowledgeDocument"
      ADD CONSTRAINT "AssistantKnowledgeDocument_sourceId_fkey"
      FOREIGN KEY ("sourceId") REFERENCES "AssistantKnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantKnowledgeChunk_documentId_fkey') THEN
    ALTER TABLE "AssistantKnowledgeChunk"
      ADD CONSTRAINT "AssistantKnowledgeChunk_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "AssistantKnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantReportArtifact_runId_fkey') THEN
    ALTER TABLE "AssistantReportArtifact"
      ADD CONSTRAINT "AssistantReportArtifact_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AssistantReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantReportArtifact_channelId_fkey') THEN
    ALTER TABLE "AssistantReportArtifact"
      ADD CONSTRAINT "AssistantReportArtifact_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "AssistantDispatchChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantDispatchAttempt_artifactId_fkey') THEN
    ALTER TABLE "AssistantDispatchAttempt"
      ADD CONSTRAINT "AssistantDispatchAttempt_artifactId_fkey"
      FOREIGN KEY ("artifactId") REFERENCES "AssistantReportArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantDispatchAttempt_channelId_fkey') THEN
    ALTER TABLE "AssistantDispatchAttempt"
      ADD CONSTRAINT "AssistantDispatchAttempt_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "AssistantDispatchChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
