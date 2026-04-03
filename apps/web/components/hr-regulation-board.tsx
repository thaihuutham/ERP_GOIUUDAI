'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Gauge, LifeBuoy, RefreshCw, Send, Wand2, XCircle } from 'lucide-react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';

type RegulationTab = 'appendix' | 'scores' | 'pip';
type GenericRow = Record<string, unknown> & { id?: string };

type AppendixCreateForm = {
  appendixCode: string;
  employeeId: string;
  workDate: string;
  period: string;
  summary: string;
  result: string;
  taskCount: string;
  complianceNote: string;
  qualityNote: string;
  note: string;
  evidenceType: 'LINK' | 'FILE';
  evidenceValue: string;
  evidenceNote: string;
};

type RevisionForm = {
  adjustmentType: string;
  beforeValue: string;
  afterValue: string;
  reasonNote: string;
};

type PipCreateForm = {
  employeeId: string;
  triggerReason: string;
  targetMonthlyScore: string;
  recoveryWindowDays: string;
  mandatoryAppendixCodes: string[];
  coachingCheckinWeekly: boolean;
  roleGroup: string;
  missingLogCount30d: string;
  baselineNote: string;
};

const APPENDIX_CODES = ['PL01', 'PL02', 'PL03', 'PL04', 'PL05', 'PL06', 'PL10'];

function statusPillClass(status: unknown) {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (['ACTIVE', 'APPROVED', 'OPEN', 'FINAL', 'SENT'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-success';
  }
  if (['PENDING', 'DRAFT', 'SUBMITTED', 'PROVISIONAL', 'RETRY'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-warning';
  }
  if (['REJECTED', 'FAILED', 'INACTIVE', 'CLOSED', 'ARCHIVED'].includes(normalized)) {
    return 'finance-status-pill finance-status-pill-danger';
  }
  return 'finance-status-pill finance-status-pill-neutral';
}

function formatDateTime(value: unknown) {
  if (!value) return '--';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function toSafeString(value: unknown) {
  return String(value ?? '').trim();
}

function toNullableNumber(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFlexibleValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return numeric;
  }
  return trimmed;
}

function createDefaultRevisionForm(): RevisionForm {
  return {
    adjustmentType: 'T_PLUS_ONE_CORRECTION',
    beforeValue: '',
    afterValue: '',
    reasonNote: ''
  };
}

export function HrRegulationBoard() {
  const [activeTab, setActiveTab] = useState<RegulationTab>('appendix');
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [actionActorId, setActionActorId] = useState('manager_1');
  const [appendixFilter, setAppendixFilter] = useState({
    appendixCode: '',
    employeeId: '',
    status: ''
  });
  const [scoreFilter, setScoreFilter] = useState({
    employeeId: '',
    status: ''
  });
  const [pipFilter, setPipFilter] = useState({
    employeeId: '',
    status: ''
  });

  const [appendixForm, setAppendixForm] = useState<AppendixCreateForm>({
    appendixCode: 'PL01',
    employeeId: '',
    workDate: '',
    period: '',
    summary: '',
    result: '',
    taskCount: '',
    complianceNote: '',
    qualityNote: '',
    note: '',
    evidenceType: 'LINK',
    evidenceValue: '',
    evidenceNote: ''
  });
  const [revisionFormBySubmission, setRevisionFormBySubmission] = useState<Record<string, RevisionForm>>({});

  const [pipForm, setPipForm] = useState<PipCreateForm>({
    employeeId: '',
    triggerReason: 'manual',
    targetMonthlyScore: '75',
    recoveryWindowDays: '60',
    mandatoryAppendixCodes: ['PL01', 'PL02'],
    coachingCheckinWeekly: true,
    roleGroup: '',
    missingLogCount30d: '',
    baselineNote: ''
  });

  const [templates, setTemplates] = useState<GenericRow[]>([]);
  const [submissions, setSubmissions] = useState<GenericRow[]>([]);
  const [dailyScores, setDailyScores] = useState<GenericRow[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<GenericRow[]>([]);
  const [pipCases, setPipCases] = useState<GenericRow[]>([]);

  const activeTabTitle = useMemo(() => {
    if (activeTab === 'appendix') return 'Biểu mẫu PL';
    if (activeTab === 'scores') return 'Điểm ngày';
    return 'PIP';
  }, [activeTab]);

  const loadAppendixTab = async () => {
    const [templatePayload, submissionPayload] = await Promise.all([
      apiRequest('/hr/appendix/templates', {
        query: { limit: 50, appendixCode: appendixFilter.appendixCode || undefined }
      }),
      apiRequest('/hr/appendix/submissions', {
        query: {
          limit: 200,
          appendixCode: appendixFilter.appendixCode || undefined,
          employeeId: appendixFilter.employeeId || undefined,
          status: appendixFilter.status || undefined
        }
      })
    ]);
    setTemplates(normalizeListPayload(templatePayload));
    setSubmissions(normalizeListPayload(submissionPayload));
  };

  const loadScoresTab = async () => {
    const [scorePayload, roleTemplatePayload] = await Promise.all([
      apiRequest('/hr/performance/daily-scores', {
        query: {
          limit: 200,
          employeeId: scoreFilter.employeeId || undefined,
          status: scoreFilter.status || undefined
        }
      }),
      apiRequest('/hr/performance/role-templates', { query: { limit: 50 } })
    ]);
    setDailyScores(normalizeListPayload(scorePayload));
    setRoleTemplates(normalizeListPayload(roleTemplatePayload));
  };

  const loadPipTab = async () => {
    const payload = await apiRequest('/hr/pip/cases', {
      query: {
        limit: 200,
        employeeId: pipFilter.employeeId || undefined,
        status: pipFilter.status || undefined
      }
    });
    setPipCases(normalizeListPayload(payload));
  };

  const loadActiveTab = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'appendix') {
        await loadAppendixTab();
      } else if (activeTab === 'scores') {
        await loadScoresTab();
      } else {
        await loadPipTab();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu Quy chế 2026.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadActiveTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleCreateSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const evidences = appendixForm.evidenceValue.trim()
        ? [{
            evidenceType: appendixForm.evidenceType,
            url: appendixForm.evidenceType === 'LINK' ? appendixForm.evidenceValue.trim() : undefined,
            objectKey: appendixForm.evidenceType === 'FILE' ? appendixForm.evidenceValue.trim() : undefined,
            note: appendixForm.evidenceNote.trim() || undefined
          }]
        : [];

      await apiRequest('/hr/appendix/submissions', {
        method: 'POST',
        body: {
          appendixCode: appendixForm.appendixCode,
          employeeId: appendixForm.employeeId.trim(),
          workDate: appendixForm.workDate || undefined,
          period: appendixForm.period.trim() || undefined,
          payload: {
            summary: appendixForm.summary.trim() || null,
            result: appendixForm.result.trim() || null,
            taskCount: toNullableNumber(appendixForm.taskCount),
            complianceNote: appendixForm.complianceNote.trim() || null,
            qualityNote: appendixForm.qualityNote.trim() || null,
            note: appendixForm.note.trim() || null
          },
          evidences,
          actorId: actionActorId.trim() || undefined
        }
      });

      setNotice('Đã tạo submission phụ lục.');
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo submission thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runSubmissionAction = async (submissionId: string, action: 'submit' | 'approve' | 'reject') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint =
        action === 'submit'
          ? `/hr/appendix/submissions/${submissionId}/submit`
          : action === 'approve'
            ? `/hr/appendix/submissions/${submissionId}/approve`
            : `/hr/appendix/submissions/${submissionId}/reject`;
      const body =
        action === 'submit'
          ? { actorId: actionActorId.trim() || undefined }
          : {
              approverId: actionActorId.trim() || undefined,
              note: action === 'reject' ? 'Rejected by manager' : 'Approved by manager'
            };

      await apiRequest(endpoint, { method: 'POST', body });
      setNotice(`Đã ${action === 'submit' ? 'submit' : action === 'approve' ? 'duyệt' : 'từ chối'} submission.`);
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác submission thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const createRevision = async (submissionId: string) => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const form = revisionFormBySubmission[submissionId] ?? createDefaultRevisionForm();
      const reasonNote = toSafeString(form.reasonNote) || 'T+1 correction';
      await apiRequest(`/hr/appendix/submissions/${submissionId}/revisions`, {
        method: 'POST',
        body: {
          actorId: actionActorId.trim() || undefined,
          requestedBy: actionActorId.trim() || undefined,
          reason: reasonNote,
          payload: {
            adjustmentType: toSafeString(form.adjustmentType) || 'T_PLUS_ONE_CORRECTION',
            beforeValue: toFlexibleValue(form.beforeValue),
            afterValue: toFlexibleValue(form.afterValue),
            reasonNote
          }
        }
      });
      setNotice('Đã tạo revision T+1 chờ duyệt.');
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo revision thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const actRevision = async (revisionId: string, action: 'approve' | 'reject') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/hr/appendix/revisions/${revisionId}/${action}`, {
        method: 'POST',
        body: {
          approverId: actionActorId.trim() || undefined,
          note: action === 'approve' ? 'Approved revision' : 'Rejected revision'
        }
      });
      setNotice(`Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} revision.`);
      await loadAppendixTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác revision thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runScoreAction = async (action: 'recompute' | 'reconcile') => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint =
        action === 'recompute'
          ? '/hr/performance/daily-scores/recompute'
          : '/hr/performance/daily-scores/reconcile/run';
      await apiRequest(endpoint, {
        method: 'POST',
        body: {
          actorId: actionActorId.trim() || undefined,
          triggeredBy: actionActorId.trim() || 'manual-ops',
          employeeId: scoreFilter.employeeId || undefined,
          status: scoreFilter.status || undefined,
          limit: 200
        }
      });
      setNotice(action === 'recompute' ? 'Đã chạy recompute điểm ngày.' : 'Đã chạy reconcile điểm ngày.');
      await loadScoresTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không chạy được tác vụ điểm ngày.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreatePipCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/hr/pip/cases', {
        method: 'POST',
        body: {
          employeeId: pipForm.employeeId.trim(),
          triggerReason: pipForm.triggerReason.trim() || 'manual',
          goals: {
            targetMonthlyScore: toNullableNumber(pipForm.targetMonthlyScore),
            recoveryWindowDays: toNullableNumber(pipForm.recoveryWindowDays),
            mandatoryAppendixCodes: pipForm.mandatoryAppendixCodes,
            coachingCheckinWeekly: pipForm.coachingCheckinWeekly
          },
          baseline: {
            roleGroup: pipForm.roleGroup.trim() || null,
            missingLogCount30d: toNullableNumber(pipForm.missingLogCount30d),
            note: pipForm.baselineNote.trim() || null
          },
          actorId: actionActorId.trim() || undefined
        }
      });
      setNotice('Đã tạo PIP case thủ công.');
      await loadPipTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo PIP case thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  const runAutoDraftPip = async () => {
    setIsMutating(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/hr/pip/cases/auto-draft/run', {
        method: 'POST',
        body: {
          triggeredBy: actionActorId.trim() || 'manual-ops',
          limit: 200
        }
      });
      setNotice('Đã chạy auto-draft PIP.');
      await loadPipTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chạy auto-draft PIP thất bại.');
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <article className="module-workbench">
      <header className="module-header">
        <div>
          <h1>HR Quy chế 2026</h1>
          <p>
            Số hóa PL01/02/03/04/05/06/10, chấm điểm ngày tự động và vận hành PIP theo quy chế.
          </p>
        </div>
        <ul>
          <li>Múi giờ chốt điểm: Asia/Ho_Chi_Minh (freeze D+1 23:59)</li>
          <li>Approver mặc định: manager, fallback HCNS manager</li>
          <li>Soft enforcement: trừ điểm + cảnh báo, không chặn nghiệp vụ</li>
        </ul>
      </header>

      {error && (
        <div className="finance-alert finance-alert-danger" style={{ marginBottom: '1rem' }}>
          <strong>Lỗi:</strong> {error}
        </div>
      )}
      {notice && (
        <div className="finance-alert finance-alert-success" style={{ marginBottom: '1rem' }}>
          <strong>Thành công:</strong> {notice}
        </div>
      )}

      <div className="main-toolbar" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '1rem' }}>
        <div className="toolbar-left" style={{ gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`btn ${activeTab === 'appendix' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('appendix')}
            type="button"
          >
            <ClipboardList size={16} />
            Biểu mẫu
          </button>
          <button
            className={`btn ${activeTab === 'scores' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('scores')}
            type="button"
          >
            <Gauge size={16} />
            Điểm ngày
          </button>
          <button
            className={`btn ${activeTab === 'pip' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('pip')}
            type="button"
          >
            <LifeBuoy size={16} />
            PIP
          </button>
        </div>
        <div className="toolbar-right" style={{ gap: '0.75rem' }}>
          <input
            value={actionActorId}
            onChange={(event) => setActionActorId(event.target.value)}
            placeholder="actorId / approverId"
            style={{ minWidth: '220px' }}
          />
          <button className="btn btn-ghost" onClick={() => void loadActiveTab()} type="button" disabled={isLoading || isMutating}>
            <RefreshCw size={16} />
            Làm mới {activeTabTitle}
          </button>
        </div>
      </div>

      {activeTab === 'appendix' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Tạo submission phụ lục</h3>
            <form className="form-grid" onSubmit={handleCreateSubmission}>
              <div className="field">
                <label>Mã phụ lục</label>
                <select
                  value={appendixForm.appendixCode}
                  onChange={(event) =>
                    setAppendixForm((prev) => ({ ...prev, appendixCode: event.target.value }))
                  }
                >
                  {APPENDIX_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Employee ID</label>
                <input
                  required
                  value={appendixForm.employeeId}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, employeeId: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Work date</label>
                <input
                  type="date"
                  value={appendixForm.workDate}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, workDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Period</label>
                <input
                  placeholder="2026-04"
                  value={appendixForm.period}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, period: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Tóm tắt công việc</label>
                <input
                  value={appendixForm.summary}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, summary: event.target.value }))}
                  placeholder="Ví dụ: chăm sóc khách hàng khu vực miền Nam"
                />
              </div>
              <div className="field">
                <label>Kết quả</label>
                <input
                  value={appendixForm.result}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, result: event.target.value }))}
                  placeholder="Đạt / Chưa đạt / Đang xử lý"
                />
              </div>
              <div className="field">
                <label>Số đầu việc hoàn thành</label>
                <input
                  type="number"
                  min={0}
                  value={appendixForm.taskCount}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, taskCount: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Ghi chú tuân thủ</label>
                <input
                  value={appendixForm.complianceNote}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, complianceNote: event.target.value }))}
                  placeholder="Ví dụ: nộp đúng hạn, đủ minh chứng"
                />
              </div>
              <div className="field">
                <label>Ghi chú chất lượng</label>
                <input
                  value={appendixForm.qualityNote}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, qualityNote: event.target.value }))}
                  placeholder="Ví dụ: cần cải thiện độ chính xác dữ liệu"
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Ghi chú bổ sung</label>
                <textarea
                  rows={2}
                  value={appendixForm.note}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, note: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Evidence type</label>
                <select
                  value={appendixForm.evidenceType}
                  onChange={(event) =>
                    setAppendixForm((prev) => ({ ...prev, evidenceType: event.target.value as 'LINK' | 'FILE' }))
                  }
                >
                  <option value="LINK">LINK</option>
                  <option value="FILE">FILE</option>
                </select>
              </div>
              <div className="field">
                <label>Evidence URL/Object key</label>
                <input
                  value={appendixForm.evidenceValue}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, evidenceValue: event.target.value }))}
                  placeholder="https://... hoặc s3/object-key"
                />
              </div>
              <div className="field">
                <label>Evidence note</label>
                <input
                  value={appendixForm.evidenceNote}
                  onChange={(event) => setAppendixForm((prev) => ({ ...prev, evidenceNote: event.target.value }))}
                />
              </div>
              <div className="action-buttons">
                <button className="btn btn-primary" type="submit" disabled={isMutating}>
                  <Send size={16} />
                  Tạo submission
                </button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter submissions</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))' }}>
              <div className="field">
                <label>Mã PL</label>
                <select
                  value={appendixFilter.appendixCode}
                  onChange={(event) => setAppendixFilter((prev) => ({ ...prev, appendixCode: event.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {APPENDIX_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Employee ID</label>
                <input
                  value={appendixFilter.employeeId}
                  onChange={(event) => setAppendixFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <input
                  value={appendixFilter.status}
                  placeholder="DRAFT/SUBMITTED/APPROVED/REJECTED"
                  onChange={(event) => setAppendixFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadAppendixTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Templates ({templates.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Appendix</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Chưa có template.</td>
                    </tr>
                  ) : (
                    templates.map((row) => (
                      <tr key={toSafeString(row.id) || `${row.appendixCode}-${row.version}`}>
                        <td>{toSafeString(row.appendixCode) || '--'}</td>
                        <td>{toSafeString(row.version) || '--'}</td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                        <td>{formatDateTime(row.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Submissions ({submissions.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Nhân sự</th>
                    <th>Work date</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Revisions</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Chưa có submission.</td>
                    </tr>
                  ) : (
                    submissions.map((row) => {
                      const submissionId = toSafeString(row.id);
                      const revisions = Array.isArray(row.revisions) ? (row.revisions as GenericRow[]) : [];
                      const pendingRevision = revisions.find(
                        (item) => toSafeString(item.status).toUpperCase() === 'PENDING_APPROVAL'
                      );

                      return (
                        <tr key={submissionId || `${row.appendixCode}-${row.employeeId}-${row.workDate}`}>
                          <td>{toSafeString(row.appendixCode) || '--'}</td>
                          <td>{toSafeString(row.employeeId) || '--'}</td>
                          <td>{formatDateTime(row.workDate)}</td>
                          <td>
                            <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                          </td>
                          <td>{formatDateTime(row.dueAt)}</td>
                          <td>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              <div>{revisions.length} revision(s)</div>
                              {submissionId && (
                                <>
                                  <select
                                    value={revisionFormBySubmission[submissionId]?.adjustmentType ?? 'T_PLUS_ONE_CORRECTION'}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          adjustmentType: event.target.value
                                        }
                                      }))
                                    }
                                  >
                                    <option value="T_PLUS_ONE_CORRECTION">Chỉnh sửa T+1</option>
                                    <option value="COMPLIANCE_UPDATE">Cập nhật tuân thủ</option>
                                    <option value="QUALITY_UPDATE">Cập nhật chất lượng</option>
                                    <option value="OTHER">Khác</option>
                                  </select>
                                  <input
                                    placeholder="Giá trị trước chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.beforeValue ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          beforeValue: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    placeholder="Giá trị sau chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.afterValue ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          afterValue: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    placeholder="Lý do chỉnh sửa"
                                    value={revisionFormBySubmission[submissionId]?.reasonNote ?? ''}
                                    onChange={(event) =>
                                      setRevisionFormBySubmission((prev) => ({
                                        ...prev,
                                        [submissionId]: {
                                          ...(prev[submissionId] ?? createDefaultRevisionForm()),
                                          reasonNote: event.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    disabled={isMutating}
                                    onClick={() => void createRevision(submissionId)}
                                  >
                                    Tạo revision T+1
                                  </button>
                                  {pendingRevision && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <button
                                        className="btn btn-ghost"
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void actRevision(toSafeString(pendingRevision.id), 'approve')}
                                      >
                                        Duyệt revision
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        type="button"
                                        disabled={isMutating}
                                        onClick={() => void actRevision(toSafeString(pendingRevision.id), 'reject')}
                                      >
                                        Từ chối revision
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'submit')}
                              >
                                <Send size={14} />
                                Submit
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'approve')}
                              >
                                <CheckCircle2 size={14} />
                                Duyệt
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                disabled={!submissionId || isMutating}
                                onClick={() => void runSubmissionAction(submissionId, 'reject')}
                              >
                                <XCircle size={14} />
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'scores' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter điểm ngày</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
              <div className="field">
                <label>Employee ID</label>
                <input
                  value={scoreFilter.employeeId}
                  onChange={(event) => setScoreFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <input
                  value={scoreFilter.status}
                  placeholder="PROVISIONAL/FINAL"
                  onChange={(event) => setScoreFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadScoresTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="button" disabled={isMutating} onClick={() => void runScoreAction('recompute')}>
                <Wand2 size={16} />
                Recompute
              </button>
              <button className="btn btn-ghost" type="button" disabled={isMutating} onClick={() => void runScoreAction('reconcile')}>
                <RefreshCw size={16} />
                Reconcile
              </button>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Role templates ({roleTemplates.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Role group</th>
                    <th>Weights</th>
                    <th>Thresholds</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roleTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Chưa có role template.</td>
                    </tr>
                  ) : (
                    roleTemplates.map((row) => (
                      <tr key={toSafeString(row.id) || toSafeString(row.roleGroup)}>
                        <td>{toSafeString(row.roleGroup) || '--'}</td>
                        <td>
                          <code>{JSON.stringify(row.pillarWeights ?? {})}</code>
                        </td>
                        <td>
                          <code>{JSON.stringify(row.thresholds ?? {})}</code>
                        </td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Daily scores ({dailyScores.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Work date</th>
                    <th>Output</th>
                    <th>Activity</th>
                    <th>Compliance</th>
                    <th>Quality</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Freeze at</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyScores.length === 0 ? (
                    <tr>
                      <td colSpan={9}>Chưa có dữ liệu điểm ngày.</td>
                    </tr>
                  ) : (
                    dailyScores.map((row) => (
                      <tr key={toSafeString(row.id) || `${row.employeeId}-${row.workDate}`}>
                        <td>{toSafeString(row.employeeId) || '--'}</td>
                        <td>{formatDateTime(row.workDate)}</td>
                        <td>{toSafeString(row.outputScore) || '0'}</td>
                        <td>{toSafeString(row.activityScore) || '0'}</td>
                        <td>{toSafeString(row.complianceScore) || '0'}</td>
                        <td>{toSafeString(row.qualityScore) || '0'}</td>
                        <td>{toSafeString(row.totalScore) || '0'}</td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                        <td>{formatDateTime(row.freezeAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'pip' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Tạo PIP case thủ công</h3>
            <form className="form-grid" onSubmit={handleCreatePipCase}>
              <div className="field">
                <label>Employee ID</label>
                <input
                  required
                  value={pipForm.employeeId}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, employeeId: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Trigger reason</label>
                <input
                  value={pipForm.triggerReason}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, triggerReason: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Mục tiêu điểm tháng</label>
                <input
                  type="number"
                  min={0}
                  value={pipForm.targetMonthlyScore}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, targetMonthlyScore: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Thời gian phục hồi (ngày)</label>
                <input
                  type="number"
                  min={1}
                  value={pipForm.recoveryWindowDays}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, recoveryWindowDays: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Nhóm vai trò</label>
                <input
                  value={pipForm.roleGroup}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, roleGroup: event.target.value }))}
                  placeholder="Ví dụ: SALES / MARKETING / HCNS"
                />
              </div>
              <div className="field">
                <label>Số ngày thiếu log (30 ngày)</label>
                <input
                  type="number"
                  min={0}
                  value={pipForm.missingLogCount30d}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, missingLogCount30d: event.target.value }))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Phụ lục bắt buộc</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {APPENDIX_CODES.map((code) => (
                    <label key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={pipForm.mandatoryAppendixCodes.includes(code)}
                        onChange={(event) =>
                          setPipForm((prev) => ({
                            ...prev,
                            mandatoryAppendixCodes: event.target.checked
                              ? Array.from(new Set([...prev.mandatoryAppendixCodes, code]))
                              : prev.mandatoryAppendixCodes.filter((item) => item !== code)
                          }))
                        }
                      />
                      <span>{code}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={pipForm.coachingCheckinWeekly}
                    onChange={(event) => setPipForm((prev) => ({ ...prev, coachingCheckinWeekly: event.target.checked }))}
                  />
                  <span>Yêu cầu coaching check-in hằng tuần</span>
                </label>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Ghi chú baseline</label>
                <textarea
                  rows={2}
                  value={pipForm.baselineNote}
                  onChange={(event) => setPipForm((prev) => ({ ...prev, baselineNote: event.target.value }))}
                />
              </div>
              <div className="action-buttons" style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" type="submit" disabled={isMutating}>
                  <LifeBuoy size={16} />
                  Tạo PIP case
                </button>
                <button className="btn btn-ghost" type="button" disabled={isMutating} onClick={() => void runAutoDraftPip()}>
                  <Wand2 size={16} />
                  Chạy auto-draft PIP
                </button>
              </div>
            </form>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>Filter PIP</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
              <div className="field">
                <label>Employee ID</label>
                <input
                  value={pipFilter.employeeId}
                  onChange={(event) => setPipFilter((prev) => ({ ...prev, employeeId: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <input
                  value={pipFilter.status}
                  placeholder="DRAFT/OPEN/CLOSED"
                  onChange={(event) => setPipFilter((prev) => ({ ...prev, status: event.target.value }))}
                />
              </div>
              <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-ghost" type="button" onClick={() => void loadPipTab()} disabled={isLoading || isMutating}>
                  <RefreshCw size={16} />
                  Áp dụng filter
                </button>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3 style={{ marginBottom: '0.75rem' }}>PIP cases ({pipCases.length})</h3>
            <div className="table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Source PL10</th>
                  </tr>
                </thead>
                <tbody>
                  {pipCases.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Chưa có PIP case.</td>
                    </tr>
                  ) : (
                    pipCases.map((row) => (
                      <tr key={toSafeString(row.id) || `${row.employeeId}-${row.triggerReason}`}>
                        <td>{toSafeString(row.employeeId) || '--'}</td>
                        <td>{toSafeString(row.triggerReason) || '--'}</td>
                        <td>
                          <span className={statusPillClass(row.status)}>{toSafeString(row.status) || '--'}</span>
                        </td>
                        <td>{formatDateTime(row.openedAt)}</td>
                        <td>{formatDateTime(row.closedAt)}</td>
                        <td>{toSafeString(row.sourceSubmissionId) || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
