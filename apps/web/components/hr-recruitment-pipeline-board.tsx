'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  Users,
  UserCheck,
  XCircle,
  RotateCcw,
  Calendar,
  FileText,
  Send,
  ArrowRightCircle
} from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { isStrictDateTimeLocal, isStrictIsoDate, parseFiniteNumber } from '../lib/form-validation';
import { SidePanel } from './ui/side-panel';

type RecruitmentStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'ASSESSMENT' | 'OFFER' | 'HIRED';
type RecruitmentStatus = 'ACTIVE' | 'REJECTED' | 'WITHDRAWN' | 'HIRED';
type RecruitmentSource = 'REFERRAL' | 'JOB_BOARD' | 'SOCIAL_MEDIA' | 'CAREER_SITE' | 'AGENCY' | 'CAMPUS' | 'OTHER';
type OfferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';

type PipelineCard = {
  id: string;
  stage: RecruitmentStage;
  status: RecruitmentStatus;
  recruiterId: string | null;
  stageEnteredAt: string;
  timeInStageDays: number;
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    source: RecruitmentSource;
    cvExternalUrl: string | null;
  };
  requisition: {
    id: string;
    title: string;
    department: string | null;
  };
  latestOffer: {
    id: string;
    status: OfferStatus;
  } | null;
  convertedEmployeeId: string | null;
  canConvert: boolean;
};

type PipelineColumn = {
  stage: RecruitmentStage;
  count: number;
  items: PipelineCard[];
};

type PipelineResponse = {
  stages: PipelineColumn[];
  totals: {
    all: number;
    active: number;
    rejected: number;
    withdrawn: number;
    hired: number;
  };
  filterOptions?: {
    requisitions: Array<{ id: string; title: string | null; recruiterId: string | null }>;
    recruiters: string[];
    sources: RecruitmentSource[];
  };
};

type MetricsResponse = {
  totals: {
    applications: number;
    active: number;
    rejected: number;
    withdrawn: number;
    hired: number;
  };
  conversionRates: {
    hiredRate: number;
    offerRate: number;
    interviewRate: number;
    screeningRate: number;
    assessmentRate: number;
  };
};

type ApplicationDetail = {
  id: string;
  currentStage: RecruitmentStage;
  status: RecruitmentStatus;
  canConvert: boolean;
  candidate: {
    fullName: string;
    email: string | null;
    phone: string | null;
    source: RecruitmentSource;
    cvExternalUrl: string | null;
  };
  requisition: {
    title: string;
    department: string | null;
  };
  stageHistories: Array<{
    id: string;
    actionType: string;
    fromStage: RecruitmentStage | null;
    toStage: RecruitmentStage | null;
    fromStatus: RecruitmentStatus | null;
    toStatus: RecruitmentStatus | null;
    reason: string | null;
    actorId: string | null;
    createdAt: string;
  }>;
  interviews: Array<{
    id: string;
    interviewerName: string | null;
    scheduledAt: string;
    mode: string | null;
    status: string;
    feedback: string | null;
  }>;
  offers: Array<{
    id: string;
    status: OfferStatus;
    offeredPosition: string | null;
    offeredSalary: number | string | null;
    currency: string | null;
    proposedStartDate: string | null;
    approvedAt: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    workflowInstanceId: string | null;
  }>;
};

const STAGE_META: Array<{ key: RecruitmentStage; label: string }> = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'ASSESSMENT', label: 'Assessment' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'HIRED', label: 'Hired' }
];

const SOURCE_OPTIONS: RecruitmentSource[] = ['REFERRAL', 'JOB_BOARD', 'SOCIAL_MEDIA', 'CAREER_SITE', 'AGENCY', 'CAMPUS', 'OTHER'];
const STATUS_OPTIONS: Array<'ALL' | RecruitmentStatus> = ['ALL', 'ACTIVE', 'REJECTED', 'WITHDRAWN', 'HIRED'];

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function formatMoney(value: number | string | null | undefined, currency: string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '--';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency || 'VND',
    maximumFractionDigits: 0
  }).format(numeric);
}

function parseOptionalNumberInput(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = parseFiniteNumber(normalized);
  return parsed === null ? null : parsed;
}

function statusPillClass(status: string) {
  const normalized = status.toUpperCase();
  if (['ACTIVE', 'APPROVED', 'ACCEPTED', 'HIRED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-success';
  }
  if (['PENDING', 'DRAFT', 'PENDING_APPROVAL'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-warning';
  }
  if (['REJECTED', 'WITHDRAWN', 'DECLINED', 'CANCELED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-danger';
  }
  return 'finance-status-pill finance-status-pill-neutral';
}

export function HrRecruitmentPipelineBoard() {
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RecruitmentStatus>('ACTIVE');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | RecruitmentSource>('ALL');
  const [requisitionFilter, setRequisitionFilter] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    jobTitle: '',
    candidateName: '',
    email: '',
    phone: '',
    source: 'OTHER' as RecruitmentSource,
    cvExternalUrl: ''
  });

  const [interviewForm, setInterviewForm] = useState({
    scheduledAt: '',
    interviewerName: '',
    mode: 'ONLINE'
  });

  const [offerForm, setOfferForm] = useState({
    offeredPosition: '',
    offeredSalary: '',
    currency: 'VND',
    proposedStartDate: ''
  });

  const columns = useMemo(() => {
    const map = new Map<RecruitmentStage, PipelineColumn>();
    (pipeline?.stages ?? []).forEach((column) => map.set(column.stage, column));
    return STAGE_META.map((stage) => map.get(stage.key) ?? { stage: stage.key, count: 0, items: [] });
  }, [pipeline]);

  const loadBoard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query: Record<string, string> = {
        q: keyword,
        limit: '300'
      };
      if (statusFilter !== 'ALL') query.status = statusFilter;
      if (sourceFilter !== 'ALL') query.source = sourceFilter;
      if (requisitionFilter) query.requisitionId = requisitionFilter;
      if (recruiterFilter) query.recruiterId = recruiterFilter;

      const [pipelinePayload, metricsPayload] = await Promise.all([
        apiRequest<PipelineResponse>('/hr/recruitment/pipeline', { query }),
        apiRequest<MetricsResponse>('/hr/recruitment/metrics', {
          query: {
            status: statusFilter === 'ALL' ? '' : statusFilter,
            requisitionId: requisitionFilter,
            recruiterId: recruiterFilter
          }
        })
      ]);
      setPipeline(pipelinePayload);
      setMetrics(metricsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải board tuyển dụng');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (applicationId: string) => {
    setIsDetailLoading(true);
    setError(null);
    try {
      const payload = await apiRequest<ApplicationDetail>(`/hr/recruitment/applications/${applicationId}`);
      setDetail(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải chi tiết hồ sơ');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [keyword, statusFilter, sourceFilter, requisitionFilter, recruiterFilter]);

  useEffect(() => {
    if (selectedApplicationId) {
      loadDetail(selectedApplicationId);
    }
  }, [selectedApplicationId]);

  const mutateAndReload = async (runner: () => Promise<unknown>, successText: string) => {
    setError(null);
    setNotice(null);
    try {
      await runner();
      setNotice(successText);
      await loadBoard();
      if (selectedApplicationId) {
        await loadDetail(selectedApplicationId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác thất bại');
    }
  };

  const handleDrop = async (stage: RecruitmentStage) => {
    if (!draggingCardId) {
      return;
    }
    setDraggingCardId(null);
    await mutateAndReload(
      () =>
        apiRequest(`/hr/recruitment/applications/${draggingCardId}/stage`, {
          method: 'PATCH',
          body: { toStage: stage }
        }),
      `Đã chuyển hồ sơ sang ${stage}`
    );
  };

  const handleCreateApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await mutateAndReload(
      () =>
        apiRequest('/hr/recruitment/applications', {
          method: 'POST',
          body: {
            ...createForm
          }
        }),
      'Đã tạo hồ sơ ứng tuyển mới'
    );
    setIsCreateOpen(false);
    setCreateForm({
      jobTitle: '',
      candidateName: '',
      email: '',
      phone: '',
      source: 'OTHER',
      cvExternalUrl: ''
    });
  };

  const createInterview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedApplicationId) {
      return;
    }
    if (!isStrictDateTimeLocal(interviewForm.scheduledAt)) {
      setError('Thời gian phỏng vấn không hợp lệ (YYYY-MM-DDTHH:mm).');
      return;
    }

    await mutateAndReload(
      () =>
        apiRequest('/hr/recruitment/interviews', {
          method: 'POST',
          body: {
            applicationId: selectedApplicationId,
            scheduledAt: interviewForm.scheduledAt,
            interviewerName: interviewForm.interviewerName,
            mode: interviewForm.mode
          }
        }),
      'Đã tạo lịch phỏng vấn'
    );

    setInterviewForm({ scheduledAt: '', interviewerName: '', mode: 'ONLINE' });
  };

  const createOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedApplicationId) {
      return;
    }
    const offeredSalary = parseOptionalNumberInput(offerForm.offeredSalary);
    if (offeredSalary === null || offeredSalary === undefined || offeredSalary <= 0) {
      setError('Mức lương đề xuất phải là số lớn hơn 0.');
      return;
    }
    if (offerForm.proposedStartDate && !isStrictIsoDate(offerForm.proposedStartDate)) {
      setError('Ngày bắt đầu dự kiến không hợp lệ (YYYY-MM-DD).');
      return;
    }

    await mutateAndReload(
      () =>
        apiRequest('/hr/recruitment/offers', {
          method: 'POST',
          body: {
            applicationId: selectedApplicationId,
            offeredPosition: offerForm.offeredPosition,
            offeredSalary,
            currency: offerForm.currency,
            proposedStartDate: offerForm.proposedStartDate || null
          }
        }),
      'Đã tạo offer nháp'
    );

    setOfferForm({ offeredPosition: '', offeredSalary: '', currency: 'VND', proposedStartDate: '' });
  };

  return (
    <div className="scm-board" data-testid="hr-recruitment-board">
      <div className="metrics-grid" style={{ marginBottom: '1.25rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h4 className="finance-status-title"><Users size={16} /> Tổng hồ sơ</h4>
          <p className="finance-status-value">{metrics?.totals.applications ?? 0}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <h4 className="finance-status-title"><UserCheck size={16} /> Đã tuyển</h4>
          <p className="finance-status-value finance-status-value-success">{metrics?.totals.hired ?? 0}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h4 className="finance-status-title"><Calendar size={16} /> Active</h4>
          <p className="finance-status-value finance-status-value-warning">{metrics?.totals.active ?? 0}</p>
        </div>
        <div className="finance-status-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h4 className="finance-status-title"><FileText size={16} /> Hired Rate</h4>
          <p className="finance-status-value finance-status-value-danger">{((metrics?.conversionRates.hiredRate ?? 0) * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="main-toolbar" style={{ borderBottom: 'none', marginBottom: '0.8rem', paddingBottom: 0 }}>
        <div className="toolbar-left" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ width: '260px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                data-testid="recruitment-filter-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm ứng viên hoặc vị trí"
                style={{ paddingLeft: '34px' }}
              />
            </div>
          </div>

          <select
            data-testid="recruitment-filter-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | RecruitmentStatus)}
            style={{ width: '140px' }}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select
            data-testid="recruitment-filter-source"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as 'ALL' | RecruitmentSource)}
            style={{ width: '160px' }}
          >
            <option value="ALL">ALL_SOURCE</option>
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>

          <select
            data-testid="recruitment-filter-requisition"
            value={requisitionFilter}
            onChange={(event) => setRequisitionFilter(event.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">ALL_REQUISITIONS</option>
            {(pipeline?.filterOptions?.requisitions ?? []).map((requisition) => (
              <option key={requisition.id} value={requisition.id}>{requisition.title ?? requisition.id}</option>
            ))}
          </select>

          <select
            data-testid="recruitment-filter-recruiter"
            value={recruiterFilter}
            onChange={(event) => setRecruiterFilter(event.target.value)}
            style={{ width: '160px' }}
          >
            <option value="">ALL_RECRUITERS</option>
            {(pipeline?.filterOptions?.recruiters ?? []).map((recruiter) => (
              <option key={recruiter} value={recruiter}>{recruiter}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-right">
          <button className="btn btn-ghost" data-testid="recruitment-refresh-button" onClick={() => loadBoard()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} /> Tạo hồ sơ ứng tuyển
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error" style={{ marginBottom: '0.8rem' }}>{error}</div>}
      {notice && <div className="banner banner-success" style={{ marginBottom: '0.8rem' }}>{notice}</div>}

      <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', minWidth: '1380px' }}>
          {columns.map((column) => {
            const stageMeta = STAGE_META.find((item) => item.key === column.stage);
            return (
              <section
                key={column.stage}
                data-testid={`recruitment-column-${column.stage.toLowerCase()}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(column.stage)}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  minHeight: '420px',
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr'
                }}
              >
                <header style={{ padding: '0.7rem 0.8rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.86rem' }}>{stageMeta?.label ?? column.stage}</strong>
                  <span className="finance-status-pill finance-status-pill-neutral">{column.count}</span>
                </header>

                <div style={{ padding: '0.65rem', display: 'grid', gap: '0.6rem', alignContent: 'start' }}>
                  {column.items.map((item) => (
                    <article
                      key={item.id}
                      data-testid={`recruitment-card-${item.id}`}
                      draggable={item.status === 'ACTIVE' && item.stage !== 'HIRED'}
                      onDragStart={() => setDraggingCardId(item.id)}
                      onDragEnd={() => setDraggingCardId(null)}
                      onClick={() => setSelectedApplicationId(item.id)}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.62rem',
                        background: 'var(--surface-hover)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <strong style={{ fontSize: '0.83rem' }}>{item.candidate.fullName}</strong>
                        <span className={statusPillClass(item.status)}>{item.status}</span>
                      </div>
                      <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: 0 }}>{item.requisition.title}</p>
                      <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0.25rem 0 0 0' }}>
                        {item.candidate.source} · {item.timeInStageDays} ngày
                      </p>
                    </article>
                  ))}
                  {column.items.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>Không có hồ sơ.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <SidePanel
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Tạo hồ sơ ứng tuyển"
      >
        <form className="form-grid" onSubmit={handleCreateApplication}>
          <div className="field">
            <label>Vị trí tuyển</label>
            <input
              required
              value={createForm.jobTitle}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
              placeholder="Sales Executive"
            />
          </div>
          <div className="field">
            <label>Tên ứng viên</label>
            <input
              required
              value={createForm.candidateName}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, candidateName: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Điện thoại</label>
            <input
              value={createForm.phone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          <div className="field">
            <label>Nguồn</label>
            <select
              value={createForm.source}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, source: event.target.value as RecruitmentSource }))}
            >
              {SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>CV URL ngoài</label>
            <input
              value={createForm.cvExternalUrl}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, cvExternalUrl: event.target.value }))}
              placeholder="https://..."
            />
          </div>
          <button className="btn btn-primary" type="submit">Tạo hồ sơ</button>
        </form>
      </SidePanel>

      <SidePanel
        isOpen={Boolean(selectedApplicationId)}
        onClose={() => {
          setSelectedApplicationId(null);
          setDetail(null);
        }}
        title="Chi tiết ứng tuyển"
      >
        {isDetailLoading && <p style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>Đang tải...</p>}
        {!isDetailLoading && detail && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.8rem' }}>
              <h3 style={{ fontSize: '1.06rem', margin: 0 }}>{detail.candidate.fullName}</h3>
              <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.84rem' }}>
                {detail.requisition.title} · {detail.candidate.source}
              </p>
              <p style={{ margin: '0.3rem 0 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                Email: {detail.candidate.email || '--'} · Phone: {detail.candidate.phone || '--'}
              </p>
              {detail.candidate.cvExternalUrl && (
                <a href={detail.candidate.cvExternalUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>
                  Mở CV ngoài
                </a>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  mutateAndReload(
                    () => apiRequest(`/hr/recruitment/applications/${detail.id}/status`, { method: 'PATCH', body: { status: 'REJECTED' } }),
                    'Đã chuyển trạng thái REJECTED'
                  )
                }
                disabled={detail.status !== 'ACTIVE'}
              >
                <XCircle size={14} /> Reject
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  mutateAndReload(
                    () => apiRequest(`/hr/recruitment/applications/${detail.id}/status`, { method: 'PATCH', body: { status: 'WITHDRAWN' } }),
                    'Đã chuyển trạng thái WITHDRAWN'
                  )
                }
                disabled={detail.status !== 'ACTIVE'}
              >
                <XCircle size={14} /> Withdraw
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  mutateAndReload(
                    () => apiRequest(`/hr/recruitment/applications/${detail.id}/status`, { method: 'PATCH', body: { status: 'ACTIVE' } }),
                    'Đã reopen hồ sơ về ACTIVE'
                  )
                }
                disabled={!['REJECTED', 'WITHDRAWN'].includes(detail.status)}
              >
                <RotateCcw size={14} /> Reopen
              </button>
              <button
                className="btn btn-primary"
                data-testid="recruitment-convert-button"
                onClick={() =>
                  mutateAndReload(
                    () =>
                      apiRequest(`/hr/recruitment/applications/${detail.id}/convert-to-employee`, {
                        method: 'POST',
                        body: {
                          employmentType: 'FULL_TIME'
                        }
                      }),
                    'Đã convert thành nhân sự'
                  )
                }
                disabled={!detail.canConvert}
              >
                <ArrowRightCircle size={14} /> Convert Employee
              </button>
            </div>

            <section>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>Timeline</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {detail.stageHistories.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Chưa có lịch sử.</p>}
                {detail.stageHistories.map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <strong>{item.actionType}</strong>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {item.fromStage || item.fromStatus || '--'} → {item.toStage || item.toStatus || '--'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>Lịch phỏng vấn</h4>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.7rem' }}>
                {detail.interviews.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Chưa có lịch phỏng vấn.</p>}
                {detail.interviews.map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.8rem' }}>{item.interviewerName || '--'}</strong>
                      <span className={statusPillClass(item.status)}>{item.status}</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {formatDateTime(item.scheduledAt)} · {item.mode || '--'}
                    </p>
                  </div>
                ))}
              </div>

              <form className="form-grid" onSubmit={createInterview}>
                <div className="field">
                  <label>Thời gian</label>
                  <input
                    type="datetime-local"
                    required
                    value={interviewForm.scheduledAt}
                    onChange={(event) => setInterviewForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Interviewer</label>
                  <input
                    value={interviewForm.interviewerName}
                    onChange={(event) => setInterviewForm((prev) => ({ ...prev, interviewerName: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Mode</label>
                  <select
                    value={interviewForm.mode}
                    onChange={(event) => setInterviewForm((prev) => ({ ...prev, mode: event.target.value }))}
                  >
                    <option value="ONLINE">ONLINE</option>
                    <option value="ONSITE">ONSITE</option>
                    <option value="PHONE">PHONE</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-ghost"><Calendar size={14} /> Tạo lịch</button>
              </form>
            </section>

            <section>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.6rem' }}>Offer</h4>
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.7rem' }}>
                {detail.offers.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Chưa có offer.</p>}
                {detail.offers.map((offer) => (
                  <div key={offer.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.8rem' }}>{offer.offeredPosition || 'Offer'}</strong>
                      <span className={statusPillClass(offer.status)}>{offer.status}</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {formatMoney(offer.offeredSalary, offer.currency)} · Start {formatDateTime(offer.proposedStartDate)}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {['DRAFT', 'REJECTED'].includes(offer.status) && (
                        <button
                          className="btn btn-ghost"
                          data-testid={`recruitment-offer-submit-${offer.id}`}
                          onClick={() =>
                            mutateAndReload(
                              () => apiRequest(`/hr/recruitment/offers/${offer.id}/submit-approval`, { method: 'POST', body: {} }),
                              'Đã submit offer vào workflow duyệt'
                            )
                          }
                        >
                          <Send size={14} /> Submit Approval
                        </button>
                      )}
                      {offer.status === 'APPROVED' && (
                        <button
                          className="btn btn-ghost"
                          data-testid={`recruitment-offer-accept-${offer.id}`}
                          onClick={() =>
                            mutateAndReload(
                              () => apiRequest(`/hr/recruitment/offers/${offer.id}`, { method: 'PATCH', body: { status: 'ACCEPTED' } }),
                              'Đã cập nhật ứng viên ACCEPTED offer'
                            )
                          }
                        >
                          <UserCheck size={14} /> Mark Accepted
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form className="form-grid" onSubmit={createOffer}>
                <div className="field">
                  <label>Vị trí offer</label>
                  <input
                    value={offerForm.offeredPosition}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, offeredPosition: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Lương đề nghị</label>
                  <input
                    type="number"
                    value={offerForm.offeredSalary}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, offeredSalary: event.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Ngày bắt đầu dự kiến</label>
                  <input
                    type="date"
                    value={offerForm.proposedStartDate}
                    onChange={(event) => setOfferForm((prev) => ({ ...prev, proposedStartDate: event.target.value }))}
                  />
                </div>
                <button type="submit" className="btn btn-ghost"><FileText size={14} /> Tạo offer</button>
              </form>
            </section>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
