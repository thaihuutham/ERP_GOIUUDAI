'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ASSISTANT_REPORT_PACKS,
  ASSISTANT_RUN_TYPES,
  assistantApi,
  type AssistantDispatchAttempt,
  type AssistantReportArtifact,
  type AssistantReportRun,
  type AssistantRunType
} from '../../lib/assistant-api';
import { formatRuntimeDateTime } from '../../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../../lib/bulk-actions';
import { useUserRole } from '../user-role-context';
import { SidePanel } from '../ui/side-panel';
import { StandardDataTable, type ColumnDefinition, type StandardTableBulkAction } from '../ui/standard-data-table';
import { Badge, statusToBadge } from '../ui/badge';

type GenericStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DRAFT';

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function artifactDispatchAttempts(artifacts: AssistantReportArtifact[] = []) {
  return artifacts.flatMap((artifact) =>
    (artifact.dispatchAttempts ?? []).map((attempt) => ({
      ...attempt,
      artifactType: artifact.artifactType
    }))
  );
}



export function AssistantRunsBoard() {
  const { role } = useUserRole();
  const canApproveOrReject = role === 'MANAGER' || role === 'ADMIN';

  const [runs, setRuns] = useState<AssistantReportRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [runTypeFilter, setRunTypeFilter] = useState('');
  const [limitFilter, setLimitFilter] = useState(50);

  const [createRunType, setCreateRunType] = useState<AssistantRunType>('MANUAL');
  const [createDispatchChat, setCreateDispatchChat] = useState(true);
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({
    sales: true,
    cskh: true,
    hr: false,
    workflow: false,
    finance: false
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedRun, setSelectedRun] = useState<AssistantReportRun | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [selectedRunError, setSelectedRunError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

  const loadRuns = async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const payload = await assistantApi.listRuns({
        status: statusFilter || undefined,
        runType: (runTypeFilter || undefined) as AssistantRunType | undefined,
        limit: limitFilter
      });
      setRuns(payload.items ?? []);
    } catch (error) {
      setRuns([]);
      setRunsError(error instanceof Error ? error.message : 'Không thể tải danh sách phiên chạy.');
    } finally {
      setRunsLoading(false);
    }
  };

  const openRun = async (runId: string) => {
    setSelectedRunLoading(true);
    setSelectedRunError(null);
    setDecisionNote('');
    try {
      const run = await assistantApi.getRun(runId);
      setSelectedRun(run);
    } catch (error) {
      setSelectedRun(null);
      setSelectedRunError(error instanceof Error ? error.message : 'Không thể tải chi tiết phiên chạy.');
    } finally {
      setSelectedRunLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, [statusFilter, runTypeFilter, limitFilter]);

  const onCreateRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusy) {
      return;
    }

    const reportPacks = ASSISTANT_REPORT_PACKS.filter((pack) => selectedPacks[pack]);
    if (reportPacks.length === 0) {
      setCreateError('Cần chọn ít nhất 1 gói báo cáo trước khi chạy.');
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    setCreateMessage(null);
    try {
      const response = await assistantApi.createRun({
        runType: createRunType,
        reportPacks,
        dispatchChat: createDispatchChat
      });
      setCreateMessage(
        `Tạo phiên chạy thành công (${response.runId}). Artifact chat: ${response.artifacts.chatArtifactId ?? 'không tạo'}.`
      );
      await loadRuns();
      await openRun(response.runId);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Không thể tạo phiên chạy.');
    } finally {
      setCreateBusy(false);
    }
  };

  const onDecision = async (decision: 'approve' | 'reject') => {
    if (!selectedRun || !canApproveOrReject || decisionBusy) {
      return;
    }

    setDecisionBusy(true);
    setSelectedRunError(null);
    try {
      const updated =
        decision === 'approve'
          ? await assistantApi.approveRun(selectedRun.id, { note: decisionNote.trim() || undefined })
          : await assistantApi.rejectRun(selectedRun.id, { note: decisionNote.trim() || undefined });
      setSelectedRun(updated);
      await loadRuns();
    } catch (error) {
      setSelectedRunError(error instanceof Error ? error.message : `Không thể xử lý phiên chạy (${decision}).`);
    } finally {
      setDecisionBusy(false);
    }
  };

  const runColumns = useMemo<ColumnDefinition<AssistantReportRun>[]>(
    () => [
      { key: 'createdAt', label: 'Tạo lúc', render: (row) => formatDateTime(row.createdAt), isLink: true },
      { key: 'runType', label: 'Loại phiên', render: (row) => row.runType },
      { key: 'status', label: 'Trạng thái', render: (row) => <Badge variant={statusToBadge(row.status)}>{row.status}</Badge> },
      {
        key: 'reportPacksJson',
        label: 'Gói báo cáo',
        render: (row) => (Array.isArray(row.reportPacksJson) ? row.reportPacksJson.join(', ') : '--')
      },
      { key: 'requestedBy', label: 'Người yêu cầu', render: (row) => row.requestedBy },
      { key: 'artifacts', label: 'Tệp đầu ra', render: (row) => String(row.artifacts?.length ?? 0) }
    ],
    []
  );

  const dispatchAttemptRows = useMemo(
    () => artifactDispatchAttempts(selectedRun?.artifacts),
    [selectedRun?.artifacts]
  );

  const runBulkDecision = async (
    actionLabel: string,
    selectedRows: AssistantReportRun[],
    execute: (run: AssistantReportRun) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    if (selectedRows.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel,
        message: `${actionLabel}: không có phiên chạy nào được chọn.`
      };
    }

    const rowsById = new Map<string, AssistantReportRun>();
    selectedRows.forEach((row) => rowsById.set(row.id, row));

    const result = await runBulkOperation({
      ids: selectedRows.map((row) => row.id),
      continueOnError: true,
      chunkSize: 10,
      execute: async (runId) => {
        const row = rowsById.get(String(runId));
        if (!row) {
          throw new Error(`Không tìm thấy phiên chạy ${runId}.`);
        }
        await execute(row);
      }
    });

    const normalized: BulkExecutionResult = {
      ...result,
      actionLabel,
      message: formatBulkSummary(
        {
          ...result,
          actionLabel
        },
        actionLabel
      )
    };
    if (normalized.successCount > 0) {
      await loadRuns();
    }
    if (selectedRun && normalized.successCount > 0) {
      await openRun(selectedRun.id);
    }
    if (normalized.failedCount > 0) {
      setRunsError(`Một số phiên chạy lỗi khi thực hiện "${actionLabel}".`);
    } else {
      setRunsError(null);
    }
    return normalized;
  };

  const bulkActions: StandardTableBulkAction<AssistantReportRun>[] = canApproveOrReject
    ? [
        {
          key: 'bulk-approve-runs',
          label: 'Phê duyệt',
          tone: 'primary',
          execute: async (selectedRows) =>
            runBulkDecision('Phê duyệt phiên chạy', selectedRows, async (run) => {
              if (String(run.status || '').toUpperCase() !== 'PENDING') {
                throw new Error(`Phiên chạy ${run.id} không ở trạng thái PENDING.`);
              }
              await assistantApi.approveRun(run.id, { note: decisionNote.trim() || undefined });
            })
        },
        {
          key: 'bulk-reject-runs',
          label: 'Từ chối',
          tone: 'danger',
          confirmMessage: (rows) => `Từ chối ${rows.length} phiên chạy đã chọn?`,
          execute: async (selectedRows) =>
            runBulkDecision('Từ chối phiên chạy', selectedRows, async (run) => {
              if (String(run.status || '').toUpperCase() !== 'PENDING') {
                throw new Error(`Phiên chạy ${run.id} không ở trạng thái PENDING.`);
              }
              await assistantApi.rejectRun(run.id, { note: decisionNote.trim() || undefined });
            })
        }
      ]
    : [];

  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '0.9rem' }}>
        <form
          onSubmit={onCreateRun}
          style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.8rem', display: 'grid', gap: '0.6rem' }}
        >
          <div>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>Tạo phiên chạy mới</h2>
            <p className="muted">Thiết lập nhanh phiên tổng hợp báo cáo AI.</p>
          </div>

          <label>
            Loại phiên chạy
            <select value={createRunType} onChange={(event) => setCreateRunType(event.target.value as AssistantRunType)}>
              {ASSISTANT_RUN_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: '1px solid #d9eadf', borderRadius: '8px', padding: '0.6rem' }}>
            <legend style={{ fontSize: '0.82rem', padding: '0 0.3rem' }}>Gói báo cáo</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.4rem' }}>
              {ASSISTANT_REPORT_PACKS.map((pack) => (
                <label key={pack} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPacks[pack])}
                    onChange={(event) =>
                      setSelectedPacks((prev) => ({
                        ...prev,
                        [pack]: event.target.checked
                      }))
                    }
                  />
                  <span>{pack}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={createDispatchChat}
              onChange={(event) => setCreateDispatchChat(event.target.checked)}
            />
            <span>Gửi ngay artifact chat sau khi tạo phiên</span>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={createBusy}>
              {createBusy ? 'Đang tạo...' : 'Tạo phiên'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void loadRuns()} disabled={runsLoading}>
              Làm mới danh sách
            </button>
          </div>

          {createMessage && <p className="banner banner-success">{createMessage}</p>}
          {createError && <p className="banner banner-error">{createError}</p>}
        </form>

        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.8rem', display: 'grid', gap: '0.6rem' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>Bộ lọc phiên chạy</h2>
            <p className="muted">Lọc theo trạng thái và loại phiên để theo dõi nhanh.</p>
          </div>
          <label>
            Trạng thái
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tất cả</option>
              {(['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE', 'ARCHIVED', 'DRAFT'] as GenericStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                )
              )}
            </select>
          </label>
          <label>
            Loại phiên chạy
            <select value={runTypeFilter} onChange={(event) => setRunTypeFilter(event.target.value)}>
              <option value="">Tất cả</option>
              {ASSISTANT_RUN_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Giới hạn
            <select value={String(limitFilter)} onChange={(event) => setLimitFilter(Number(event.target.value))}>
              {[20, 50, 100, 200].map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Nhấn vào một dòng để xem chi tiết tệp đầu ra và lịch sử gửi kênh.</p>
        </div>
      </div>

      {runsError && <p className="banner banner-error">{runsError}</p>}

      <div>
        <StandardDataTable
          data={runs}
          columns={runColumns}
          storageKey="assistant-runs-table-v1"
          isLoading={runsLoading}
          onRowClick={(row) => void openRun(row.id)}
          enableRowSelection
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          bulkActions={bulkActions}
          showDefaultBulkUtilities
        />
        {!runsLoading && runs.length === 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <p className="banner banner-warning" style={{ marginBottom: '0.5rem' }}>
              Chưa có phiên chạy nào. Hãy tạo phiên đầu tiên để bắt đầu.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' })}>
              Tạo phiên ngay
            </button>
          </div>
        )}
      </div>

      <SidePanel
        isOpen={Boolean(selectedRun) || Boolean(selectedRunError)}
        onClose={() => {
          setSelectedRun(null);
          setSelectedRunError(null);
          setDecisionNote('');
        }}
        title="Chi tiết phiên chạy"
      >
        {selectedRunLoading && <p className="muted">Đang tải chi tiết phiên chạy...</p>}
        {selectedRunError && <p className="banner banner-error">{selectedRunError}</p>}
        {selectedRun && (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <dl className="kv-grid">
              <div className="kv-item">
                <dt>ID phiên chạy</dt>
                <dd>{selectedRun.id}</dd>
              </div>
              <div className="kv-item">
                <dt>Loại phiên</dt>
                <dd>{selectedRun.runType}</dd>
              </div>
              <div className="kv-item">
                <dt>Trạng thái</dt>
                <dd>{selectedRun.status}</dd>
              </div>
              <div className="kv-item">
                <dt>Tạo lúc</dt>
                <dd>{formatDateTime(selectedRun.createdAt)}</dd>
              </div>
            </dl>

            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>Tệp đầu ra</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Loại</th>
                      <th>Trạng thái</th>
                      <th>Kênh</th>
                      <th>Thời điểm gửi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRun.artifacts ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="standard-table-empty-row">
                          Phiên chạy chưa có tệp đầu ra.
                        </td>
                      </tr>
                    ) : (
                      (selectedRun.artifacts ?? []).map((artifact) => (
                        <tr key={artifact.id}>
                          <td>{artifact.artifactType}</td>
                          <td><Badge variant={statusToBadge(artifact.status)}>{artifact.status}</Badge></td>
                          <td>{artifact.channelId ?? '--'}</td>
                          <td>{formatDateTime(artifact.publishedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>Lịch sử gửi kênh</h3>
              {dispatchAttemptRows.length === 0 ? (
                <p className="banner banner-warning" style={{ margin: 0 }}>
                  Chưa có lần gửi nào. Nếu artifact chat chưa gửi được, hãy kiểm tra lại phạm vi kênh phân phối.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Artifact</th>
                        <th>Kênh</th>
                        <th>Lần gửi</th>
                        <th>Trạng thái</th>
                        <th>Thời điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchAttemptRows.map((attempt: AssistantDispatchAttempt & { artifactType: string }) => (
                        <tr key={attempt.id}>
                          <td>{attempt.artifactType}</td>
                          <td>{attempt.channelId}</td>
                          <td>#{attempt.attemptNo}</td>
                          <td><Badge variant={statusToBadge(attempt.status)}>{attempt.status}</Badge></td>
                          <td>{formatDateTime(attempt.dispatchedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(selectedRun.artifacts ?? []).map((artifact) => (
              <details key={`content-${artifact.id}`} style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.6rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Nội dung `{artifact.artifactType}` • {artifact.id}
                </summary>
                <pre
                  style={{
                    marginTop: '0.6rem',
                    maxHeight: '220px',
                    overflow: 'auto',
                    padding: '0.6rem',
                    borderRadius: '8px',
                    background: '#f8faf8',
                    border: '1px solid #e0e8e2',
                    fontSize: '0.78rem'
                  }}
                >
                  {JSON.stringify(artifact.contentJson ?? {}, null, 2)}
                </pre>
              </details>
            ))}

            {canApproveOrReject && (
              <div style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.7rem', display: 'grid', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Duyệt phiên chạy</h3>
                <label>
                  Ghi chú
                  <textarea
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    placeholder="Lý do phê duyệt / từ chối"
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={decisionBusy}
                    onClick={() => void onDecision('approve')}
                  >
                    {decisionBusy ? 'Đang xử lý...' : 'Phê duyệt'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={decisionBusy}
                    onClick={() => void onDecision('reject')}
                  >
                    {decisionBusy ? 'Đang xử lý...' : 'Từ chối'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ margin: 0 }}>
              <span>Trạng thái hiện tại: </span>
              <Badge variant={statusToBadge(selectedRun.status)}>{selectedRun.status}</Badge>
            </div>
          </div>
        )}
      </SidePanel>
    </section>
  );
}
