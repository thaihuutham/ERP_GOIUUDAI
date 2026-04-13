'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { parseFiniteNumber } from '../lib/form-validation';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkRowId } from '../lib/bulk-actions';
import { useAccessPolicy } from './access-policy-context';
import { Badge, statusToBadge } from './ui';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type ChannelFilter = ConversationChannel | 'ALL';

type ThreadRow = {
  id: string;
  channel: ConversationChannel;
  channelAccountId?: string | null;
  externalThreadId: string;
  customerDisplayName?: string | null;
};

type Violation = {
  id: string;
  severity?: string | null;
  ruleName?: string | null;
  evidence?: string | null;
  explanation?: string | null;
  suggestion?: string | null;
  confidence?: number | null;
};

type EvaluationDetail = {
  id: string;
  verdict?: string | null;
  score?: number | null;
  summary?: string | null;
  review?: string | null;
  evaluatedAt?: string | null;
  model?: string | null;
  provider?: string | null;
  violations?: Violation[] | null;
};

type LatestEvaluationPayload = {
  evaluation?: EvaluationDetail | null;
};

type ConversationQualityJob = {
  id: string;
  name: string;
  isActive?: boolean;
  intervalMinutes?: number;
  lookbackHours?: number;
  maxConversationsPerRun?: number;
  batchSize?: number;
  aiModel?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  nextRunAt?: string | null;
};

type RunListRow = {
  id: string;
  jobId: string;
  status?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  summaryJson?: unknown;
  errorMessage?: string | null;
  job?: {
    id: string;
    name: string;
  } | null;
};

type RunDetailEvaluation = {
  id: string;
  verdict?: string | null;
  score?: number | null;
  summary?: string | null;
  evaluatedAt?: string | null;
  thread?: {
    id?: string;
    channel?: string | null;
    externalThreadId?: string | null;
    customerDisplayName?: string | null;
  } | null;
  violations?: Violation[] | null;
};

type RunDetail = {
  id: string;
  status?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  summaryJson?: unknown;
  errorMessage?: string | null;
  evaluations?: RunDetailEvaluation[] | null;
};

type CreateJobForm = {
  name: string;
  intervalMinutes: string;
  lookbackHours: string;
  maxConversationsPerRun: string;
  batchSize: string;
  aiModel: string;
  channel: ChannelFilter;
  accountIds: string;
  rulesContent: string;
  skipConditions: string;
};

const CHANNEL_FILTER_OPTIONS: ChannelFilter[] = ['ALL', 'ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'OTHER'];
const CHANNEL_LABELS: Record<ChannelFilter, string> = {
  ALL: 'Tất cả',
  ZALO_PERSONAL: 'Zalo cá nhân',
  ZALO_OA: 'Zalo OA',
  FACEBOOK: 'Facebook',
  OTHER: 'Kênh khác'
};

function toDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function parseCommaSeparatedIds(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function parsePositiveIntInput(raw: string, fallback: number) {
  const parsed = parseFiniteNumber(raw);
  if (parsed === null || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function readSummaryCounter(summaryJson: unknown, key: string) {
  if (!summaryJson || typeof summaryJson !== 'object' || Array.isArray(summaryJson)) {
    return '--';
  }
  const value = (summaryJson as Record<string, unknown>)[key];
  if (value === null || value === undefined) {
    return '--';
  }
  return String(value);
}

function channelLabel(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  return CHANNEL_LABELS[value as ChannelFilter] ?? value;
}

export function ZaloAutomationAiRunsWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canApprove = canAction('crm', 'APPROVE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [jobs, setJobs] = useState<ConversationQualityJob[]>([]);
  const [runs, setRuns] = useState<RunListRow[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);

  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isLoadingRunDetail, setIsLoadingRunDetail] = useState(false);
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [threads, setThreads] = useState<ThreadRow[]>([]);

  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedJobIds, setSelectedJobIds] = useState<BulkRowId[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<BulkRowId[]>([]);
  const [threadLookupId, setThreadLookupId] = useState('');
  const [threadLookupEvaluation, setThreadLookupEvaluation] = useState<EvaluationDetail | null>(null);

  const [createJobForm, setCreateJobForm] = useState<CreateJobForm>({
    name: 'Đánh giá Zalo định kỳ',
    intervalMinutes: '120',
    lookbackHours: '24',
    maxConversationsPerRun: '30',
    batchSize: '5',
    aiModel: '',
    channel: 'ALL',
    accountIds: '',
    rulesContent: '',
    skipConditions: ''
  });

  const selectedJob = useMemo(
    () => jobs.find((item) => item.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const loadThreads = async () => {
    try {
      const payload = await apiRequest<{ items?: ThreadRow[] }>('/conversations/threads', {
        query: {
          channel: 'ALL',
          limit: 120
        }
      });
      const rows = normalizeListPayload(payload) as ThreadRow[];
      setThreads(rows);
      setThreadLookupId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch {
      setThreads([]);
    }
  };

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const payload = await apiRequest<ConversationQualityJob[]>('/conversation-quality/jobs');
      const rows = normalizeListPayload(payload) as ConversationQualityJob[];
      setJobs(rows);
      setSelectedJobId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách lịch đánh giá AI.');
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const loadRuns = async (jobId?: string) => {
    setIsLoadingRuns(true);
    try {
      const payload = await apiRequest<RunListRow[]>('/conversation-quality/runs', {
        query: {
          jobId: jobId || undefined
        }
      });
      const rows = normalizeListPayload(payload) as RunListRow[];
      setRuns(rows);
      setSelectedRunId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách phiên chạy.');
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const loadRunDetail = async (runId: string) => {
    setIsLoadingRunDetail(true);
    try {
      const payload = await apiRequest<RunDetail>(`/conversation-quality/runs/${runId}`);
      setRunDetail(payload ?? null);
    } catch (error) {
      setRunDetail(null);
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được chi tiết phiên chạy.');
    } finally {
      setIsLoadingRunDetail(false);
    }
  };

  const loadThreadLookupEvaluation = async (threadId: string) => {
    if (!threadId) {
      setThreadLookupEvaluation(null);
      return;
    }
    setIsLoadingLookup(true);
    try {
      const payload = await apiRequest<LatestEvaluationPayload>(`/conversations/threads/${threadId}/evaluation/latest`);
      setThreadLookupEvaluation(payload?.evaluation ?? null);
    } catch (error) {
      setThreadLookupEvaluation(null);
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được kết quả đánh giá cho hội thoại đã chọn.');
    } finally {
      setIsLoadingLookup(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadJobs();
    void loadThreads();
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadRuns(selectedJobId || undefined);
  }, [canView, selectedJobId]);

  useEffect(() => {
    if (!canView || !selectedRunId) {
      setRunDetail(null);
      return;
    }
    void loadRunDetail(selectedRunId);
  }, [canView, selectedRunId]);

  useEffect(() => {
    const idSet = new Set(jobs.map((item) => item.id));
    setSelectedJobIds((prev) => prev.filter((id) => idSet.has(String(id))));
  }, [jobs]);

  useEffect(() => {
    const idSet = new Set(runs.map((item) => item.id));
    setSelectedRunIds((prev) => prev.filter((id) => idSet.has(String(id))));
  }, [runs]);

  const onCreateJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo lịch đánh giá.');
      return;
    }

    try {
      const channels = createJobForm.channel === 'ALL' ? [] : [createJobForm.channel];
      const accountIds = parseCommaSeparatedIds(createJobForm.accountIds);
      const intervalMinutes = parsePositiveIntInput(createJobForm.intervalMinutes, 120);
      const lookbackHours = parsePositiveIntInput(createJobForm.lookbackHours, 24);
      const maxConversationsPerRun = parsePositiveIntInput(createJobForm.maxConversationsPerRun, 30);
      const batchSize = parsePositiveIntInput(createJobForm.batchSize, 5);

      await apiRequest('/conversation-quality/jobs', {
        method: 'POST',
        body: {
          name: createJobForm.name,
          intervalMinutes,
          lookbackHours,
          maxConversationsPerRun,
          batchSize,
          aiModel: createJobForm.aiModel.trim() || undefined,
          channelFilter: channels.length > 0 ? channels : undefined,
          channelAccountIds: accountIds.length > 0 ? accountIds : undefined,
          rulesContent: createJobForm.rulesContent.trim() || undefined,
          skipConditions: createJobForm.skipConditions.trim() || undefined
        }
      });

      setResultMessage('Đã tạo lịch đánh giá AI mới.');
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo lịch đánh giá AI.');
    }
  };

  const onRunNow = async (jobId: string) => {
    clearNotice();
    if (!canApprove) {
      setErrorMessage('Vai trò hiện tại không có quyền trigger chạy lịch.');
      return;
    }
    try {
      await apiRequest(`/conversation-quality/jobs/${jobId}/run-now`, {
        method: 'POST'
      });
      setResultMessage('Đã kích hoạt chạy lịch đánh giá AI.');
      await loadRuns(selectedJobId || undefined);
      if (selectedRunId) {
        await loadRunDetail(selectedRunId);
      }
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chạy lịch đánh giá AI.');
    }
  };

  const onBulkRunNow = async () => {
    clearNotice();
    if (!canApprove) {
      setErrorMessage('Vai trò hiện tại không có quyền trigger chạy lịch.');
      return;
    }
    if (selectedJobIds.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một lịch để chạy.');
      return;
    }

    const confirmed = window.confirm(`Chạy ngay ${selectedJobIds.length} lịch đã chọn?`);
    if (!confirmed) {
      return;
    }

    const execution = await runBulkOperation({
      ids: selectedJobIds,
      execute: async (id) => {
        await apiRequest(`/conversation-quality/jobs/${id}/run-now`, {
          method: 'POST'
        });
      }
    });

    if (execution.failedCount > 0) {
      setErrorMessage(formatBulkSummary(execution, 'đã xảy ra lỗi khi chạy lịch'));
    } else {
      setResultMessage(formatBulkSummary(execution, 'đã chạy thành công'));
    }

    await Promise.all([loadJobs(), loadRuns(selectedJobId || undefined)]);
  };

  const toggleSelected = (id: string, selected: BulkRowId[], setter: (next: BulkRowId[]) => void) => {
    if (selected.includes(id)) {
      setter(selected.filter((item) => item !== id));
      return;
    }
    setter([...selected, id]);
  };

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench" data-testid="zalo-automation-ai-runs-workbench">
      <header className="module-header">
        <div>
          <h1>AI đánh giá & Phiên chạy</h1>
          <p>Trang vận hành độc lập cho lịch QC AI, chạy thủ công, xem run detail và tra cứu kết quả theo thread.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/zalo-automation/messages">
              Mở trang Tin nhắn
            </Link>
            <Link className="btn btn-ghost" href="/modules/zalo-automation/accounts">
              Quản lý tài khoản Zalo
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void Promise.all([loadJobs(), loadRuns(selectedJobId || undefined), loadThreads()])}>
              Tải lại
            </button>
          </div>
        </div>
        <ul>
          <li>Giữ nguyên API `conversation-quality` hiện có, chỉ tách UI/container riêng.</li>
          <li>Hỗ trợ chạy ngay 1 job hoặc bulk nhiều job cùng lúc.</li>
          <li>Có tra cứu hội thoại để kiểm tra kết quả đánh giá gần nhất theo thread.</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="crm-grid">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Tạo lịch đánh giá</h2>
            <Badge variant={statusToBadge('active')}>Jobs: {jobs.length}</Badge>
          </div>

          <form className="form-grid" onSubmit={onCreateJob}>
            <div className="field">
              <label htmlFor="ai-job-name">Tên lịch</label>
              <input
                id="ai-job-name"
                value={createJobForm.name}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Đánh giá Zalo định kỳ"
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-interval">Chu kỳ chạy (phút)</label>
              <input
                id="ai-job-interval"
                type="number"
                min={15}
                value={createJobForm.intervalMinutes}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, intervalMinutes: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-lookback">Khoảng quét dữ liệu (giờ)</label>
              <input
                id="ai-job-lookback"
                type="number"
                min={1}
                value={createJobForm.lookbackHours}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, lookbackHours: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-max">Số hội thoại tối đa mỗi phiên</label>
              <input
                id="ai-job-max"
                type="number"
                min={1}
                value={createJobForm.maxConversationsPerRun}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, maxConversationsPerRun: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-batch">Kích thước lô xử lý</label>
              <input
                id="ai-job-batch"
                type="number"
                min={1}
                value={createJobForm.batchSize}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, batchSize: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-model">Mô hình AI</label>
              <input
                id="ai-job-model"
                value={createJobForm.aiModel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, aiModel: event.target.value }))}
                placeholder="gpt-4o-mini hoặc router"
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-channel">Bộ lọc kênh</label>
              <select
                id="ai-job-channel"
                value={createJobForm.channel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, channel: event.target.value as ChannelFilter }))}
              >
                {CHANNEL_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {channelLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ai-job-accounts">ID tài khoản (dấu phẩy)</label>
              <input
                id="ai-job-accounts"
                value={createJobForm.accountIds}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, accountIds: event.target.value }))}
                placeholder="id_1,id_2"
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-rules">Bộ quy tắc đánh giá</label>
              <textarea
                id="ai-job-rules"
                value={createJobForm.rulesContent}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, rulesContent: event.target.value }))}
                placeholder="Danh sách quy tắc chấm điểm..."
              />
            </div>
            <div className="field">
              <label htmlFor="ai-job-skip">Điều kiện bỏ qua</label>
              <textarea
                id="ai-job-skip"
                value={createJobForm.skipConditions}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, skipConditions: event.target.value }))}
                placeholder="Điều kiện bỏ qua..."
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canCreate}>
                Tạo lịch
              </button>
            </div>
          </form>
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Danh sách lịch đánh giá</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadJobs()}>
              Tải lại
            </button>
          </div>

          {isLoadingJobs ? <p className="muted">Đang tải lịch...</p> : null}
          {!isLoadingJobs && jobs.length === 0 ? <p className="muted">Chưa có lịch đánh giá nào.</p> : null}

          {jobs.length > 0 ? (
            <>
              {selectedJobIds.length > 0 ? (
                <div className="crm-customer-bulk-row">
                  <p>Đã chọn {selectedJobIds.length} lịch</p>
                  <div className="action-buttons">
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedJobIds([])}>
                      Bỏ chọn
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void onBulkRunNow()} disabled={!canApprove}>
                      Chạy ngay mục đã chọn
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Tên lịch</th>
                      <th>Chu kỳ</th>
                      <th>Trạng thái gần nhất</th>
                      <th>Run gần nhất</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const selected = selectedJobIds.includes(job.id);
                      const active = job.id === selectedJobId;
                      return (
                        <tr key={job.id} className={active ? 'table-row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelected(job.id, selectedJobIds, setSelectedJobIds)}
                            />
                          </td>
                          <td>
                            <button type="button" className="record-link row-select-trigger" onClick={() => setSelectedJobId(job.id)}>
                              {job.name}
                              <span>Chọn</span>
                            </button>
                          </td>
                          <td>{job.intervalMinutes ?? '--'} phút</td>
                          <td>
                            <Badge variant={statusToBadge(job.lastRunStatus)}>{job.lastRunStatus || '--'}</Badge>
                          </td>
                          <td>{toDateTime(job.lastRunAt)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void onRunNow(job.id)}
                              disabled={!canApprove}
                              data-testid={`run-now-${job.id}`}
                            >
                              Chạy ngay
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Phiên chạy & tra cứu hội thoại</h2>
            <button type="button" className="btn btn-ghost" onClick={() => void loadRuns(selectedJobId || undefined)}>
              Tải lại runs
            </button>
          </div>

          <p className="muted">Job đang chọn: {selectedJob?.name || '--'}</p>
          {isLoadingRuns ? <p className="muted">Đang tải danh sách phiên chạy...</p> : null}
          {!isLoadingRuns && runs.length === 0 ? <p className="muted">Chưa có phiên chạy.</p> : null}

          {runs.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th />
                    <th>Run ID</th>
                    <th>Trạng thái</th>
                    <th>Bắt đầu</th>
                    <th>Kết thúc</th>
                    <th>Evaluated</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const selected = selectedRunIds.includes(run.id);
                    const active = run.id === selectedRunId;
                    return (
                      <tr key={run.id} className={active ? 'table-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelected(run.id, selectedRunIds, setSelectedRunIds)}
                          />
                        </td>
                        <td>
                          <button type="button" className="record-link row-select-trigger" onClick={() => setSelectedRunId(run.id)}>
                            {run.id}
                            <span>Chi tiết</span>
                          </button>
                        </td>
                        <td>
                          <Badge variant={statusToBadge(run.status)}>{run.status || '--'}</Badge>
                        </td>
                        <td>{toDateTime(run.startedAt)}</td>
                        <td>{toDateTime(run.finishedAt)}</td>
                        <td data-testid={`run-evaluated-${run.id}`}>{readSummaryCounter(run.summaryJson, 'evaluatedCount')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {selectedRunId ? (
            <div className="panel-surface">
              <div className="crm-panel-head">
                <h3>Chi tiết phiên chạy</h3>
                <Badge variant={statusToBadge(runDetail?.status)}>{runDetail?.status || '--'}</Badge>
              </div>
              {isLoadingRunDetail ? <p className="muted">Đang tải chi tiết run...</p> : null}
              {!isLoadingRunDetail && runDetail ? (
                <div className="form-grid">
                  <p className="muted">Bắt đầu: {toDateTime(runDetail.startedAt)}</p>
                  <p className="muted">Kết thúc: {toDateTime(runDetail.finishedAt)}</p>
                  <p className="muted">Tổng thread: {readSummaryCounter(runDetail.summaryJson, 'totalThreads')}</p>
                  <p className="muted">Evaluated: {readSummaryCounter(runDetail.summaryJson, 'evaluatedCount')}</p>
                  <p className="muted">Skipped: {readSummaryCounter(runDetail.summaryJson, 'skippedCount')}</p>
                  <p className="muted">Vi phạm: {readSummaryCounter(runDetail.summaryJson, 'totalViolationCount')}</p>

                  {runDetail.evaluations && runDetail.evaluations.length > 0 ? (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Hội thoại</th>
                            <th>Kết luận</th>
                            <th>Điểm</th>
                            <th>Tóm tắt</th>
                            <th>Số vi phạm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runDetail.evaluations.map((evaluation) => (
                            <tr key={evaluation.id}>
                              <td>
                                {evaluation.thread?.customerDisplayName || evaluation.thread?.externalThreadId || evaluation.thread?.id || '--'}
                              </td>
                              <td>
                                <Badge variant={statusToBadge(evaluation.verdict)}>{evaluation.verdict || '--'}</Badge>
                              </td>
                              <td>{evaluation.score ?? '--'}</td>
                              <td>{evaluation.summary || '--'}</td>
                              <td>{evaluation.violations?.length ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">Run chưa ghi nhận evaluation chi tiết.</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="panel-surface">
            <div className="crm-panel-head">
              <h3>Tra cứu đánh giá theo hội thoại</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadThreads()}>
                Làm mới danh sách hội thoại
              </button>
            </div>
            <div className="field">
              <label htmlFor="thread-lookup-id">Hội thoại</label>
              <select
                id="thread-lookup-id"
                value={threadLookupId}
                onChange={(event) => setThreadLookupId(event.target.value)}
              >
                <option value="">-- Chọn hội thoại --</option>
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.customerDisplayName || thread.externalThreadId} ({channelLabel(thread.channel)})
                  </option>
                ))}
              </select>
            </div>
            <div className="action-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void loadThreadLookupEvaluation(threadLookupId)}
                disabled={!threadLookupId}
              >
                Xem đánh giá mới nhất
              </button>
            </div>
            {isLoadingLookup ? <p className="muted">Đang tải dữ liệu đánh giá...</p> : null}
            {!isLoadingLookup && threadLookupEvaluation ? (
              <div className="form-grid">
                <p className="muted">Kết luận: {threadLookupEvaluation.verdict || '--'}</p>
                <p className="muted">Điểm: {threadLookupEvaluation.score ?? '--'}</p>
                <p className="muted">Model: {threadLookupEvaluation.model || '--'}</p>
                <p className="muted">Provider: {threadLookupEvaluation.provider || '--'}</p>
                <p className="muted">Thời gian: {toDateTime(threadLookupEvaluation.evaluatedAt)}</p>
                <p>{threadLookupEvaluation.summary || '--'}</p>
              </div>
            ) : null}
            {!isLoadingLookup && threadLookupId && !threadLookupEvaluation ? (
              <p className="muted">Hội thoại chưa có kết quả đánh giá.</p>
            ) : null}
          </div>
        </section>
      </section>
    </article>
  );
}
