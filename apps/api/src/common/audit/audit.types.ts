import { AuditOperationType } from '@prisma/client';

export type AuditRequestContext = {
  tenantId: string;
  module: string;
  requestId: string | null;
  route: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
};

export type AuditActionMetadata = {
  action: string;
  module?: string;
  entityType?: string;
  entityIdParam?: string;
  metadata?: Record<string, unknown>;
};

export type AuditReadMetadata = {
  action: string;
  module?: string;
  entityType?: string;
  entityIdParam?: string;
  metadata?: Record<string, unknown>;
};

export type AuditActionContext = AuditActionMetadata & {
  entityId?: string | null;
};

export type AppendAuditLogInput = {
  tenantId: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  operationType: AuditOperationType;
  actorId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: string[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
};
