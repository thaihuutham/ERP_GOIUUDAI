'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../lib/bulk-actions';
import { useAccessPolicy } from './access-policy-context';
import { Badge, statusToBadge } from './ui';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type ChannelFilter = ConversationChannel | 'ALL';
type ZaloPermissionLevel = 'READ' | 'CHAT' | 'ADMIN';

type ThreadEvaluationBrief = {
  id: string;
  verdict?: string | null;
  score?: number | null;
  summary?: string | null;
  evaluatedAt?: string | null;
};

type ThreadRow = {
  id: string;
  channel: ConversationChannel;
  channelAccountId?: string | null;
  externalThreadId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  unreadCount?: number | null;
  isReplied?: boolean | null;
  lastMessageAt?: string | null;
  channelAccount?: {
    id: string;
    accountType?: string | null;
    displayName?: string | null;
    zaloUid?: string | null;
    status?: string | null;
  } | null;
  customer?: {
    id?: string;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  evaluations?: ThreadEvaluationBrief[] | null;
};

type MessageRow = {
  id: string;
  senderType?: string | null;
  senderName?: string | null;
  content?: string | null;
  contentType?: string | null;
  sentAt?: string | null;
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

type ZaloAccount = {
  id: string;
  accountType?: string | null;
  displayName?: string | null;
  zaloUid?: string | null;
  status?: string | null;
  currentPermissionLevel?: ZaloPermissionLevel | null;
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
    jobType?: string | null;
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
const THREAD_LIMIT_OPTIONS = [20, 50, 100] as const;
const CHANNEL_LABELS: Record<ChannelFilter, string> = {
  ALL: 'Tất cả',
  ZALO_PERSONAL: 'Zalo cá nhân',
  ZALO_OA: 'Zalo OA',
  FACEBOOK: 'Facebook',
  OTHER: 'Kênh khác'
};

function channelLabel(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  return CHANNEL_LABELS[value as ChannelFilter] ?? value;
}

function permissionToBadge(permission: ZaloPermissionLevel | null | undefined) {
  if (permission === 'ADMIN') {
    return 'success' as const;
  }
  if (permission === 'CHAT') {
    return 'info' as const;
  }
  if (permission === 'READ') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

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

function normalizePermission(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'READ' || normalized === 'CHAT' || normalized === 'ADMIN') {
    return normalized as ZaloPermissionLevel;
  }
  return null;
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

async function copyToClipboard(value: string) {
  if (!value.trim()) {
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function CrmConversationsWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canApprove = canAction('crm', 'APPROVE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [latestEvaluation, setLatestEvaluation] = useState<EvaluationDetail | null>(null);
  const [jobs, setJobs] = useState<ConversationQualityJob[]>([]);
  const [runs, setRuns] = useState<RunListRow[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);

  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingEvaluation, setIsLoadingEvaluation] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isLoadingRunDetail, setIsLoadingRunDetail] = useState(false);

  const [threadQuery, setThreadQuery] = useState('');
  const [threadChannel, setThreadChannel] = useState<ChannelFilter>('ALL');
  const [threadAccountId, setThreadAccountId] = useState('');
  const [threadLimit, setThreadLimit] = useState<number>(50);
  const [messageQuery, setMessageQuery] = useState('');

  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedThreadIds, setSelectedThreadIds] = useState<BulkRowId[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<BulkRowId[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<BulkRowId[]>([]);
  const [sendMessageContent, setSendMessageContent] = useState('');

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

  const selectedThread = useMemo(
    () => threads.find((item) => item.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const permissionByAccountId = useMemo(() => {
    const map = new Map<string, ZaloPermissionLevel>();
    for (const account of zaloAccounts) {
      const permission = normalizePermission(account.currentPermissionLevel);
      if (permission) {
        map.set(account.id, permission);
      }
    }
    return map;
  }, [zaloAccounts]);

  const selectedThreadPermission = useMemo(() => {
    if (!selectedThread?.channelAccountId) {
      return null;
    }
    return permissionByAccountId.get(selectedThread.channelAccountId) ?? null;
  }, [permissionByAccountId, selectedThread]);

  const canSendSelectedThread = useMemo(() => {
    if (!selectedThread || !selectedThreadId || !canCreate) {
      return false;
    }
    if (selectedThread.channel !== 'ZALO_PERSONAL' && selectedThread.channel !== 'ZALO_OA') {
      return true;
    }
    if (!selectedThreadPermission) {
      return true;
    }
    return selectedThreadPermission !== 'READ';
  }, [canCreate, selectedThread, selectedThreadId, selectedThreadPermission]);

  const selectedJob = useMemo(
    () => jobs.find((item) => item.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const loadZaloAccounts = async () => {
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: { accountType: 'ALL' }
      });
      setZaloAccounts(
        (normalizeListPayload(payload) as ZaloAccount[]).map((account) => ({
          ...account,
          currentPermissionLevel: normalizePermission(account.currentPermissionLevel)
        }))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách tài khoản Zalo.');
    }
  };

  const loadThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const payload = await apiRequest<{ items?: ThreadRow[] }>('/conversations/threads', {
        query: {
          q: threadQuery || undefined,
          channel: threadChannel,
          channelAccountId: threadAccountId || undefined,
          limit: threadLimit
        }
      });

      const nextThreads = normalizeListPayload(payload) as ThreadRow[];
      setThreads(nextThreads);
      setSelectedThreadId((prev) => {
        if (prev && nextThreads.some((item) => item.id === prev)) {
          return prev;
        }
        return nextThreads[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách hội thoại.');
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    setIsLoadingMessages(true);
    try {
      const payload = await apiRequest<{ items?: MessageRow[] }>(`/conversations/threads/${threadId}/messages`, {
        query: {
          q: messageQuery || undefined,
          limit: 120
        }
      });
      setMessages(normalizeListPayload(payload) as MessageRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được tin nhắn.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const loadLatestEvaluation = async (threadId: string) => {
    setIsLoadingEvaluation(true);
    try {
      const payload = await apiRequest<LatestEvaluationPayload>(`/conversations/threads/${threadId}/evaluation/latest`);
      setLatestEvaluation(payload?.evaluation ?? null);
    } catch (error) {
      setLatestEvaluation(null);
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được kết quả chấm điểm mới nhất.');
    } finally {
      setIsLoadingEvaluation(false);
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

  const refreshAll = async () => {
    clearNotice();
    await Promise.all([loadThreads(), loadJobs(), loadZaloAccounts()]);
    if (selectedJobId) {
      await loadRuns(selectedJobId);
    }
  };

  useEffect(() => {
    if (!canView) {
      return;
    }

    void loadZaloAccounts();
    void loadThreads();
    void loadJobs();
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void loadThreads();
  }, [canView, threadQuery, threadChannel, threadAccountId, threadLimit]);

  useEffect(() => {
    if (!canView || !selectedThreadId) {
      setMessages([]);
      setLatestEvaluation(null);
      return;
    }
    void loadMessages(selectedThreadId);
    void loadLatestEvaluation(selectedThreadId);
  }, [canView, selectedThreadId, messageQuery]);

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
    const idSet = new Set(threads.map((item) => item.id));
    setSelectedThreadIds((prev) => prev.filter((id) => idSet.has(String(id))));
  }, [threads]);

  useEffect(() => {
    const idSet = new Set(jobs.map((item) => item.id));
    setSelectedJobIds((prev) => prev.filter((id) => idSet.has(String(id))));
  }, [jobs]);

  useEffect(() => {
    const idSet = new Set(runs.map((item) => item.id));
    setSelectedRunIds((prev) => prev.filter((id) => idSet.has(String(id))));
  }, [runs]);

  const onSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!selectedThread) {
      setErrorMessage('Vui lòng chọn hội thoại trước khi gửi.');
      return;
    }

    const content = sendMessageContent.trim();
    if (!content) {
      setErrorMessage('Nội dung gửi không được để trống.');
      return;
    }
    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền gửi phản hồi.');
      return;
    }
    if (!canSendSelectedThread) {
      setErrorMessage('Bạn không có quyền CHAT trên tài khoản hội thoại đã chọn.');
      return;
    }

    try {
      if (selectedThread.channel === 'ZALO_PERSONAL' && selectedThread.channelAccountId) {
        await apiRequest(`/zalo/accounts/${selectedThread.channelAccountId}/personal/messages/send`, {
          method: 'POST',
          body: {
            externalThreadId: selectedThread.externalThreadId,
            content,
            threadType: 'user'
          }
        });
      } else if (selectedThread.channel === 'ZALO_OA') {
        if (!selectedThread.channelAccountId) {
          throw new Error('Hội thoại OA chưa gắn mã tài khoản kênh nên chưa thể gửi tin.');
        }
        await apiRequest(`/zalo/accounts/${selectedThread.channelAccountId}/oa/messages/send`, {
          method: 'POST',
          body: {
            externalThreadId: selectedThread.externalThreadId,
            content
          }
        });
      } else {
        await apiRequest(`/conversations/threads/${selectedThread.id}/messages`, {
          method: 'POST',
          body: {
            senderType: 'AGENT',
            senderName: 'Staff',
            content
          }
        });
      }

      setSendMessageContent('');
      setResultMessage('Đã gửi tin nhắn thành công.');
      await Promise.all([loadMessages(selectedThread.id), loadThreads()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể gửi tin nhắn.');
    }
  };

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

      await apiRequest('/conversation-quality/jobs', {
        method: 'POST',
        body: {
          name: createJobForm.name,
          intervalMinutes: Number(createJobForm.intervalMinutes || 120),
          lookbackHours: Number(createJobForm.lookbackHours || 24),
          maxConversationsPerRun: Number(createJobForm.maxConversationsPerRun || 30),
          batchSize: Number(createJobForm.batchSize || 5),
          aiModel: createJobForm.aiModel || undefined,
          channelFilterJson: {
            channels,
            accountIds
          },
          rulesContent: createJobForm.rulesContent || undefined,
          skipConditions: createJobForm.skipConditions || undefined
        }
      });

      setResultMessage('Đã tạo lịch đánh giá AI thành công.');
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo lịch đánh giá AI.');
    }
  };

  const onRunJobNow = async (jobId: string) => {
    clearNotice();
    if (!canApprove) {
      setErrorMessage('Vai trò hiện tại không có quyền chạy lịch.');
      return;
    }

    try {
      await apiRequest(`/conversation-quality/jobs/${jobId}/run-now`, { method: 'POST' });
      setResultMessage('Đã kích hoạt chạy lịch đánh giá AI.');
      await Promise.all([loadJobs(), loadRuns(selectedJobId || jobId), loadThreads()]);
      if (selectedThreadId) {
        await loadLatestEvaluation(selectedThreadId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chạy lịch ngay.');
    }
  };

  const onBulkRunJobsNow = async () => {
    clearNotice();
    if (!canApprove) {
      setErrorMessage('Vai trò hiện tại không có quyền chạy lịch.');
      return;
    }

    const ids = selectedJobIds.map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 lịch.');
      return;
    }

    if (!window.confirm(`Chạy ngay ${ids.length} lịch đã chọn?`)) {
      return;
    }

    try {
      const result = await runBulkOperation({
        ids,
        continueOnError: true,
        chunkSize: 5,
        execute: async (jobId) => {
          await apiRequest(`/conversation-quality/jobs/${jobId}/run-now`, { method: 'POST' });
        }
      });

      const normalized: BulkExecutionResult = {
        ...result,
        actionLabel: 'Chạy ngay lịch',
        message: formatBulkSummary(
          {
            ...result,
            actionLabel: 'Chạy ngay lịch'
          },
          'Chạy ngay lịch'
        )
      };

      setResultMessage(normalized.message ?? null);
      if (normalized.failedCount > 0) {
        setErrorMessage('Một số lịch chạy ngay thất bại.');
      }

      if (normalized.successCount > 0) {
        await Promise.all([loadJobs(), loadRuns(selectedJobId || undefined), loadThreads()]);
        if (selectedThreadId) {
          await loadLatestEvaluation(selectedThreadId);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Chạy ngay hàng loạt thất bại.');
    }
  };

  const onCopySelectedIds = async (ids: BulkRowId[], label: string) => {
    const values = ids.map((id) => String(id)).filter(Boolean);
    if (values.length === 0) {
      return;
    }
    await copyToClipboard(values.join(', '));
    setResultMessage(`Đã sao chép ${values.length} ID ${label}.`);
  };

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench" data-testid="crm-conversations-workbench">
      <header className="module-header">
        <div>
          <h1>Hội thoại khách hàng CRM</h1>
            <p>Quản trị hội thoại đa kênh và kết quả đánh giá AI theo lịch.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/crm">
              Quay lại vận hành CRM
            </Link>
            <Link className="btn btn-ghost" href="/modules/zalo-automation/accounts">
              Quản lý tài khoản Zalo
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại toàn bộ
            </button>
          </div>
        </div>
        <ul>
          <li>Vận hành hội thoại theo chuẩn xử lý tập trung.</li>
          <li>Tự động đánh giá AI, nhân sự giám sát theo phân quyền.</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="crm-grid">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Danh sách hội thoại</h2>
            <Badge variant={statusToBadge('CONNECTED')}>Tổng: {threads.length}</Badge>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="conversation-thread-search">Tìm kiếm hội thoại</label>
              <input
                id="conversation-thread-search"
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Tên khách, mã hội thoại..."
              />
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-channel">Kênh</label>
              <select
                id="conversation-thread-channel"
                value={threadChannel}
                onChange={(event) => setThreadChannel(event.target.value as ChannelFilter)}
              >
                {CHANNEL_FILTER_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {channelLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-account">Tài khoản Zalo</label>
              <select
                id="conversation-thread-account"
                value={threadAccountId}
                onChange={(event) => setThreadAccountId(event.target.value)}
              >
                <option value="">Tất cả</option>
                {zaloAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName || account.zaloUid || account.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-limit">Giới hạn</label>
              <select
                id="conversation-thread-limit"
                value={String(threadLimit)}
                onChange={(event) => setThreadLimit(Number(event.target.value))}
              >
                {THREAD_LIMIT_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingThreads ? <p className="muted">Đang tải hội thoại...</p> : null}
          {!isLoadingThreads && threads.length === 0 ? <p className="muted">Chưa có hội thoại phù hợp.</p> : null}

            {threads.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="muted">Đã chọn {selectedThreadIds.length} hội thoại</span>
                <div className="action-buttons">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedThreadIds([])}
                  disabled={selectedThreadIds.length === 0}
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onCopySelectedIds(selectedThreadIds, 'hội thoại')}
                  disabled={selectedThreadIds.length === 0}
                >
                  Sao chép ID
                </button>
              </div>
            </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={threads.length > 0 && threads.every((thread) => selectedThreadIds.includes(thread.id))}
                          onChange={(event) =>
                            setSelectedThreadIds(event.target.checked ? threads.map((thread) => thread.id) : [])
                          }
                        />
                      </th>
                      <th>Khách hàng</th>
                      <th>Kênh</th>
                      <th>Quyền account</th>
                      <th>Chưa đọc</th>
                      <th>Đánh giá AI</th>
                      <th>Tin nhắn gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threads.map((thread) => {
                      const latest = thread.evaluations?.[0];
                      const accountPermission = thread.channelAccountId
                        ? permissionByAccountId.get(thread.channelAccountId) ?? null
                        : null;
                      return (
                        <tr key={thread.id} className={selectedThreadId === thread.id ? 'table-row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedThreadIds.includes(thread.id)}
                              onChange={(event) =>
                                setSelectedThreadIds((prev) => {
                                  if (event.target.checked) {
                                    return prev.includes(thread.id) ? prev : [...prev, thread.id];
                                  }
                                  return prev.filter((id) => String(id) !== thread.id);
                                })
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="record-link row-select-trigger"
                              onClick={() => setSelectedThreadId(thread.id)}
                            >
                              {thread.customerDisplayName || thread.customer?.fullName || thread.externalThreadId}
                              <span>Xem</span>
                            </button>
                          </td>
                          <td>
                            <Badge variant={statusToBadge(thread.channel)}>{channelLabel(thread.channel)}</Badge>
                          </td>
                          <td>
                            {thread.channel === 'ZALO_PERSONAL' || thread.channel === 'ZALO_OA' ? (
                              <Badge variant={permissionToBadge(accountPermission)}>{accountPermission || '--'}</Badge>
                            ) : (
                              '--'
                            )}
                          </td>
                          <td>{thread.unreadCount ?? 0}</td>
                          <td>
                            {latest ? (
                              <Badge variant={statusToBadge(latest.verdict)}>
                                {latest.verdict}
                                {latest.score !== null && latest.score !== undefined ? ` (${latest.score})` : ''}
                              </Badge>
                            ) : (
                              '--'
                            )}
                          </td>
                          <td>{toDateTime(thread.lastMessageAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Tin nhắn và đánh giá AI</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (selectedThreadId) {
                  void Promise.all([loadMessages(selectedThreadId), loadLatestEvaluation(selectedThreadId)]);
                }
              }}
              disabled={!selectedThreadId}
            >
              Tải lại
            </button>
          </div>

          <p className="muted">
            Hội thoại: {selectedThread ? `${selectedThread.externalThreadId} • ${channelLabel(selectedThread.channel)}` : '--'}
          </p>
          <p className="muted">
            Tài khoản: {selectedThread?.channelAccount?.displayName || selectedThread?.channelAccountId || '--'}
          </p>
          <p className="muted" style={{ marginTop: '0.2rem' }}>
            Quyền account:{' '}
            <Badge variant={permissionToBadge(selectedThreadPermission)}>
              {selectedThreadPermission || '--'}
            </Badge>
          </p>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="conversation-message-search">Tìm kiếm tin nhắn</label>
              <input
                id="conversation-message-search"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
                placeholder="Nội dung, người gửi..."
              />
            </div>
          </div>

          {isLoadingMessages ? <p className="muted">Đang tải tin nhắn...</p> : null}
          {!isLoadingMessages && messages.length === 0 ? <p className="muted">Chưa có tin nhắn cho hội thoại này.</p> : null}

          {messages.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người gửi</th>
                    <th>Loại</th>
                    <th>Nội dung</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((message) => (
                    <tr key={message.id}>
                      <td>{toDateTime(message.sentAt)}</td>
                      <td>{message.senderName || message.senderType || '--'}</td>
                      <td>{message.contentType || '--'}</td>
                      <td>{message.content || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="form-grid" onSubmit={onSendMessage}>
            <h3>Gửi tin nhắn</h3>
            <p className="muted">
              ZALO_PERSONAL: gửi thật qua zca-js. ZALO_OA: gửi qua OA official API khi tài khoản đã cấu hình token/url.
            </p>
            {selectedThreadPermission === 'READ' ? (
              <p className="banner banner-info" style={{ margin: 0 }}>
                Tài khoản này đang ở mức quyền READ nên chỉ được xem hội thoại, không gửi tin nhắn.
              </p>
            ) : null}
            <div className="field">
              <label htmlFor="conversation-send-content">Nội dung</label>
              <textarea
                id="conversation-send-content"
                value={sendMessageContent}
                onChange={(event) => setSendMessageContent(event.target.value)}
                placeholder="Nhập nội dung phản hồi khách hàng..."
              />
            </div>
            <div className="action-buttons">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canCreate || !canSendSelectedThread}
                data-testid="conversation-send-button"
              >
                Gửi tin nhắn
              </button>
            </div>
            {!canCreate ? <p className="muted">Vai trò hiện tại không có quyền gửi phản hồi.</p> : null}
          </form>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Kết quả AI mới nhất</h3>
              <Badge variant={statusToBadge(latestEvaluation?.verdict)}>
                {latestEvaluation?.verdict || '--'}
              </Badge>
            </div>
            {isLoadingEvaluation ? <p className="muted">Đang tải kết quả AI...</p> : null}
            {!isLoadingEvaluation && !latestEvaluation ? <p className="muted">Chưa có kết quả chấm điểm.</p> : null}
            {latestEvaluation ? (
              <>
                <div className="finance-bucket-list">
                  <div className="finance-bucket-item">
                    <span>Điểm</span>
                    <strong>{latestEvaluation.score ?? '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Mô hình</span>
                    <strong>{latestEvaluation.model || '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Nhà cung cấp</span>
                    <strong>{latestEvaluation.provider || '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Thời điểm đánh giá</span>
                    <strong>{toDateTime(latestEvaluation.evaluatedAt)}</strong>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: '0.45rem' }}>
                  Tóm tắt: {latestEvaluation.summary || '--'}
                </p>
                <p className="muted" style={{ marginTop: '0.25rem' }}>
                  Nhận xét: {latestEvaluation.review || '--'}
                </p>
                {latestEvaluation.violations && latestEvaluation.violations.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: '0.55rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mức độ</th>
                          <th>Quy tắc</th>
                          <th>Bằng chứng</th>
                          <th>Khuyến nghị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestEvaluation.violations.map((item) => (
                          <tr key={item.id}>
                            <td>{item.severity || '--'}</td>
                            <td>{item.ruleName || '--'}</td>
                            <td>{item.evidence || '--'}</td>
                            <td>{item.suggestion || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Lịch đánh giá AI và phiên chạy</h2>
            <Badge variant={statusToBadge(selectedJob?.lastRunStatus)}>{selectedJob?.lastRunStatus || '--'}</Badge>
          </div>

          {canCreate && (
            <form className="form-grid" onSubmit={onCreateJob}>
              <h3>Tạo lịch đánh giá</h3>
            <div className="field">
              <label htmlFor="qc-job-name">Tên lịch</label>
              <input
                id="qc-job-name"
                required
                value={createJobForm.name}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-interval">Chu kỳ chạy (phút)</label>
              <input
                id="qc-job-interval"
                type="number"
                min={1}
                value={createJobForm.intervalMinutes}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, intervalMinutes: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-lookback">Khoảng quét dữ liệu (giờ)</label>
              <input
                id="qc-job-lookback"
                type="number"
                min={1}
                value={createJobForm.lookbackHours}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, lookbackHours: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-max-threads">Số hội thoại tối đa mỗi phiên</label>
              <input
                id="qc-job-max-threads"
                type="number"
                min={1}
                value={createJobForm.maxConversationsPerRun}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, maxConversationsPerRun: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-batch-size">Kích thước lô xử lý</label>
              <input
                id="qc-job-batch-size"
                type="number"
                min={1}
                value={createJobForm.batchSize}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, batchSize: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-model">Mô hình AI (tuỳ chọn)</label>
              <input
                id="qc-job-model"
                value={createJobForm.aiModel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, aiModel: event.target.value }))}
                placeholder="gpt-4o-mini hoặc model 9router"
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-channel">Bộ lọc kênh</label>
              <select
                id="qc-job-channel"
                value={createJobForm.channel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, channel: event.target.value as ChannelFilter }))}
              >
                {CHANNEL_FILTER_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {channelLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qc-job-account-ids">ID tài khoản (dấu phẩy, tuỳ chọn)</label>
              <input
                id="qc-job-account-ids"
                value={createJobForm.accountIds}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, accountIds: event.target.value }))}
                placeholder="id_1,id_2"
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-rules">Bộ quy tắc đánh giá (tuỳ chọn)</label>
              <textarea
                id="qc-job-rules"
                value={createJobForm.rulesContent}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, rulesContent: event.target.value }))}
                placeholder="Danh sách quy tắc chấm điểm..."
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-skip">Điều kiện bỏ qua (tuỳ chọn)</label>
              <textarea
                id="qc-job-skip"
                value={createJobForm.skipConditions}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, skipConditions: event.target.value }))}
                placeholder="Điều kiện bỏ qua..."
              />
            </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary">
                  Tạo lịch
                </button>
              </div>
            </form>
          )}

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Danh sách lịch đánh giá</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadJobs()}>
                Tải lại danh sách
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="muted">Đã chọn {selectedJobIds.length} lịch</span>
              <div className="action-buttons">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedJobIds([])}
                  disabled={selectedJobIds.length === 0}
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onCopySelectedIds(selectedJobIds, 'lịch')}
                  disabled={selectedJobIds.length === 0}
                >
                  Sao chép ID
                </button>
                {canApprove && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onBulkRunJobsNow()}
                    disabled={selectedJobIds.length === 0}
                  >
                    Chạy ngay mục đã chọn
                  </button>
                )}
              </div>
            </div>
            {isLoadingJobs ? <p className="muted">Đang tải lịch đánh giá...</p> : null}
            {!isLoadingJobs && jobs.length === 0 ? <p className="muted">Chưa có lịch đánh giá nào.</p> : null}

            {jobs.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.id))}
                          onChange={(event) => setSelectedJobIds(event.target.checked ? jobs.map((job) => job.id) : [])}
                        />
                      </th>
                      <th>Tên lịch</th>
                      <th>Chu kỳ</th>
                      <th>Trạng thái gần nhất</th>
                      <th>Lần chạy kế tiếp</th>
                      {canApprove && <th>Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id} className={selectedJobId === job.id ? 'table-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(job.id)}
                            onChange={(event) =>
                              setSelectedJobIds((prev) => {
                                if (event.target.checked) {
                                  return prev.includes(job.id) ? prev : [...prev, job.id];
                                }
                                return prev.filter((id) => String(id) !== job.id);
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="record-link row-select-trigger"
                            onClick={() => setSelectedJobId(job.id)}
                          >
                            {job.name}
                            <span>Xem</span>
                          </button>
                        </td>
                        <td>{job.intervalMinutes ?? '--'} phút</td>
                        <td>
                          <Badge variant={statusToBadge(job.lastRunStatus)}>
                            {job.lastRunStatus || '--'}
                          </Badge>
                        </td>
                        <td>{toDateTime(job.nextRunAt)}</td>
                        {canApprove && (
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              data-testid={`run-now-${job.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void onRunJobNow(job.id);
                              }}
                            >
                              Chạy ngay
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Phiên chạy ({selectedJob ? selectedJob.name : 'TẤT CẢ'})</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadRuns(selectedJobId || undefined)}>
                Tải lại phiên chạy
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="muted">Đã chọn {selectedRunIds.length} phiên</span>
              <div className="action-buttons">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedRunIds([])}
                  disabled={selectedRunIds.length === 0}
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void onCopySelectedIds(selectedRunIds, 'phiên')}
                  disabled={selectedRunIds.length === 0}
                >
                  Sao chép ID
                </button>
              </div>
            </div>
            {isLoadingRuns ? <p className="muted">Đang tải phiên chạy...</p> : null}
            {!isLoadingRuns && runs.length === 0 ? <p className="muted">Chưa có phiên chạy.</p> : null}

            {runs.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={runs.length > 0 && runs.every((run) => selectedRunIds.includes(run.id))}
                          onChange={(event) => setSelectedRunIds(event.target.checked ? runs.map((run) => run.id) : [])}
                        />
                      </th>
                      <th>Bắt đầu</th>
                      <th>Trạng thái</th>
                      <th>Đã chấm</th>
                      <th>Lỗi</th>
                      <th>Vi phạm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className={selectedRunId === run.id ? 'table-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedRunIds.includes(run.id)}
                            onChange={(event) =>
                              setSelectedRunIds((prev) => {
                                if (event.target.checked) {
                                  return prev.includes(run.id) ? prev : [...prev, run.id];
                                }
                                return prev.filter((id) => String(id) !== run.id);
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="record-link row-select-trigger"
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            {toDateTime(run.startedAt)}
                            <span>Xem</span>
                          </button>
                        </td>
                        <td>
                          <Badge variant={statusToBadge(run.status)}>
                            {run.status || '--'}
                          </Badge>
                        </td>
                        <td data-testid={`run-evaluated-${run.id}`}>
                          {readSummaryCounter(run.summaryJson, 'evaluatedCount')}
                        </td>
                        <td>{readSummaryCounter(run.summaryJson, 'failedCount')}</td>
                        <td>{readSummaryCounter(run.summaryJson, 'totalViolationCount')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="crm-panel-head" style={{ marginTop: '0.5rem' }}>
              <h3>Chi tiết phiên chạy</h3>
              <Badge variant={statusToBadge(runDetail?.status)}>{runDetail?.status || '--'}</Badge>
            </div>
            {isLoadingRunDetail ? <p className="muted">Đang tải chi tiết phiên chạy...</p> : null}
            {!isLoadingRunDetail && !runDetail ? <p className="muted">Chọn 1 phiên để xem chi tiết.</p> : null}
            {runDetail ? (
              <>
                <p className="muted">Bắt đầu: {toDateTime(runDetail.startedAt)}</p>
                <p className="muted">Kết thúc: {toDateTime(runDetail.finishedAt)}</p>
                {runDetail.errorMessage ? <p className="banner banner-error">{runDetail.errorMessage}</p> : null}
                <div className="finance-bucket-list" style={{ marginTop: '0.45rem' }}>
                  <div className="finance-bucket-item">
                    <span>Tổng hội thoại</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'totalThreads')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Đã chấm</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'evaluatedCount')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Bỏ qua</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'skippedCount')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Vi phạm</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'totalViolationCount')}</strong>
                  </div>
                </div>
                {runDetail.evaluations && runDetail.evaluations.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Hội thoại</th>
                          <th>Kết luận</th>
                          <th>Điểm</th>
                          <th>Vi phạm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runDetail.evaluations.slice(0, 50).map((item) => (
                          <tr key={item.id}>
                            <td>{item.thread?.customerDisplayName || item.thread?.externalThreadId || '--'}</td>
                            <td>
                              <Badge variant={statusToBadge(item.verdict)}>{item.verdict || '--'}</Badge>
                            </td>
                            <td>{item.score ?? '--'}</td>
                            <td>{item.violations?.length ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">Phiên chạy này chưa có bản ghi đánh giá.</p>
                )}
              </>
            ) : null}
          </section>
        </section>
      </section>
    </article>
  );
}
