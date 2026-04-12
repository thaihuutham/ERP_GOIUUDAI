'use client';

import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Play,
  TrendingUp,
  BarChart3,
  HelpCircle,
  FileText
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { InfoTip } from './ui/info-tip';
import { Badge, statusToBadge } from './ui';

// ─── Types ──────────────────────────────────────────────────────────

type MyEnrollment = {
  id: string;
  courseId: string;
  enrollmentStatus: string;
  progressPercent: number;
  enrolledAt: string;
  completedAt?: string | null;
  course?: {
    id: string;
    title: string;
    description?: string | null;
    status?: string;
    _count?: { lessons?: number };
  };
};

type MyCertificate = {
  id: string;
  courseId: string;
  certificateCode?: string | null;
  score?: number | null;
  issuedAt: string;
  course?: {
    title: string;
  };
};

type DailyQuizStat = {
  period: string;
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
};

type ActiveView = 'courses' | 'certificates' | 'quiz-stats';

// ─── Status helpers ─────────────────────────────────────────────────

function enrollmentStatusLabel(status: string): string {
  switch (status?.toUpperCase()) {
    case 'ENROLLED': return 'Đã ghi danh';
    case 'IN_PROGRESS': return 'Đang học';
    case 'COMPLETED': return 'Hoàn thành';
    case 'DROPPED': return 'Đã rút';
    default: return status || '--';
  }
}

function enrollmentStatusBadge(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status?.toUpperCase()) {
    case 'COMPLETED': return 'success';
    case 'IN_PROGRESS': return 'info';
    case 'ENROLLED': return 'neutral';
    case 'DROPPED': return 'danger';
    default: return 'neutral';
  }
}

// ─── Component ──────────────────────────────────────────────────────

type MyCoursesProps = {
  employeeId?: string;
  onOpenCourse: (courseId: string) => void;
};

export function ElearningMyCourses({ employeeId, onOpenCourse }: MyCoursesProps) {
  const [view, setView] = useState<ActiveView>('courses');
  const [enrollments, setEnrollments] = useState<MyEnrollment[]>([]);
  const [certificates, setCertificates] = useState<MyCertificate[]>([]);
  const [quizStats, setQuizStats] = useState<DailyQuizStat[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadEnrollments = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/my/courses', {
        query: { employeeId }
      });
      setEnrollments(normalizeListPayload(payload) as MyEnrollment[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  const loadCertificates = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/certificates', {
        query: { employeeId }
      });
      setCertificates(normalizeListPayload(payload) as MyCertificate[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  const loadQuizStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/daily-quiz/stats', {
        query: { employeeId }
      });
      setQuizStats(Array.isArray(payload) ? payload : normalizeListPayload(payload) as DailyQuizStat[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (view === 'courses') void loadEnrollments();
    else if (view === 'certificates') void loadCertificates();
    else if (view === 'quiz-stats') void loadQuizStats();
  }, [view, loadEnrollments, loadCertificates, loadQuizStats]);

  const inProgress = enrollments.filter((e) => ['ENROLLED', 'IN_PROGRESS'].includes(e.enrollmentStatus?.toUpperCase()));
  const completed = enrollments.filter((e) => e.enrollmentStatus?.toUpperCase() === 'COMPLETED');

  const tabs: { key: ActiveView; label: string; icon: React.ReactNode; help: string }[] = [
    {
      key: 'courses',
      label: 'Khóa học của tôi',
      icon: <BookOpen size={15} />,
      help: 'Danh sách các khóa học bạn đang tham gia hoặc đã hoàn thành. Bấm vào khóa học để tiếp tục học.'
    },
    {
      key: 'certificates',
      label: 'Chứng nhận',
      icon: <Award size={15} />,
      help: 'Danh sách chứng nhận nội bộ bạn đã nhận được khi hoàn thành khóa học và đạt điểm yêu cầu.'
    },
    {
      key: 'quiz-stats',
      label: 'Trắc nghiệm hàng ngày',
      icon: <HelpCircle size={15} />,
      help: 'Thống kê kết quả trắc nghiệm hàng ngày của bạn. Mỗi ngày đăng nhập, bạn sẽ trả lời 2 câu hỏi ngắn liên quan đến công việc.'
    }
  ];

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
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Học trực tuyến</h2>
          <InfoTip
            title="Trang học trực tuyến"
            content="Đây là trang cá nhân của bạn trong hệ thống đào tạo nội bộ. Tại đây bạn có thể:
• Xem và tiếp tục các khóa học đang tham gia
• Kiểm tra chứng nhận đã đạt được
• Xem lại lịch sử trắc nghiệm hàng ngày"
          />
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--line)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: view === tab.key ? 600 : 400,
                background: view === tab.key ? 'var(--primary)' : 'transparent',
                color: view === tab.key ? 'white' : 'var(--foreground)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' }}>

        {/* ── Courses Tab ──────────────────────────────────────── */}
        {view === 'courses' && (
          <>
            {isLoading && enrollments.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : enrollments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <BookOpen size={40} style={{ color: 'var(--muted)', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Bạn chưa được ghi danh vào khóa học nào.
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Liên hệ quản lý hoặc bộ phận nhân sự để được ghi danh.
                </p>
              </div>
            ) : (
              <>
                {/* In-progress */}
                {inProgress.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      <Play size={15} style={{ color: 'var(--primary)' }} />
                      <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Đang học</h3>
                      <InfoTip
                        title="Khóa học đang học"
                        content="Đây là các khóa học bạn đang tham gia nhưng chưa hoàn thành hết bài. Bấm vào khóa học để tiếp tục từ bài cuối cùng."
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {inProgress.map((enrollment) => (
                        <div
                          key={enrollment.id}
                          onClick={() => onOpenCourse(enrollment.courseId)}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1rem 1.25rem',
                            background: 'var(--surface)',
                            cursor: 'pointer',
                            transition: 'box-shadow 0.15s ease'
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                          onMouseOut={(e) => (e.currentTarget.style.boxShadow = 'none')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, flex: 1, lineHeight: 1.3 }}>
                              {enrollment.course?.title ?? 'Khóa học'}
                            </h4>
                            <Badge variant={enrollmentStatusBadge(enrollment.enrollmentStatus)}>
                              {enrollmentStatusLabel(enrollment.enrollmentStatus)}
                            </Badge>
                          </div>

                          {enrollment.course?.description && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
                              {enrollment.course.description.length > 80
                                ? enrollment.course.description.slice(0, 80) + '...'
                                : enrollment.course.description}
                            </p>
                          )}

                          {/* Progress bar */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.25rem' }}>
                              <span style={{ color: 'var(--muted)' }}>Tiến độ</span>
                              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{Math.round(enrollment.progressPercent)}%</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.min(enrollment.progressPercent, 100)}%`,
                                background: 'var(--primary)',
                                borderRadius: 3,
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                          </div>

                          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--muted)' }}>
                            <FileText size={11} style={{ marginRight: 4 }} />
                            {enrollment.course?._count?.lessons ?? 0} bài học
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed */}
                {completed.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
                      <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Đã hoàn thành</h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {completed.map((enrollment) => (
                        <div
                          key={enrollment.id}
                          onClick={() => onOpenCourse(enrollment.courseId)}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1rem 1.25rem',
                            background: 'color-mix(in srgb, var(--success) 3%, var(--surface))',
                            cursor: 'pointer',
                            transition: 'box-shadow 0.15s ease'
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                          onMouseOut={(e) => (e.currentTarget.style.boxShadow = 'none')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
                              {enrollment.course?.title ?? 'Khóa học'}
                            </h4>
                            <Badge variant="success">✓ Hoàn thành</Badge>
                          </div>
                          {enrollment.completedAt && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                              Hoàn thành: {new Date(enrollment.completedAt).toLocaleDateString('vi-VN')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Certificates Tab ─────────────────────────────────── */}
        {view === 'certificates' && (
          <>
            {isLoading && certificates.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : certificates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <Award size={40} style={{ color: 'var(--muted)', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Bạn chưa có chứng nhận nào.</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  Hoàn thành khóa học và đạt điểm bài thi cuối khóa để nhận chứng nhận.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {certificates.map((cert) => (
                  <div
                    key={cert.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                      background: 'var(--surface)'
                    }}
                  >
                    {/* Certificate banner */}
                    <div style={{
                      padding: '1.25rem',
                      background: 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 15%, var(--surface)), color-mix(in srgb, var(--success) 10%, var(--surface)))',
                      textAlign: 'center'
                    }}>
                      <Award size={36} style={{ color: 'var(--warning)' }} />
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        Chứng nhận nội bộ
                      </div>
                    </div>

                    <div style={{ padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        {cert.course?.title ?? 'Khóa học'}
                      </h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem' }}>
                        {cert.certificateCode && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--muted)' }}>Mã chứng nhận</span>
                            <span style={{ fontWeight: 600 }}>{cert.certificateCode}</span>
                          </div>
                        )}
                        {cert.score != null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--muted)' }}>Điểm đạt được</span>
                            <span style={{ fontWeight: 600, color: 'var(--success)' }}>{cert.score}%</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)' }}>Ngày cấp</span>
                          <span>{new Date(cert.issuedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Quiz Stats Tab ───────────────────────────────────── */}
        {view === 'quiz-stats' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Thống kê trắc nghiệm hàng ngày</h3>
              <InfoTip
                title="Trắc nghiệm hàng ngày"
                content="Mỗi ngày khi đăng nhập, bạn sẽ trả lời 2 câu hỏi liên quan đến công việc. Bảng này thống kê kết quả của bạn theo từng giai đoạn. Điểm trung bình được tính từ 0% (sai hết) đến 100% (đúng hết)."
              />
            </div>

            {isLoading && quizStats.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : quizStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <HelpCircle size={40} style={{ color: 'var(--muted)', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Chưa có dữ liệu trắc nghiệm.</p>
              </div>
            ) : (
              <div style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'color-mix(in srgb, var(--primary) 5%, var(--surface))' }}>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>Giai đoạn</th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                        Số phiên
                        <InfoTip content="Tổng số lần bạn đăng nhập và làm trắc nghiệm trong giai đoạn này." size={12} />
                      </th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                        Đã hoàn thành
                        <InfoTip content="Số phiên bạn đã trả lời đầy đủ và nộp bài." size={12} />
                      </th>
                      <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--line)' }}>
                        Điểm TB
                        <InfoTip content="Điểm trung bình: 0% = sai hết, 50% = đúng 1/2, 100% = đúng hết." size={12} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizStats.map((stat, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{stat.period}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>{stat.totalSessions}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>{stat.completedSessions}</td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 700,
                            color: stat.averageScore >= 80 ? 'var(--success)' : stat.averageScore >= 50 ? 'var(--warning)' : 'var(--danger)'
                          }}>
                            {Math.round(stat.averageScore)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
