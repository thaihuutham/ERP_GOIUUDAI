'use client';

import {
  Users,
  RefreshCw,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRightLeft,
  Play,
  UserPlus,
  UserMinus,
  Activity,
  Info,
  BarChart3,
  History
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────

type StaffStat = {
  id: string;
  code: string | null;
  fullName: string;
  pendingCount: number;
  totalAssigned: number;
  kpiScore: number;
  contactedCount: number;
  failedCount: number;
  statusBreakdown: Record<string, number>;
};

type AssignmentLog = {
  id: string;
  customerId: string;
  fromStaffId: string | null;
  toStaffId: string | null;
  action: string;
  reason: string | null;
  strategyUsed: string | null;
  rotationRound: number;
  triggeredBy: string | null;
  createdAt: string;
  customer: { fullName: string; phone: string | null };
};

type DistributionStatus = {
  poolSize: number;
  totalAssigned: number;
  totalWithOwner: number;
  pendingByStaff: { staffId: string; count: number }[];
  recentLogs: AssignmentLog[];
};

type DistributionResult = {
  assigned: number;
  reclaimedIdle: number;
  reclaimedFailed: number;
  rotated: number;
  errors: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  AUTO_ASSIGNED: 'Chia tự động',
  MANUAL_ASSIGNED: 'Gán thủ công',
  RECLAIMED_IDLE: 'Thu hồi (idle)',
  RECLAIMED_FAILED: 'Thu hồi (thất bại)',
  ROTATION: 'Quay vòng',
  RETURNED_TO_POOL: 'Về Pool'
};

const ACTION_COLORS: Record<string, string> = {
  AUTO_ASSIGNED: '#10b981',
  MANUAL_ASSIGNED: '#3b82f6',
  RECLAIMED_IDLE: '#f59e0b',
  RECLAIMED_FAILED: '#ef4444',
  ROTATION: '#8b5cf6',
  RETURNED_TO_POOL: '#6b7280'
};

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#94a3b8', padding: 0, fontSize: 14, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center'
        }}
        title="Thông tin"
      >
        <Info size={14} />
      </button>
      {show && (
        <div
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            top: '100%', marginTop: 6, zIndex: 999,
            background: '#1e293b', color: '#e2e8f0', padding: '10px 14px',
            borderRadius: 8, fontSize: 13, lineHeight: 1.5, width: 280,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', whiteSpace: 'pre-wrap'
          }}
          onClick={() => setShow(false)}
        >
          {text}
        </div>
      )}
    </span>
  );
}

function KpiCard({
  icon, label, value, color, helper
}: {
  icon: React.ReactNode; label: string; value: number | string;
  color: string; helper?: string;
}) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
      border: '1px solid #334155', borderRadius: 12, padding: '20px 24px',
      flex: '1 1 200px', minWidth: 180
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color, display: 'flex' }}>{icon}</div>
        <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>{label}</span>
        {helper && <InfoTip text={helper} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function CrmDistributionBoard() {
  const [status, setStatus] = useState<DistributionStatus | null>(null);
  const [staffStats, setStaffStats] = useState<StaffStat[]>([]);
  const [logs, setLogs] = useState<AssignmentLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'logs'>('overview');

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusData, statsData, logsData] = await Promise.all([
        apiRequest<DistributionStatus>('/crm/distribution/status'),
        apiRequest<StaffStat[]>('/crm/distribution/staff-stats'),
        apiRequest<{ data: AssignmentLog[]; total: number }>('/crm/distribution/logs?take=50')
      ]);
      setStatus(statusData);
      setStaffStats(Array.isArray(statsData) ? statsData : []);
      setLogs(Array.isArray(logsData?.data) ? logsData.data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRun = async () => {
    setIsRunning(true);
    setSuccess(null);
    try {
      const result = await apiRequest<DistributionResult>('/crm/distribution/run', { method: 'POST' });
      const messages: string[] = [];
      if (result.assigned > 0) messages.push(`Chia ${result.assigned} khách`);
      if (result.reclaimedIdle > 0) messages.push(`Thu hồi idle: ${result.reclaimedIdle}`);
      if (result.reclaimedFailed > 0) messages.push(`Thu hồi thất bại: ${result.reclaimedFailed}`);
      if (result.rotated > 0) messages.push(`Quay vòng: ${result.rotated}`);
      if (result.errors.length > 0) messages.push(`Lỗi: ${result.errors.join('; ')}`);
      setSuccess(messages.length > 0 ? messages.join(' | ') : 'Không có thay đổi.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi chạy chia khách');
    } finally {
      setIsRunning(false);
    }
  };

  const totalPending = useMemo(
    () => status?.pendingByStaff.reduce((sum, r) => sum + r.count, 0) ?? 0,
    [status]
  );

  const totalReclaimed = useMemo(
    () => logs.filter((l) => l.action === 'RECLAIMED_IDLE' || l.action === 'RECLAIMED_FAILED').length,
    [logs]
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 32px', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ArrowRightLeft size={22} style={{ color: '#8b5cf6' }} />
            Chia khách tự động
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            Quản lý phân phối khách hàng & theo dõi hiệu suất nhân viên
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={loadAll}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: '1px solid #334155',
              background: '#1e293b', color: '#94a3b8', cursor: 'pointer',
              fontSize: 13, fontWeight: 500
            }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            Làm mới
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: isRunning ? '#475569' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              color: '#fff', cursor: isRunning ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(139,92,246,0.3)'
            }}
          >
            <Play size={14} />
            {isRunning ? 'Đang chạy...' : 'Chia khách ngay'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#fca5a5', fontSize: 13
        }}>
          <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#6ee7b7', fontSize: 13
        }}>
          <CheckCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {success}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard
          icon={<Target size={20} />}
          label="Pool chưa gán"
          value={status?.poolSize ?? '-'}
          color="#f59e0b"
          helper="Số khách hàng chưa được gán cho nhân viên nào. Hệ thống sẽ tự động chia khi bật chia khách."
        />
        <KpiCard
          icon={<Users size={20} />}
          label="Đã phân phối"
          value={status?.totalWithOwner ?? '-'}
          color="#10b981"
          helper="Tổng số khách hàng đang được nhân viên chăm sóc."
        />
        <KpiCard
          icon={<Clock size={20} />}
          label="Đang chờ CS"
          value={totalPending}
          color="#3b82f6"
          helper="Khách đã được gán nhưng nhân viên chưa liên hệ (trạng thái Mới chưa tư vấn)."
        />
        <KpiCard
          icon={<ArrowRightLeft size={20} />}
          label="Thu hồi gần đây"
          value={totalReclaimed}
          color="#ef4444"
          helper="Số lần thu hồi khách hàng gần đây (do không chăm sóc hoặc tư vấn thất bại)."
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #334155' }}>
        {([
          { key: 'overview', label: 'Tổng quan', icon: <BarChart3 size={14} /> },
          { key: 'staff', label: 'Nhân viên', icon: <Users size={14} /> },
          { key: 'logs', label: 'Lịch sử', icon: <History size={14} /> }
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', border: 'none', borderBottom: activeTab === tab.key ? '2px solid #8b5cf6' : '2px solid transparent',
              background: 'none', color: activeTab === tab.key ? '#f1f5f9' : '#94a3b8',
              cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s'
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: '#8b5cf6' }} />
            Hoạt động gần đây
            <InfoTip text="Hiển thị 20 thao tác chia/thu hồi khách hàng gần nhất." />
          </h3>
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
            maxHeight: 500, overflowY: 'auto'
          }}>
            {status?.recentLogs.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Chưa có hoạt động chia khách nào.
              </div>
            )}
            {status?.recentLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderBottom: '1px solid #1e293b',
                  fontSize: 13
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ACTION_COLORS[log.action] ?? '#64748b'
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#f1f5f9', fontWeight: 500 }}>
                    {log.customer?.fullName ?? log.customerId}
                  </span>
                  {log.customer?.phone && (
                    <span style={{ color: '#64748b', marginLeft: 8 }}>{log.customer.phone}</span>
                  )}
                  <span style={{
                    display: 'inline-block', marginLeft: 8, padding: '2px 8px',
                    borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: `${ACTION_COLORS[log.action] ?? '#64748b'}22`,
                    color: ACTION_COLORS[log.action] ?? '#94a3b8'
                  }}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </div>
                <div style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }}>
                  {formatTime(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: '#3b82f6' }} />
            Thống kê nhân viên
            <InfoTip text="Bảng thống kê số khách hàng mỗi nhân viên đang quản lý,\nphân theo trạng thái: Chờ CS / Đã CS / Thất bại." />
          </h3>
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
            overflowX: 'auto'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Nhân viên</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>Chờ CS</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>Đã CS</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>Thất bại</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Tổng</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#8b5cf6', fontWeight: 600 }}>KPI</th>
                </tr>
              </thead>
              <tbody>
                {staffStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Chưa có nhân viên nào tham gia chia khách.
                    </td>
                  </tr>
                ) : (
                  staffStats.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 500 }}>
                        <div>{s.fullName}</div>
                        {s.code && <div style={{ fontSize: 11, color: '#64748b' }}>{s.code}</div>}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>
                        {s.pendingCount}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                        {s.contactedCount}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>
                        {s.failedCount}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: '#94a3b8' }}>
                        {s.totalAssigned}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          background: s.kpiScore > 0 ? 'rgba(139,92,246,0.15)' : 'transparent',
                          color: s.kpiScore > 0 ? '#c4b5fd' : '#64748b'
                        }}>
                          {s.kpiScore > 0 ? s.kpiScore.toLocaleString() : '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={16} style={{ color: '#6366f1' }} />
            Lịch sử chia/thu hồi
            <InfoTip text="Toàn bộ lịch sử chia khách, thu hồi, quay vòng.\nBao gồm cả thao tác tự động và thủ công bởi admin." />
          </h3>
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
            overflowX: 'auto'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Thời gian</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Khách hàng</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Hành động</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Lý do</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Vòng</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Chưa có lịch sử chia khách.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatTime(log.createdAt)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 500 }}>
                          {log.customer?.fullName ?? '-'}
                        </div>
                        {log.customer?.phone && (
                          <div style={{ color: '#64748b', fontSize: 11 }}>{log.customer.phone}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px',
                          borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: `${ACTION_COLORS[log.action] ?? '#64748b'}22`,
                          color: ACTION_COLORS[log.action] ?? '#94a3b8'
                        }}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 12, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.reason ?? '-'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: log.rotationRound > 0 ? '#c4b5fd' : '#475569' }}>
                        {log.rotationRound > 0 ? `#${log.rotationRound}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
