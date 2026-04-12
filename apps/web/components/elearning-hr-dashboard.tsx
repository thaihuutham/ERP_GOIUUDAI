'use client';

import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Target
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { InfoTip } from './ui/info-tip';
import { Badge, StatCard } from './ui';

// ─── Types ──────────────────────────────────────────────────────────

type DashboardSummary = {
  totalCourses: number;
  activeCourses: number;
  totalEnrollments: number;
  completedEnrollments: number;
  totalCertificates: number;
  totalQuestions: number;
  avgCompletionRate: number;
  avgQuizScore: number;
};

type EmployeeProgress = {
  employeeId: string;
  employeeName?: string;
  totalEnrolled: number;
  totalCompleted: number;
  completionRate: number;
  lastActivityAt?: string | null;
  dailyQuizAvgScore?: number;
};

type QuizReport = {
  employeeId: string;
  employeeName?: string;
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
  lastQuizDate?: string | null;
};

type ReportPeriod = 'week' | 'month' | 'quarter' | 'year';

type ActiveTab = 'overview' | 'progress' | 'quiz-report' | 'incomplete';

// ─── Component ──────────────────────────────────────────────────────

export function ElearningHrDashboard() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [employeeProgress, setEmployeeProgress] = useState<EmployeeProgress[]>([]);
  const [quizReport, setQuizReport] = useState<QuizReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest<DashboardSummary>('/elearning/dashboard');
      setSummary(data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadEmployeeProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/enrollments', {
        query: { groupBy: 'employee' }
      });
      setEmployeeProgress(normalizeListPayload(payload) as EmployeeProgress[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadQuizReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/daily-quiz/report', {
        query: { period }
      });
      setQuizReport(normalizeListPayload(payload) as QuizReport[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (tab === 'overview') void loadSummary();
    if (tab === 'progress' || tab === 'incomplete') void loadEmployeeProgress();
    if (tab === 'quiz-report') void loadQuizReport();
  }, [tab, loadSummary, loadEmployeeProgress, loadQuizReport]);

  const incompleteEmployees = useMemo(
    () => employeeProgress.filter((e) => e.completionRate < 100),
    [employeeProgress]
  );

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Tổng quan', icon: <BarChart3 size={14} /> },
    { key: 'progress', label: 'Tiến độ nhân viên', icon: <Users size={14} /> },
    { key: 'quiz-report', label: 'Báo cáo trắc nghiệm', icon: <Target size={14} /> },
    { key: 'incomplete', label: 'Chưa hoàn thành', icon: <AlertTriangle size={14} /> }
  ];

  const periodLabels: Record<ReportPeriod, string> = {
    week: 'Tuần này',
    month: 'Tháng này',
    quarter: 'Quý này',
    year: 'Năm nay'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GraduationCap size={22} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            Dashboard Đào tạo
          </h2>
          <InfoTip
            title="Dashboard Đào tạo (HR)"
            content="Trang này dành cho bộ phận Nhân sự (HR) và Quản lý. Tại đây bạn có thể:
• Xem tổng quan về khóa học, ghi danh, chứng nhận
• Theo dõi tiến độ học tập của từng nhân viên
• Kiểm tra kết quả trắc nghiệm hàng ngày
• Phát hiện nhân viên chưa hoàn thành khóa bắt buộc"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (tab === 'overview') void loadSummary();
              if (tab === 'progress' || tab === 'incomplete') void loadEmployeeProgress();
              if (tab === 'quiz-report') void loadQuizReport();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
          >
            <RefreshCw size={13} /> Tải lại
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        padding: '0.5rem 1.5rem',
        borderBottom: '1px solid var(--line)',
        overflow: 'auto'
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.45rem 0.75rem',
              fontSize: '0.78rem',
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))' : 'transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--muted)',
              border: tab === t.key ? '1px solid color-mix(in srgb, var(--primary) 20%, var(--line))' : '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {t.icon} {t.label}
            {t.key === 'incomplete' && incompleteEmployees.length > 0 && (
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                background: 'var(--danger)',
                color: 'white',
                borderRadius: '999px',
                padding: '0 5px',
                minWidth: 16,
                textAlign: 'center',
                lineHeight: '16px'
              }}>
                {incompleteEmployees.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' }}>

        {/* ── Overview ────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {isLoading && !summary ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : summary ? (
              <>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <KpiCard
                    icon={<BookOpen size={18} />}
                    label="Tổng khóa học"
                    value={summary.totalCourses}
                    sub={`${summary.activeCourses} đang mở`}
                    color="var(--primary)"
                    help="Tổng số khóa học đã tạo trong hệ thống, bao gồm cả bản nháp và đã xuất bản."
                  />
                  <KpiCard
                    icon={<Users size={18} />}
                    label="Tổng ghi danh"
                    value={summary.totalEnrollments}
                    sub={`${summary.completedEnrollments} hoàn thành`}
                    color="var(--info)"
                    help="Tổng số lượt nhân viên được ghi danh vào các khóa học. Một nhân viên có thể ghi danh nhiều khóa."
                  />
                  <KpiCard
                    icon={<Award size={18} />}
                    label="Chứng nhận đã cấp"
                    value={summary.totalCertificates}
                    color="var(--warning)"
                    help="Số chứng nhận nội bộ đã được cấp cho nhân viên khi họ hoàn thành khóa học và đạt điểm bài thi cuối khóa."
                  />
                  <KpiCard
                    icon={<Target size={18} />}
                    label="Ngân hàng câu hỏi"
                    value={summary.totalQuestions}
                    sub="câu hỏi"
                    color="var(--success)"
                    help="Tổng số câu hỏi trắc nghiệm trong ngân hàng câu hỏi, dùng cho bài thi cuối khóa và trắc nghiệm hàng ngày."
                  />
                </div>

                {/* Second row: rates */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                  <RateCard
                    title="Tỷ lệ hoàn thành khóa học"
                    value={summary.avgCompletionRate}
                    icon={summary.avgCompletionRate >= 70 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    color={summary.avgCompletionRate >= 70 ? 'var(--success)' : 'var(--warning)'}
                    help="Tỷ lệ phần trăm nhân viên đã hoàn thành tất cả bài học trong khóa so với tổng số ghi danh. Mục tiêu nên đạt trên 70%."
                  />
                  <RateCard
                    title="Điểm trắc nghiệm TB hàng ngày"
                    value={summary.avgQuizScore}
                    icon={summary.avgQuizScore >= 70 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    color={summary.avgQuizScore >= 70 ? 'var(--success)' : 'var(--danger)'}
                    help="Điểm trung bình của tất cả nhân viên trong bài trắc nghiệm hàng ngày. 100% = đúng hết, 50% = đúng 1 câu, 0% = sai hết."
                  />
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
                Không thể tải dữ liệu tổng quan.
              </div>
            )}
          </>
        )}

        {/* ── Progress ────────────────────────────────────────── */}
        {tab === 'progress' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Tiến độ học tập theo nhân viên</h3>
              <InfoTip
                title="Bảng tiến độ"
                content="Bảng này hiển thị tiến độ học tập của từng nhân viên: số khóa đã ghi danh, số khóa hoàn thành, và tỷ lệ hoàn thành tổng. Giúp HR theo dõi ai đang chậm tiến độ."
              />
            </div>

            {isLoading && employeeProgress.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : (
              <ProgressTable data={employeeProgress} />
            )}
          </>
        )}

        {/* ── Quiz Report ─────────────────────────────────────── */}
        {tab === 'quiz-report' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Báo cáo trắc nghiệm hàng ngày</h3>
                <InfoTip
                  title="Báo cáo trắc nghiệm"
                  content="Thống kê kết quả trắc nghiệm hàng ngày của tất cả nhân viên. Chọn giai đoạn (tuần/tháng/quý/năm) để lọc dữ liệu. Nhân viên có điểm thấp cần được hỗ trợ thêm."
                />
              </div>

              {/* Period selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {(['week', 'month', 'quarter', 'year'] as ReportPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: '0.35rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: period === p ? 600 : 400,
                      background: period === p ? 'var(--primary)' : 'transparent',
                      color: period === p ? 'white' : 'var(--foreground)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            </div>

            {isLoading && quizReport.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : quizReport.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
                Chưa có dữ liệu trắc nghiệm cho giai đoạn này.
              </div>
            ) : (
              <QuizReportTable data={quizReport} />
            )}
          </>
        )}

        {/* ── Incomplete ──────────────────────────────────────── */}
        {tab === 'incomplete' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Nhân viên chưa hoàn thành</h3>
              <InfoTip
                title="Danh sách cần theo dõi"
                content="Danh sách nhân viên chưa hoàn thành 100% các khóa đã ghi danh. HR nên liên hệ nhắc nhở hoặc hỗ trợ những nhân viên có tỷ lệ hoàn thành thấp."
              />
            </div>

            {isLoading && incompleteEmployees.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : incompleteEmployees.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <CheckCircle2 size={40} style={{ color: 'var(--success)', opacity: 0.4, marginBottom: '0.5rem' }} />
                <p style={{ color: 'var(--success)', fontSize: '0.9rem', fontWeight: 600 }}>
                  Tất cả nhân viên đã hoàn thành! 🎉
                </p>
              </div>
            ) : (
              <ProgressTable data={incompleteEmployees} highlightLow />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color, help
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: string;
  help: string;
}) {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: '1rem 1.25rem',
      background: 'var(--surface)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-md)',
          background: `color-mix(in srgb, ${color} 10%, var(--surface))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color
        }}>
          {icon}
        </div>
        <InfoTip content={help} size={12} />
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {label}
          {sub && (
            <span style={{ fontSize: '0.65rem', color: 'color-mix(in srgb, var(--foreground) 50%, transparent)' }}>
              · {sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RateCard({
  title, value, icon, color, help
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  help: string;
}) {
  const displayValue = Math.round(value);
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.25rem',
      background: 'var(--surface)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {title}
          <InfoTip content={help} size={12} />
        </span>
        <span style={{ color }}>{icon}</span>
      </div>

      {/* Big number */}
      <div style={{ fontSize: '2rem', fontWeight: 800, color, marginBottom: '0.5rem' }}>
        {displayValue}%
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(displayValue, 100)}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  );
}

function ProgressTable({ data, highlightLow }: { data: EmployeeProgress[]; highlightLow?: boolean }) {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: 'color-mix(in srgb, var(--primary) 5%, var(--surface))' }}>
            <th style={thStyle}>Nhân viên</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Ghi danh
              <InfoTip content="Tổng số khóa học nhân viên đã được ghi danh." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Hoàn thành
              <InfoTip content="Số khóa nhân viên đã học xong 100% bài." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Tỷ lệ
              <InfoTip content="Tỷ lệ khóa hoàn thành so với tổng ghi danh. Mục tiêu: trên 80%." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Hoạt động gần nhất</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const isLow = highlightLow && row.completionRate < 50;
            return (
              <tr key={row.employeeId} style={{
                borderBottom: '1px solid var(--line)',
                background: isLow ? 'color-mix(in srgb, var(--danger) 3%, var(--surface))' : undefined
              }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600 }}>{row.employeeName || row.employeeId?.slice(-8)}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{row.totalEnrolled}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{row.totalCompleted}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    fontWeight: 700,
                    color: row.completionRate >= 80 ? 'var(--success)' : row.completionRate >= 50 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {Math.round(row.completionRate)}%
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleDateString('vi-VN') : '--'}
                </td>
              </tr>
            );
          })}
          {data.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)' }}>
                Không có dữ liệu.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function QuizReportTable({ data }: { data: QuizReport[] }) {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: 'color-mix(in srgb, var(--primary) 5%, var(--surface))' }}>
            <th style={thStyle}>Nhân viên</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Tổng phiên
              <InfoTip content="Số lần đăng nhập mà nhân viên phải làm trắc nghiệm trong giai đoạn." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Đã làm
              <InfoTip content="Số phiên trắc nghiệm nhân viên đã hoàn thành nộp bài." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>
              Điểm TB
              <InfoTip content="Điểm trung bình: 0% = sai hết, 50% = đúng 1/2 câu, 100% = đúng hết." size={12} />
            </th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Lần cuối</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.employeeId} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={tdStyle}>
                <span style={{ fontWeight: 600 }}>{row.employeeName || row.employeeId?.slice(-8)}</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{row.totalSessions}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{row.completedSessions}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <span style={{
                  fontWeight: 700,
                  color: row.averageScore >= 80 ? 'var(--success)' : row.averageScore >= 50 ? 'var(--warning)' : 'var(--danger)'
                }}>
                  {Math.round(row.averageScore)}%
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
                {row.lastQuizDate ? new Date(row.lastQuizDate).toLocaleDateString('vi-VN') : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.65rem 1rem',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid var(--line)',
  whiteSpace: 'nowrap'
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 1rem'
};
