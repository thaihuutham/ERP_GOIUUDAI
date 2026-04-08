'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ASSISTANT_SCOPE_OPTIONS,
  ASSISTANT_SOURCE_TYPES,
  assistantApi,
  type AssistantKnowledgeDocument,
  type AssistantKnowledgeSource,
  type AssistantScopeType,
  type AssistantSourceType
} from '../../lib/assistant-api';
import { apiRequest, normalizeListPayload, type ApiListSortMeta } from '../../lib/api-client';
import { formatRuntimeDateTime } from '../../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../../lib/bulk-actions';
import { useCursorTableState } from '../../lib/use-cursor-table-state';
import { StandardDataTable, type ColumnDefinition, type StandardTableBulkAction } from '../ui/standard-data-table';

type OrgNode = {
  id: string;
  name: string;
  type?: string;
  children?: OrgNode[];
};

type UserOption = {
  id: string;
  email: string;
  role?: string;
  employee?: {
    fullName?: string | null;
  } | null;
};

const MAX_FILE_OPTIONS = [20, 50, 100, 200, 500, 1000];
const CLASSIFICATION_OPTIONS = ['internal', 'confidential', 'public'] as const;

function formatDate(value?: string | null) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function flattenOrgTree(nodes: OrgNode[], prefix = ''): Array<{ id: string; label: string }> {
  const rows: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    rows.push({ id: node.id, label: `${label} (${node.type ?? 'ORG'})` });
    rows.push(...flattenOrgTree(node.children ?? [], label));
  }
  return rows;
}

function estimateChunkCount(contentText?: string | null) {
  const text = String(contentText ?? '');
  if (!text.trim()) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 1200));
}

export function AssistantKnowledgeBoard() {
  const [sources, setSources] = useState<AssistantKnowledgeSource[]>([]);
  const [documents, setDocuments] = useState<AssistantKnowledgeDocument[]>([]);
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; label: string }>>([]);

  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [loadingPickers, setLoadingPickers] = useState(true);

  const [sourceFilterQ, setSourceFilterQ] = useState('');
  const [sourceFilterType, setSourceFilterType] = useState('');
  const [sourceFilterIsActive, setSourceFilterIsActive] = useState('');
  const [sourceSortBy, setSourceSortBy] = useState('updatedAt');
  const [sourceSortDir, setSourceSortDir] = useState<'asc' | 'desc'>('desc');
  const [sourceSortMeta, setSourceSortMeta] = useState<ApiListSortMeta | null>(null);

  const [documentFilterQ, setDocumentFilterQ] = useState('');
  const [documentFilterSourceId, setDocumentFilterSourceId] = useState('');
  const [documentFilterScopeType, setDocumentFilterScopeType] = useState('');
  const [documentSortBy, setDocumentSortBy] = useState('updatedAt');
  const [documentSortDir, setDocumentSortDir] = useState<'asc' | 'desc'>('desc');
  const [documentSortMeta, setDocumentSortMeta] = useState<ApiListSortMeta | null>(null);

  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeMessage, setKnowledgeMessage] = useState<string | null>(null);
  const [selectedSourceRowIds, setSelectedSourceRowIds] = useState<BulkRowId[]>([]);
  const [selectedDocumentRowIds, setSelectedDocumentRowIds] = useState<BulkRowId[]>([]);

  const [createBusy, setCreateBusy] = useState(false);
  const [syncBusySourceId, setSyncBusySourceId] = useState('');
  const [syncDryRun, setSyncDryRun] = useState(false);
  const [syncMaxFiles, setSyncMaxFiles] = useState(100);

  const [formName, setFormName] = useState('');
  const [formSourceType, setFormSourceType] = useState<AssistantSourceType>('FOLDER');
  const [formRootPath, setFormRootPath] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formScopeType, setFormScopeType] = useState<AssistantScopeType>('department');
  const [formClassification, setFormClassification] = useState<(typeof CLASSIFICATION_OPTIONS)[number]>('internal');
  const [formScheduleRule, setFormScheduleRule] = useState('');
  const [formIncludePatternsText, setFormIncludePatternsText] = useState('**/*.md\n**/*.txt');
  const [formSelectedScopeRefs, setFormSelectedScopeRefs] = useState<string[]>([]);
  const [formSelectedRoles, setFormSelectedRoles] = useState<Record<string, boolean>>({
    ADMIN: false,
    MANAGER: true,
    STAFF: true
  });
  const [formIsActive, setFormIsActive] = useState(true);
  const sourceTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: sourceFilterQ.trim(),
        sourceType: sourceFilterType,
        isActive: sourceFilterIsActive,
        sortBy: sourceSortBy,
        sortDir: sourceSortDir,
        limit: 25
      }),
    [sourceFilterIsActive, sourceFilterQ, sourceFilterType, sourceSortBy, sourceSortDir]
  );
  const documentTableFingerprint = useMemo(
    () =>
      JSON.stringify({
        q: documentFilterQ.trim(),
        sourceId: documentFilterSourceId,
        scopeType: documentFilterScopeType,
        sortBy: documentSortBy,
        sortDir: documentSortDir,
        limit: 25
      }),
    [documentFilterQ, documentFilterScopeType, documentFilterSourceId, documentSortBy, documentSortDir]
  );
  const sourceTablePager = useCursorTableState(sourceTableFingerprint);
  const documentTablePager = useCursorTableState(documentTableFingerprint);

  const scopeRefOptions = useMemo(
    () => [...orgOptions, ...userOptions].sort((a, b) => a.label.localeCompare(b.label)),
    [orgOptions, userOptions]
  );

  const loadPickerOptions = async () => {
    setLoadingPickers(true);
    try {
      const [orgPayload, usersPayload] = await Promise.all([
        apiRequest<{ tree?: OrgNode[] }>('/settings/organization/tree'),
        apiRequest<{ items?: UserOption[] }>('/settings/iam/users', { query: { limit: 300 } })
      ]);

      setOrgOptions(flattenOrgTree(orgPayload.tree ?? []));
      setUserOptions(
        (normalizeListPayload(usersPayload) as UserOption[]).map((user) => ({
          id: user.id,
          label: `${user.employee?.fullName || user.email} (${user.role ?? 'USER'})`
        }))
      );
    } catch {
      setOrgOptions([]);
      setUserOptions([]);
    } finally {
      setLoadingPickers(false);
    }
  };

  const loadSources = async () => {
    setLoadingSources(true);
    setKnowledgeError(null);
    try {
      const payload = await assistantApi.listKnowledgeSources({
        q: sourceFilterQ || undefined,
        sourceType: (sourceFilterType || undefined) as AssistantSourceType | undefined,
        isActive:
          sourceFilterIsActive === ''
            ? undefined
            : sourceFilterIsActive === 'true',
        limit: 25,
        cursor: sourceTablePager.cursor ?? undefined,
        sortBy: sourceSortBy,
        sortDir: sourceSortDir
      });
      setSources(payload.items);
      sourceTablePager.syncFromPageInfo(payload.pageInfo);
      setSourceSortMeta(payload.sortMeta);
    } catch (error) {
      setSources([]);
      setKnowledgeError(error instanceof Error ? error.message : 'Không thể tải danh sách nguồn tri thức.');
    } finally {
      setLoadingSources(false);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocuments(true);
    setKnowledgeError(null);
    try {
      const payload = await assistantApi.listKnowledgeDocuments({
        q: documentFilterQ || undefined,
        sourceId: documentFilterSourceId || undefined,
        scopeType: (documentFilterScopeType || undefined) as AssistantScopeType | undefined,
        limit: 25,
        cursor: documentTablePager.cursor ?? undefined,
        sortBy: documentSortBy,
        sortDir: documentSortDir
      });
      setDocuments(payload.items);
      documentTablePager.syncFromPageInfo(payload.pageInfo);
      setDocumentSortMeta(payload.sortMeta);
    } catch (error) {
      setDocuments([]);
      setKnowledgeError(error instanceof Error ? error.message : 'Không thể tải tài liệu tri thức.');
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    void loadPickerOptions();
  }, []);

  useEffect(() => {
    void loadSources();
  }, [
    sourceFilterIsActive,
    sourceFilterQ,
    sourceFilterType,
    sourceSortBy,
    sourceSortDir,
    sourceTablePager.currentPage
  ]);

  useEffect(() => {
    void loadDocuments();
  }, [
    documentFilterQ,
    documentFilterScopeType,
    documentFilterSourceId,
    documentSortBy,
    documentSortDir,
    documentTablePager.currentPage
  ]);

  const onRefreshAll = async () => {
    await Promise.all([loadSources(), loadDocuments()]);
  };

  const onSubmitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusy) {
      return;
    }

    if (!formName.trim()) {
      setKnowledgeError('Tên nguồn là bắt buộc.');
      return;
    }
    if (formSourceType === 'FOLDER' && !formRootPath.trim()) {
      setKnowledgeError('Loại nguồn FOLDER yêu cầu thư mục gốc.');
      return;
    }
    if (formSourceType === 'LINK' && !formSourceUrl.trim()) {
      setKnowledgeError('Loại nguồn LINK yêu cầu URL nguồn.');
      return;
    }

    setCreateBusy(true);
    setKnowledgeError(null);
    setKnowledgeMessage(null);
    try {
      const includePatterns = formIncludePatternsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
      const selectedRoles = Object.entries(formSelectedRoles)
        .filter(([, checked]) => checked)
        .map(([role]) => role);

      await assistantApi.createKnowledgeSource({
        name: formName.trim(),
        sourceType: formSourceType,
        rootPath: formSourceType === 'FOLDER' ? formRootPath.trim() : undefined,
        sourceUrl: formSourceType === 'LINK' ? formSourceUrl.trim() : undefined,
        includePatterns,
        scopeType: formScopeType,
        scopeRefIds: formSelectedScopeRefs,
        allowedRoles: selectedRoles,
        classification: formClassification,
        scheduleRule: formScheduleRule.trim() || undefined,
        isActive: formIsActive
      });

      setKnowledgeMessage('Tạo nguồn tri thức thành công.');
      await loadSources();
      setFormName('');
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : 'Không thể tạo nguồn tri thức.');
    } finally {
      setCreateBusy(false);
    }
  };

  const onSyncSource = async (sourceId: string) => {
    if (syncBusySourceId) {
      return;
    }
    setSyncBusySourceId(sourceId);
    setKnowledgeError(null);
    setKnowledgeMessage(null);
    try {
      const response = await assistantApi.syncKnowledgeSource(sourceId, {
        dryRun: syncDryRun,
        maxFiles: syncMaxFiles
      });
      setKnowledgeMessage(
        `Đồng bộ nguồn ${response.sourceId} thành công. Đã nạp ${response.ingestedDocuments} tài liệu.`
      );
      await Promise.all([loadSources(), loadDocuments()]);
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : 'Không thể đồng bộ nguồn tri thức.');
    } finally {
      setSyncBusySourceId('');
    }
  };

  const sourceColumns = useMemo<ColumnDefinition<AssistantKnowledgeSource>[]>(
    () => [
      { key: 'name', label: 'Tên nguồn', sortKey: 'name', render: (row) => row.name },
      { key: 'sourceType', label: 'Loại nguồn', sortKey: 'sourceType', render: (row) => row.sourceType },
      {
        key: 'target',
        label: 'Đường dẫn / URL',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo target chưa hỗ trợ ở đợt này.',
        render: (row) => row.rootPath || row.sourceUrl || '--'
      },
      { key: 'scopeType', label: 'Phạm vi', sortKey: 'scopeType', render: (row) => row.scopeType },
      { key: 'lastSyncedAt', label: 'Lần đồng bộ gần nhất', sortKey: 'lastSyncedAt', render: (row) => formatDate(row.lastSyncedAt) },
      { key: 'isActive', label: 'Trạng thái', sortKey: 'isActive', render: (row) => (row.isActive ? 'Bật' : 'Tắt') }
    ],
    []
  );

  const documentRows = useMemo(
    () =>
      documents.map((document) => ({
        ...document,
        estimatedChunks: estimateChunkCount(document.contentText)
      })),
    [documents]
  );

  const sourceBulkActions: StandardTableBulkAction<AssistantKnowledgeSource>[] = [
    {
      key: 'bulk-sync-sources',
      label: 'Đồng bộ đã chọn',
      tone: 'primary',
      execute: async (selectedRows) => {
        if (selectedRows.length === 0) {
          return {
            total: 0,
            successCount: 0,
            failedCount: 0,
            failedIds: [],
            failures: [],
            actionLabel: 'Đồng bộ nguồn',
            message: 'Đồng bộ nguồn: không có nguồn nào được chọn.'
          };
        }

        const result = await runBulkOperation({
          ids: selectedRows.map((row) => row.id),
          continueOnError: true,
          chunkSize: 5,
          execute: async (sourceId) => {
            await assistantApi.syncKnowledgeSource(String(sourceId), {
              dryRun: syncDryRun,
              maxFiles: syncMaxFiles
            });
          }
        });

        const normalized: BulkExecutionResult = {
          ...result,
          actionLabel: 'Đồng bộ nguồn',
          message: formatBulkSummary(
            {
              ...result,
              actionLabel: 'Đồng bộ nguồn'
            },
            'Đồng bộ nguồn'
          )
        };

        if (normalized.successCount > 0) {
          await Promise.all([loadSources(), loadDocuments()]);
        }
        setKnowledgeMessage(normalized.message ?? null);
        if (normalized.failedCount > 0) {
          setKnowledgeError('Một số nguồn đồng bộ thất bại.');
        } else {
          setKnowledgeError(null);
        }
        return normalized;
      }
    }
  ];

  const documentColumns = useMemo<ColumnDefinition<(typeof documentRows)[number]>[]>(
    () => [
      { key: 'title', label: 'Tiêu đề', sortKey: 'title', render: (row) => row.title },
      {
        key: 'sourceId',
        label: 'Nguồn',
        sortable: false,
        sortDisabledTooltip: 'Sắp xếp theo nguồn liên kết chưa hỗ trợ ở đợt này.',
        render: (row) => row.sourceId
      },
      { key: 'scopeType', label: 'Phạm vi', sortKey: 'scopeType', render: (row) => row.scopeType },
      { key: 'classification', label: 'Phân loại', sortKey: 'classification', render: (row) => row.classification || '--' },
      {
        key: 'estimatedChunks',
        label: 'Số phân mảnh (ước lượng)',
        sortable: false,
        sortDisabledTooltip: 'Cột ước lượng phía client không hỗ trợ sắp xếp server-side.',
        render: (row) => String(row.estimatedChunks)
      },
      { key: 'lastIndexedAt', label: 'Lần lập chỉ mục', sortKey: 'lastIndexedAt', render: (row) => formatDate(row.lastIndexedAt) }
    ],
    [documentRows]
  );

  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.06rem', marginBottom: '0.2rem' }}>Kho tri thức quản trị</h2>
          <p className="muted">Quản lý nguồn, tài liệu và đồng bộ tri thức.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void onRefreshAll()}>
          Làm mới
        </button>
      </div>

      {knowledgeMessage && <p className="banner banner-success">{knowledgeMessage}</p>}
      {knowledgeError && <p className="banner banner-error">{knowledgeError}</p>}

      <form
        onSubmit={onSubmitCreate}
        style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'grid', gap: '0.65rem' }}
      >
        <h3 style={{ fontSize: '0.98rem' }}>Tạo nguồn tri thức</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Tên nguồn
            <input value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="Cẩm nang bán hàng nội bộ" />
          </label>
          <label>
            Loại nguồn
            <select
              value={formSourceType}
              onChange={(event) => setFormSourceType(event.target.value as AssistantSourceType)}
            >
              {ASSISTANT_SOURCE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi
            <select
              value={formScopeType}
              onChange={(event) => setFormScopeType(event.target.value as AssistantScopeType)}
            >
              {ASSISTANT_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {formSourceType === 'FOLDER' ? (
          <label>
            Thư mục gốc
            <input
              value={formRootPath}
              onChange={(event) => setFormRootPath(event.target.value)}
              placeholder="/data/tri-thuc/ban-hang"
            />
          </label>
        ) : (
          <label>
            URL nguồn
            <input
              value={formSourceUrl}
              onChange={(event) => setFormSourceUrl(event.target.value)}
              placeholder="https://tri-thuc.company.vn/chinh-sach"
            />
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Mức phân loại
            <select
              value={formClassification}
              onChange={(event) =>
                setFormClassification(event.target.value as (typeof CLASSIFICATION_OPTIONS)[number])
              }
            >
              {CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lịch đồng bộ (tuỳ chọn)
            <input
              value={formScheduleRule}
              onChange={(event) => setFormScheduleRule(event.target.value)}
              placeholder="0 */6 * * *"
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginTop: '1.35rem' }}>
            <input type="checkbox" checked={formIsActive} onChange={(event) => setFormIsActive(event.target.checked)} />
            <span>Kích hoạt nguồn</span>
          </label>
        </div>

        <label>
          Include patterns (mỗi dòng 1 pattern)
          <textarea
            value={formIncludePatternsText}
            onChange={(event) => setFormIncludePatternsText(event.target.value)}
            rows={3}
          />
        </label>

        <label>
          Phạm vi áp dụng (chọn nhiều)
          <select
            multiple
            size={Math.min(8, Math.max(4, scopeRefOptions.length || 4))}
            value={formSelectedScopeRefs}
            onChange={(event) =>
              setFormSelectedScopeRefs(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            disabled={loadingPickers}
          >
            {scopeRefOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset style={{ border: '1px solid #d9eadf', borderRadius: '8px', padding: '0.55rem' }}>
          <legend style={{ fontSize: '0.82rem', padding: '0 0.3rem' }}>Vai trò được phép</legend>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            {['ADMIN', 'MANAGER', 'STAFF'].map((roleKey) => (
              <label key={roleKey} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(formSelectedRoles[roleKey])}
                  onChange={(event) =>
                    setFormSelectedRoles((prev) => ({
                      ...prev,
                      [roleKey]: event.target.checked
                    }))
                  }
                />
                <span>{roleKey}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <button type="submit" className="btn btn-primary" disabled={createBusy}>
            {createBusy ? 'Đang tạo...' : 'Tạo nguồn'}
          </button>
        </div>
      </form>

      <section style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'grid', gap: '0.65rem' }}>
        <h3 style={{ fontSize: '0.98rem' }}>Danh sách nguồn tri thức</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Tìm kiếm
            <input value={sourceFilterQ} onChange={(event) => setSourceFilterQ(event.target.value)} />
          </label>
          <label>
            Loại nguồn
            <select value={sourceFilterType} onChange={(event) => setSourceFilterType(event.target.value)}>
              <option value="">Tất cả</option>
              {ASSISTANT_SOURCE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select value={sourceFilterIsActive} onChange={(event) => setSourceFilterIsActive(event.target.value)}>
              <option value="">Tất cả</option>
              <option value="true">Bật</option>
              <option value="false">Tắt</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => void loadSources()} disabled={loadingSources}>
              Lọc nguồn
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.55rem', alignItems: 'end' }}>
          <label>
            Số tệp tối đa mỗi lần đồng bộ
            <select value={String(syncMaxFiles)} onChange={(event) => setSyncMaxFiles(Number(event.target.value))}>
              {MAX_FILE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={syncDryRun} onChange={(event) => setSyncDryRun(event.target.checked)} />
            <span>Chạy thử</span>
          </label>
          <span className="muted">Bấm vào tên nguồn để đồng bộ.</span>
        </div>

        <StandardDataTable
          data={sources}
          columns={sourceColumns}
          storageKey="assistant-knowledge-sources-v1"
          isLoading={loadingSources}
          pageInfo={{
            currentPage: sourceTablePager.currentPage,
            hasPrevPage: sourceTablePager.hasPrevPage,
            hasNextPage: sourceTablePager.hasNextPage,
            visitedPages: sourceTablePager.visitedPages
          }}
          sortMeta={
            sourceSortMeta ?? {
              sortBy: sourceSortBy,
              sortDir: sourceSortDir,
              sortableFields: []
            }
          }
          onPageNext={sourceTablePager.goNextPage}
          onPagePrev={sourceTablePager.goPrevPage}
          onJumpVisitedPage={sourceTablePager.jumpVisitedPage}
          onSortChange={(sortBy, sortDir) => {
            setSourceSortBy(sortBy);
            setSourceSortDir(sortDir);
          }}
          onRowClick={(row) => void onSyncSource(row.id)}
          enableRowSelection
          selectedRowIds={selectedSourceRowIds}
          onSelectedRowIdsChange={setSelectedSourceRowIds}
          bulkActions={sourceBulkActions}
          showDefaultBulkUtilities
        />

        {syncBusySourceId && (
          <p className="banner banner-warning" style={{ margin: 0 }}>
            Đang đồng bộ nguồn `{syncBusySourceId}`...
          </p>
        )}

        {!loadingSources && sources.length === 0 && (
          <p className="banner banner-warning" style={{ margin: 0 }}>
            Chưa có nguồn nào. Tạo nguồn đầu tiên để bắt đầu đồng bộ tri thức.
          </p>
        )}
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'grid', gap: '0.65rem' }}>
        <h3 style={{ fontSize: '0.98rem' }}>Tài liệu và phân mảnh tri thức</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Tìm kiếm
            <input value={documentFilterQ} onChange={(event) => setDocumentFilterQ(event.target.value)} />
          </label>
          <label>
            Nguồn
            <select value={documentFilterSourceId} onChange={(event) => setDocumentFilterSourceId(event.target.value)}>
              <option value="">Tất cả</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi
            <select value={documentFilterScopeType} onChange={(event) => setDocumentFilterScopeType(event.target.value)}>
              <option value="">Tất cả</option>
              {ASSISTANT_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => void loadDocuments()} disabled={loadingDocuments}>
              Lọc tài liệu
            </button>
          </div>
        </div>

        <StandardDataTable
          data={documentRows}
          columns={documentColumns}
          storageKey="assistant-knowledge-documents-v1"
          isLoading={loadingDocuments}
          pageInfo={{
            currentPage: documentTablePager.currentPage,
            hasPrevPage: documentTablePager.hasPrevPage,
            hasNextPage: documentTablePager.hasNextPage,
            visitedPages: documentTablePager.visitedPages
          }}
          sortMeta={
            documentSortMeta ?? {
              sortBy: documentSortBy,
              sortDir: documentSortDir,
              sortableFields: []
            }
          }
          onPageNext={documentTablePager.goNextPage}
          onPagePrev={documentTablePager.goPrevPage}
          onJumpVisitedPage={documentTablePager.jumpVisitedPage}
          onSortChange={(sortBy, sortDir) => {
            setDocumentSortBy(sortBy);
            setDocumentSortDir(sortDir);
          }}
          enableRowSelection
          selectedRowIds={selectedDocumentRowIds}
          onSelectedRowIdsChange={setSelectedDocumentRowIds}
          showDefaultBulkUtilities
        />

        {!loadingDocuments && documentRows.length === 0 && (
          <p className="banner banner-warning" style={{ margin: 0 }}>
            Chưa có tài liệu. Hãy đồng bộ nguồn để tạo dữ liệu.
          </p>
        )}
      </section>
    </section>
  );
}
