'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { canAccessModule } from '../lib/rbac';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type ChannelFilter = ConversationChannel | 'ALL';

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

function statusClass(status: string | null | undefined) {
  const normalized = String(status ?? '').toUpperCase();
  switch (normalized) {
    case 'PASS':
    case 'SUCCESS':
    case 'CONNECTED':
      return 'finance-status-pill finance-status-pill-success';
    case 'RUNNING':
    case 'PENDING':
    case 'SCHEDULED':
    case 'SKIP':
      return 'finance-status-pill finance-status-pill-warning';
    case 'FAIL':
    case 'ERROR':
    case 'DISCONNECTED':
      return 'finance-status-pill finance-status-pill-danger';
    default:
      return 'finance-status-pill finance-status-pill-neutral';
  }
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

export function CrmConversationsWorkbench() {
  const { role } = useUserRole();
  const canView = canAccessModule(role, 'crm');
  const canMutate = role === 'MANAGER' || role === 'ADMIN';

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
  const [sendMessageContent, setSendMessageContent] = useState('');

  const [createJobForm, setCreateJobForm] = useState<CreateJobForm>({
    name: 'QC Zalo định kỳ',
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
      setZaloAccounts(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách Zalo account.');
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

      const nextThreads = Array.isArray(payload?.items) ? payload.items : [];
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
      setMessages(Array.isArray(payload?.items) ? payload.items : []);
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
      const rows = Array.isArray(payload) ? payload : [];
      setJobs(rows);
      setSelectedJobId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách job AI.');
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
      const rows = Array.isArray(payload) ? payload : [];
      setRuns(rows);
      setSelectedRunId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách run.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được chi tiết run.');
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
          throw new Error('Hội thoại OA chưa gắn channelAccountId nên chưa thể gửi outbound.');
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
    if (!canMutate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo job.');
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

      setResultMessage('Đã tạo job AI thành công.');
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo job AI.');
    }
  };

  const onRunJobNow = async (jobId: string) => {
    clearNotice();
    if (!canMutate) {
      setErrorMessage('Vai trò hiện tại không có quyền chạy job.');
      return;
    }

    try {
      await apiRequest(`/conversation-quality/jobs/${jobId}/run-now`, { method: 'POST' });
      setResultMessage('Đã trigger chạy job AI.');
      await Promise.all([loadJobs(), loadRuns(selectedJobId || jobId), loadThreads()]);
      if (selectedThreadId) {
        await loadLatestEvaluation(selectedThreadId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể chạy job ngay.');
    }
  };

  if (!canView) {
    return (
      <article className="module-workbench">
        <header className="module-header">
          <div>
            <h1>CRM Conversations Inbox</h1>
            <p>Bạn không có quyền truy cập phân hệ CRM với vai trò hiện tại.</p>
          </div>
          <ul>
            <li>Vai trò hiện tại: {role}</li>
            <li>Đổi role ở toolbar để mô phỏng quyền.</li>
          </ul>
        </header>
      </article>
    );
  }

  return (
    <article className="module-workbench" data-testid="crm-conversations-workbench">
      <header className="module-header">
        <div>
          <h1>CRM Conversations Inbox</h1>
          <p>Hộp hội thoại Zalo tích hợp ERP, theo dõi thread/message và kết quả AI chấm điểm theo lịch.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/crm">
              Quay lại CRM Operations
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại toàn bộ
            </button>
          </div>
        </div>
        <ul>
          <li>Ưu tiên Zalo personal, vẫn theo dõi OA ingest.</li>
          <li>Hiển thị QC verdict/score ngay trên từng hội thoại.</li>
          <li>Job batch AI: tạo lịch, chạy tay, xem lịch sử run.</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}
      {!canMutate ? <p className="banner banner-warning">Vai trò `{role}` chỉ có quyền xem trong module này.</p> : null}

      <section className="crm-grid">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Threads</h2>
            <span className={statusClass('CONNECTED')}>Total: {threads.length}</span>
          </div>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="conversation-thread-search">Tìm kiếm hội thoại</label>
              <input
                id="conversation-thread-search"
                value={threadQuery}
                onChange={(event) => setThreadQuery(event.target.value)}
                placeholder="Tên khách, external thread..."
              />
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-channel">Channel</label>
              <select
                id="conversation-thread-channel"
                value={threadChannel}
                onChange={(event) => setThreadChannel(event.target.value as ChannelFilter)}
              >
                {CHANNEL_FILTER_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-account">Zalo account</label>
              <select
                id="conversation-thread-account"
                value={threadAccountId}
                onChange={(event) => setThreadAccountId(event.target.value)}
              >
                <option value="">ALL</option>
                {zaloAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName || account.zaloUid || account.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="conversation-thread-limit">Limit</label>
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
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Channel</th>
                    <th>Unread</th>
                    <th>QC</th>
                    <th>Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {threads.map((thread) => {
                    const latest = thread.evaluations?.[0];
                    return (
                      <tr key={thread.id} className={selectedThreadId === thread.id ? 'table-row-selected' : ''}>
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
                          <span className={statusClass(thread.channel)}>
                            {thread.channel}
                          </span>
                        </td>
                        <td>{thread.unreadCount ?? 0}</td>
                        <td>
                          {latest ? (
                            <span className={statusClass(latest.verdict)}>
                              {latest.verdict}
                              {latest.score !== null && latest.score !== undefined ? ` (${latest.score})` : ''}
                            </span>
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
          ) : null}
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Messages & Evaluation</h2>
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
            Thread: {selectedThread ? `${selectedThread.externalThreadId} • ${selectedThread.channel}` : '--'}
          </p>
          <p className="muted">
            Account: {selectedThread?.channelAccount?.displayName || selectedThread?.channelAccountId || '--'}
          </p>

          <div className="filter-grid">
            <div className="field">
              <label htmlFor="conversation-message-search">Tìm kiếm message</label>
              <input
                id="conversation-message-search"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
                placeholder="Nội dung, sender..."
              />
            </div>
          </div>

          {isLoadingMessages ? <p className="muted">Đang tải tin nhắn...</p> : null}
          {!isLoadingMessages && messages.length === 0 ? <p className="muted">Chưa có message cho hội thoại này.</p> : null}

          {messages.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Sender</th>
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
                disabled={!canMutate || !selectedThreadId}
                data-testid="conversation-send-button"
              >
                Gửi tin nhắn
              </button>
            </div>
          </form>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Kết quả AI mới nhất</h3>
              <span className={statusClass(latestEvaluation?.verdict)}>
                {latestEvaluation?.verdict || '--'}
              </span>
            </div>
            {isLoadingEvaluation ? <p className="muted">Đang tải kết quả AI...</p> : null}
            {!isLoadingEvaluation && !latestEvaluation ? <p className="muted">Chưa có kết quả chấm điểm.</p> : null}
            {latestEvaluation ? (
              <>
                <div className="finance-bucket-list">
                  <div className="finance-bucket-item">
                    <span>Score</span>
                    <strong>{latestEvaluation.score ?? '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Model</span>
                    <strong>{latestEvaluation.model || '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Provider</span>
                    <strong>{latestEvaluation.provider || '--'}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Evaluated at</span>
                    <strong>{toDateTime(latestEvaluation.evaluatedAt)}</strong>
                  </div>
                </div>
                <p className="muted" style={{ marginTop: '0.45rem' }}>
                  Summary: {latestEvaluation.summary || '--'}
                </p>
                <p className="muted" style={{ marginTop: '0.25rem' }}>
                  Review: {latestEvaluation.review || '--'}
                </p>
                {latestEvaluation.violations && latestEvaluation.violations.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: '0.55rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Severity</th>
                          <th>Rule</th>
                          <th>Evidence</th>
                          <th>Suggestion</th>
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
            <h2>AI QC Jobs & Runs</h2>
            <span className={statusClass(selectedJob?.lastRunStatus)}>{selectedJob?.lastRunStatus || '--'}</span>
          </div>

          <form className="form-grid" onSubmit={onCreateJob}>
            <h3>Tạo job chấm điểm</h3>
            <div className="field">
              <label htmlFor="qc-job-name">Tên job</label>
              <input
                id="qc-job-name"
                required
                value={createJobForm.name}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-interval">Interval (phút)</label>
              <input
                id="qc-job-interval"
                type="number"
                min={1}
                value={createJobForm.intervalMinutes}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, intervalMinutes: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-lookback">Lookback (giờ)</label>
              <input
                id="qc-job-lookback"
                type="number"
                min={1}
                value={createJobForm.lookbackHours}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, lookbackHours: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-max-threads">Max threads/run</label>
              <input
                id="qc-job-max-threads"
                type="number"
                min={1}
                value={createJobForm.maxConversationsPerRun}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, maxConversationsPerRun: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-batch-size">Batch size</label>
              <input
                id="qc-job-batch-size"
                type="number"
                min={1}
                value={createJobForm.batchSize}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, batchSize: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-model">AI model (optional)</label>
              <input
                id="qc-job-model"
                value={createJobForm.aiModel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, aiModel: event.target.value }))}
                placeholder="gpt-4o-mini hoặc model 9router"
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-channel">Channel filter</label>
              <select
                id="qc-job-channel"
                value={createJobForm.channel}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, channel: event.target.value as ChannelFilter }))}
              >
                {CHANNEL_FILTER_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qc-job-account-ids">Account IDs (comma, optional)</label>
              <input
                id="qc-job-account-ids"
                value={createJobForm.accountIds}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, accountIds: event.target.value }))}
                placeholder="id_1,id_2"
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-rules">Rules content (optional)</label>
              <textarea
                id="qc-job-rules"
                value={createJobForm.rulesContent}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, rulesContent: event.target.value }))}
                placeholder="Rule checklist cho AI QC..."
              />
            </div>
            <div className="field">
              <label htmlFor="qc-job-skip">Skip conditions (optional)</label>
              <textarea
                id="qc-job-skip"
                value={createJobForm.skipConditions}
                onChange={(event) => setCreateJobForm((prev) => ({ ...prev, skipConditions: event.target.value }))}
                placeholder="Điều kiện bỏ qua..."
              />
            </div>
            <div className="action-buttons">
              <button type="submit" className="btn btn-primary" disabled={!canMutate}>
                Tạo job
              </button>
            </div>
          </form>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Danh sách jobs</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadJobs()}>
                Tải lại jobs
              </button>
            </div>
            {isLoadingJobs ? <p className="muted">Đang tải jobs...</p> : null}
            {!isLoadingJobs && jobs.length === 0 ? <p className="muted">Chưa có job nào.</p> : null}

            {jobs.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Interval</th>
                      <th>Last status</th>
                      <th>Next run</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id} className={selectedJobId === job.id ? 'table-row-selected' : ''}>
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
                          <span className={statusClass(job.lastRunStatus)}>
                            {job.lastRunStatus || '--'}
                          </span>
                        </td>
                        <td>{toDateTime(job.nextRunAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={!canMutate}
                            data-testid={`run-now-${job.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onRunJobNow(job.id);
                            }}
                          >
                            Run now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel-surface">
            <div className="crm-panel-head">
              <h3>Runs ({selectedJob ? selectedJob.name : 'ALL'})</h3>
              <button type="button" className="btn btn-ghost" onClick={() => void loadRuns(selectedJobId || undefined)}>
                Tải lại runs
              </button>
            </div>
            {isLoadingRuns ? <p className="muted">Đang tải runs...</p> : null}
            {!isLoadingRuns && runs.length === 0 ? <p className="muted">Chưa có run.</p> : null}

            {runs.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Status</th>
                      <th>Evaluated</th>
                      <th>Failed</th>
                      <th>Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className={selectedRunId === run.id ? 'table-row-selected' : ''}>
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
                          <span className={statusClass(run.status)}>
                            {run.status || '--'}
                          </span>
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
              <h3>Run detail</h3>
              <span className={statusClass(runDetail?.status)}>{runDetail?.status || '--'}</span>
            </div>
            {isLoadingRunDetail ? <p className="muted">Đang tải run detail...</p> : null}
            {!isLoadingRunDetail && !runDetail ? <p className="muted">Chọn 1 run để xem chi tiết.</p> : null}
            {runDetail ? (
              <>
                <p className="muted">Started: {toDateTime(runDetail.startedAt)}</p>
                <p className="muted">Finished: {toDateTime(runDetail.finishedAt)}</p>
                {runDetail.errorMessage ? <p className="banner banner-error">{runDetail.errorMessage}</p> : null}
                <div className="finance-bucket-list" style={{ marginTop: '0.45rem' }}>
                  <div className="finance-bucket-item">
                    <span>Total threads</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'totalThreads')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Evaluated</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'evaluatedCount')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Skipped</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'skippedCount')}</strong>
                  </div>
                  <div className="finance-bucket-item">
                    <span>Violations</span>
                    <strong>{readSummaryCounter(runDetail.summaryJson, 'totalViolationCount')}</strong>
                  </div>
                </div>
                {runDetail.evaluations && runDetail.evaluations.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Thread</th>
                          <th>Verdict</th>
                          <th>Score</th>
                          <th>Violations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runDetail.evaluations.slice(0, 50).map((item) => (
                          <tr key={item.id}>
                            <td>{item.thread?.customerDisplayName || item.thread?.externalThreadId || '--'}</td>
                            <td>
                              <span className={statusClass(item.verdict)}>{item.verdict || '--'}</span>
                            </td>
                            <td>{item.score ?? '--'}</td>
                            <td>{item.violations?.length ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">Run này chưa có evaluation record.</p>
                )}
              </>
            ) : null}
          </section>
        </section>
      </section>
    </article>
  );
}
