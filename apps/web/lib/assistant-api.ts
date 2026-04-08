import {
  apiRequest,
  normalizeListMetadata,
  normalizeListPayload,
  normalizeObjectPayload,
  type ApiListPageInfo,
  type ApiListSortMeta
} from './api-client';

export const ASSISTANT_SCOPE_OPTIONS = ['company', 'branch', 'department', 'self'] as const;
export type AssistantScopeType = (typeof ASSISTANT_SCOPE_OPTIONS)[number];

export const ASSISTANT_SOURCE_TYPES = ['FOLDER', 'LINK'] as const;
export type AssistantSourceType = (typeof ASSISTANT_SOURCE_TYPES)[number];

export const ASSISTANT_RUN_TYPES = ['MANUAL', 'HOURLY', 'DAILY'] as const;
export type AssistantRunType = (typeof ASSISTANT_RUN_TYPES)[number];

export const ASSISTANT_CHANNEL_TYPES = ['WEBHOOK', 'ZALO', 'TELEGRAM'] as const;
export type AssistantChannelType = (typeof ASSISTANT_CHANNEL_TYPES)[number];

export const ASSISTANT_REPORT_PACKS = ['sales', 'cskh', 'hr', 'workflow', 'finance'] as const;
export type AssistantReportPack = (typeof ASSISTANT_REPORT_PACKS)[number];

export type AssistantAccess = {
  actor: {
    userId: string;
    email: string;
    role: 'STAFF' | 'MANAGER' | 'ADMIN';
    tenantId: string;
    employeeId?: string;
    positionId?: string;
  };
  scope: {
    type: AssistantScopeType;
    orgUnitIds: string[];
    employeeIds: string[];
    actorIds: string[];
    scopeRefIds: string[];
  };
  allowedModules: string[];
  moduleActions: Record<string, string[]>;
  policy: {
    enforcePermissionEngine: boolean;
    denyIfNoScope: boolean;
    chatChannelScopeEnforced: boolean;
  };
};

export type AssistantProxySource = 'sales' | 'cskh' | 'hr' | 'workflow' | 'finance';

export type AssistantProxyResponse = {
  module: AssistantProxySource;
  scope: AssistantAccess['scope'];
  query?: {
    q?: string;
    limit?: number;
  };
  snapshot: Record<string, unknown>;
};

export type AssistantKnowledgeSource = {
  id: string;
  name: string;
  sourceType: AssistantSourceType;
  rootPath?: string | null;
  sourceUrl?: string | null;
  includePatterns?: string[];
  scopeType: AssistantScopeType;
  scopeRefIds: string[];
  allowedRoles: string[];
  classification?: string | null;
  scheduleRule?: string | null;
  isActive: boolean;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AssistantKnowledgeDocument = {
  id: string;
  sourceId: string;
  title: string;
  uri: string;
  checksum?: string | null;
  contentText?: string | null;
  scopeType: AssistantScopeType;
  scopeRefIds: string[];
  allowedRoles: string[];
  classification?: string | null;
  status?: string | null;
  lastIndexedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AssistantReportArtifact = {
  id: string;
  runId: string;
  artifactType: 'ERP' | 'CHAT' | string;
  scopeType: AssistantScopeType;
  scopeRefIds: string[];
  status: string;
  contentJson?: Record<string, unknown> | null;
  channelId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  dispatchAttempts?: AssistantDispatchAttempt[];
};

export type AssistantDispatchAttempt = {
  id: string;
  channelId: string;
  artifactId: string;
  attemptNo: number;
  status: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  nextRetryAt?: string | null;
  dispatchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AssistantReportRun = {
  id: string;
  runType: AssistantRunType;
  reportPacksJson?: string[] | null;
  status: string;
  requestedBy: string;
  accessSnapshotJson?: Record<string, unknown> | null;
  summaryJson?: Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  artifacts?: AssistantReportArtifact[];
};

export type AssistantDispatchChannel = {
  id: string;
  name: string;
  channelType: AssistantChannelType;
  endpointUrl: string;
  webhookSecretRef?: string | null;
  scopeType: AssistantScopeType;
  scopeRefIds: string[];
  allowedReportPacks: string[];
  metadataJson?: Record<string, unknown> | null;
  isActive: boolean;
  lastTestedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AssistantListResponse<T> = {
  items: T[];
  count: number;
  pageInfo: ApiListPageInfo | null;
  sortMeta: ApiListSortMeta | null;
};

function normalizeAssistantListResponse<T>(payload: unknown): AssistantListResponse<T> {
  const normalizedObject = normalizeObjectPayload(payload);
  const metadata = normalizeListMetadata(payload);
  const items = normalizeListPayload(payload) as T[];
  const rawCount = normalizedObject?.count;
  const count = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : items.length;
  return {
    items,
    count,
    pageInfo: metadata.pageInfo,
    sortMeta: metadata.sortMeta
  };
}

function buildListQuery(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Record<string, string | number | boolean>;
}

export const assistantApi = {
  getAccessMe() {
    return apiRequest<AssistantAccess>('/assistant/access/me');
  },

  getProxy(source: AssistantProxySource, query?: { q?: string; limit?: number }) {
    return apiRequest<AssistantProxyResponse>(`/assistant/proxy/${source}`, {
      query: buildListQuery({
        q: query?.q,
        limit: query?.limit
      })
    });
  },

  listKnowledgeSources(query?: {
    q?: string;
    sourceType?: AssistantSourceType;
    isActive?: boolean;
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    return apiRequest<unknown>('/assistant/knowledge/sources', {
      query: buildListQuery({
        q: query?.q,
        sourceType: query?.sourceType,
        isActive: query?.isActive === undefined ? undefined : String(query.isActive),
        limit: query?.limit,
        cursor: query?.cursor,
        sortBy: query?.sortBy,
        sortDir: query?.sortDir
      })
    }).then((payload) => normalizeAssistantListResponse<AssistantKnowledgeSource>(payload));
  },

  createKnowledgeSource(payload: {
    name: string;
    sourceType: AssistantSourceType;
    rootPath?: string;
    sourceUrl?: string;
    includePatterns?: string[];
    scopeType?: AssistantScopeType;
    scopeRefIds?: string[];
    allowedRoles?: string[];
    classification?: string;
    scheduleRule?: string;
    isActive?: boolean;
  }) {
    return apiRequest<AssistantKnowledgeSource>('/assistant/knowledge/sources', {
      method: 'POST',
      body: payload
    });
  },

  syncKnowledgeSource(sourceId: string, payload?: { dryRun?: boolean; maxFiles?: number }) {
    return apiRequest<{
      sourceId: string;
      sourceType: AssistantSourceType;
      dryRun: boolean;
      ingestedDocuments: number;
      ingestedUris: string[];
      syncedAt: string;
    }>(`/assistant/knowledge/sources/${sourceId}/sync`, {
      method: 'POST',
      body: payload ?? {}
    });
  },

  listKnowledgeDocuments(query?: {
    q?: string;
    sourceId?: string;
    scopeType?: AssistantScopeType;
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    return apiRequest<unknown>('/assistant/knowledge/documents', {
      query: buildListQuery({
        q: query?.q,
        sourceId: query?.sourceId,
        scopeType: query?.scopeType,
        limit: query?.limit,
        cursor: query?.cursor,
        sortBy: query?.sortBy,
        sortDir: query?.sortDir
      })
    }).then((payload) => normalizeAssistantListResponse<AssistantKnowledgeDocument>(payload));
  },

  listRuns(query?: {
    status?: string;
    runType?: AssistantRunType;
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    return apiRequest<unknown>('/assistant/reports/runs', {
      query: buildListQuery({
        status: query?.status,
        runType: query?.runType,
        limit: query?.limit,
        cursor: query?.cursor,
        sortBy: query?.sortBy,
        sortDir: query?.sortDir
      })
    }).then((payload) => normalizeAssistantListResponse<AssistantReportRun>(payload));
  },

  createRun(payload: {
    runType?: AssistantRunType;
    reportPacks?: AssistantReportPack[];
    dispatchChat?: boolean;
  }) {
    return apiRequest<{
      runId: string;
      runType: AssistantRunType;
      reportPacks: AssistantReportPack[];
      artifacts: {
        erpArtifactId: string;
        chatArtifactId: string | null;
      };
    }>('/assistant/reports/runs', {
      method: 'POST',
      body: payload
    });
  },

  getRun(runId: string) {
    return apiRequest<AssistantReportRun>(`/assistant/reports/runs/${runId}`);
  },

  approveRun(runId: string, payload?: { note?: string }) {
    return apiRequest<AssistantReportRun>(`/assistant/reports/runs/${runId}/approve`, {
      method: 'POST',
      body: payload ?? {}
    });
  },

  rejectRun(runId: string, payload?: { note?: string }) {
    return apiRequest<AssistantReportRun>(`/assistant/reports/runs/${runId}/reject`, {
      method: 'POST',
      body: payload ?? {}
    });
  },

  listChannels(query?: {
    q?: string;
    channelType?: AssistantChannelType;
    scopeType?: AssistantScopeType;
    isActive?: boolean;
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    return apiRequest<unknown>('/assistant/channels', {
      query: buildListQuery({
        q: query?.q,
        channelType: query?.channelType,
        scopeType: query?.scopeType,
        isActive: query?.isActive === undefined ? undefined : String(query.isActive),
        limit: query?.limit,
        cursor: query?.cursor,
        sortBy: query?.sortBy,
        sortDir: query?.sortDir
      })
    }).then((payload) => normalizeAssistantListResponse<AssistantDispatchChannel>(payload));
  },

  createChannel(payload: {
    name: string;
    channelType: AssistantChannelType;
    endpointUrl: string;
    webhookSecretRef?: string;
    scopeType?: AssistantScopeType;
    scopeRefIds?: string[];
    allowedReportPacks?: string[];
    isActive?: boolean;
  }) {
    return apiRequest<AssistantDispatchChannel>('/assistant/channels', {
      method: 'POST',
      body: payload
    });
  },

  updateChannel(
    channelId: string,
    payload: {
      name?: string;
      channelType?: AssistantChannelType;
      endpointUrl?: string;
      webhookSecretRef?: string;
      scopeType?: AssistantScopeType;
      scopeRefIds?: string[];
      allowedReportPacks?: string[];
      isActive?: boolean;
    }
  ) {
    return apiRequest<AssistantDispatchChannel>(`/assistant/channels/${channelId}`, {
      method: 'PATCH',
      body: payload
    });
  },

  testChannel(channelId: string) {
    return apiRequest<{
      channelId: string;
      ok: boolean;
      statusCode: number;
      message: string;
    }>(`/assistant/channels/${channelId}/test`, {
      method: 'POST',
      body: {}
    });
  }
};
