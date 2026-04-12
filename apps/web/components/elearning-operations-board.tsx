'use client';

import {
  BookOpen,
  FilePlus,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Award,
  BarChart3,
  Users,
  CheckCircle2,
  PlayCircle,
  Trash2,
  Eye
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { useAccessPolicy } from './access-policy-context';
import { Badge, statusToBadge } from './ui';
import { SidePanel } from './ui/side-panel';

// ─── Types ──────────────────────────────────────────────────────────

type Course = {
  id: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  tags?: string[];
  enrollPolicy?: string;
  status?: string;
  publishedAt?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  _count?: { sections?: number; lessons?: number; enrollments?: number };
};

type Question = {
  id: string;
  questionText: string;
  explanation?: string | null;
  tags?: string[];
  positionId?: string | null;
  departmentId?: string | null;
  points?: number;
  status?: string;
  options?: QuestionOption[];
};

type QuestionOption = {
  id: string;
  optionText: string;
  isCorrect: boolean;
  sortOrder: number;
};

type DashboardStats = {
  totalCourses: number;
  totalEnrollments: number;
  totalCertificates: number;
  completedEnrollments: number;
  completionRate: number;
};

type ActiveTab = 'courses' | 'questions' | 'dashboard';

// ─── DashboardPanel Component ───────────────────────────────────────

function DashboardPanel({ stats }: { stats: DashboardStats | null }) {
  if (!stats) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Đang tải...</div>;

  const cards = [
    { label: 'Khóa học', value: stats.totalCourses, icon: <BookOpen size={20} />, color: 'var(--info)' },
    { label: 'Lượt ghi danh', value: stats.totalEnrollments, icon: <Users size={20} />, color: 'var(--primary)' },
    { label: 'Hoàn thành', value: stats.completedEnrollments, icon: <CheckCircle2 size={20} />, color: 'var(--success)' },
    { label: 'Chứng nhận', value: stats.totalCertificates, icon: <Award size={20} />, color: 'var(--warning)' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: `color-mix(in srgb, ${card.color} 12%, var(--surface))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: card.color,
              flexShrink: 0
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>{card.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: '0.85rem' }}>
          Tỉ lệ hoàn thành: <strong>{stats.completionRate}%</strong>
        </span>
        <div style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: 'var(--line)',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(stats.completionRate, 100)}%`,
            background: 'var(--success)',
            borderRadius: 4,
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── CreateCoursePanel ─────────────────────────────────────────────

function CreateCoursePanel({
  isOpen,
  onClose,
  onCreated
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [enrollPolicy, setEnrollPolicy] = useState('INVITE');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Tên khóa học không được trống.');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      await apiRequest('/elearning/courses', {
        method: 'POST',
        body: { title, description, enrollPolicy }
      });
      setTitle('');
      setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo khóa học.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SidePanel title="Tạo khóa học mới" isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
        {error && (
          <div style={{ padding: '0.5rem 0.75rem', background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem', display: 'block' }}>
            Tên khóa học <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Quy trình bán hàng cơ bản"
            autoFocus
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem', display: 'block' }}>
            Mô tả
          </label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả ngắn về khóa học"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.25rem', display: 'block' }}>
            Chính sách ghi danh
          </label>
          <select className="input" value={enrollPolicy} onChange={(e) => setEnrollPolicy(e.target.value)}>
            <option value="INVITE">Mời (Admin ghi danh)</option>
            <option value="OPEN">Mở (Nhân viên tự ghi danh)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isCreating}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? 'Đang tạo...' : 'Tạo khóa học'}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// ─── CreateQuestionPanel ───────────────────────────────────────────

function CreateQuestionPanel({
  isOpen,
  onClose,
  onCreated
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [questionText, setQuestionText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tag, setTag] = useState('GENERAL');
  const [options, setOptions] = useState([
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) {
      setError('Nội dung câu hỏi không được trống.');
      return;
    }
    const validOptions = options.filter((o) => o.optionText.trim());
    if (validOptions.length < 2) {
      setError('Cần ít nhất 2 đáp án.');
      return;
    }
    if (!validOptions.some((o) => o.isCorrect)) {
      setError('Cần chọn ít nhất 1 đáp án đúng.');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      await apiRequest('/elearning/questions', {
        method: 'POST',
        body: {
          questionText,
          explanation: explanation || undefined,
          tags: [tag],
          options: validOptions
        }
      });
      setQuestionText('');
      setExplanation('');
      setOptions([
        { optionText: '', isCorrect: false },
        { optionText: '', isCorrect: false },
        { optionText: '', isCorrect: false },
        { optionText: '', isCorrect: false }
      ]);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo câu hỏi.');
    } finally {
      setIsCreating(false);
    }
  };

  const updateOption = (idx: number, field: 'optionText' | 'isCorrect', value: string | boolean) => {
    setOptions((prev) =>
      prev.map((opt, i) => {
        if (i !== idx) return opt;
        return { ...opt, [field]: value };
      })
    );
  };

  const QUESTION_TAG_OPTIONS = [
    { value: 'GENERAL', label: 'Chung' },
    { value: 'SALES', label: 'Kinh doanh' },
    { value: 'HR', label: 'Nhân sự' },
    { value: 'FINANCE', label: 'Tài chính' },
    { value: 'SCM', label: 'Chuỗi cung ứng' },
    { value: 'COMPLIANCE', label: 'Tuân thủ' },
    { value: 'ONBOARDING', label: 'Onboarding' }
  ];

  return (
    <SidePanel title="Thêm câu hỏi" isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
        {error && (
          <div style={{ padding: '0.5rem 0.75rem', background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
            Nội dung câu hỏi <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            className="input"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Nhập câu hỏi trắc nghiệm..."
            rows={3}
            autoFocus
          />
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
            Phân loại
          </label>
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
            {QUESTION_TAG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Đáp án <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          {options.map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={opt.isCorrect}
                onChange={(e) => updateOption(idx, 'isCorrect', e.target.checked)}
                title="Đáp án đúng"
                style={{ width: 18, height: 18, accentColor: 'var(--success)' }}
              />
              <input
                type="text"
                className="input"
                value={opt.optionText}
                onChange={(e) => updateOption(idx, 'optionText', e.target.value)}
                placeholder={`Đáp án ${String.fromCharCode(65 + idx)}`}
                style={{ flex: 1 }}
              />
            </div>
          ))}
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
            ✓ Tick chọn đáp án đúng
          </span>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' }}>
            Giải thích (hiện sau khi nộp)
          </label>
          <textarea
            className="input"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Giải thích tại sao đáp án đúng..."
            rows={2}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isCreating}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? 'Đang tạo...' : 'Thêm câu hỏi'}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// ─── Main Operations Board ─────────────────────────────────────────

export function ElearningOperationsBoard() {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('elearning');
  const canCreate = canAction('elearning', 'CREATE');

  const [activeTab, setActiveTab] = useState<ActiveTab>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [isCreateQuestionOpen, setIsCreateQuestionOpen] = useState(false);

  // Selected course detail
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/courses', {
        query: { q: search || undefined, limit: 50 }
      });
      setCourses(normalizeListPayload(payload) as Course[]);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi tải khóa học.');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>('/elearning/questions', {
        query: { q: search || undefined, limit: 100 }
      });
      setQuestions(normalizeListPayload(payload) as Question[]);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi tải câu hỏi.');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  const loadDashboard = useCallback(async () => {
    try {
      const stats = await apiRequest<DashboardStats>('/elearning/dashboard');
      setDashboard(stats);
    } catch {
      // non-critical
    }
  }, []);

  const loadData = useCallback(async () => {
    if (activeTab === 'courses') await loadCourses();
    else if (activeTab === 'questions') await loadQuestions();
    else if (activeTab === 'dashboard') await loadDashboard();
  }, [activeTab, loadCourses, loadQuestions, loadDashboard]);

  useEffect(() => {
    const timer = setTimeout(() => void loadData(), 200);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handlePublish = async (courseId: string) => {
    try {
      await apiRequest(`/elearning/courses/${courseId}/publish`, { method: 'POST' });
      await loadCourses();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi xuất bản.');
    }
  };

  const handleArchive = async (courseId: string) => {
    try {
      await apiRequest(`/elearning/courses/${courseId}/archive`, { method: 'POST' });
      await loadCourses();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi lưu trữ.');
    }
  };

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'courses', label: 'Khóa học', icon: <BookOpen size={15} /> },
    { key: 'questions', label: 'Ngân hàng câu hỏi', icon: <HelpCircle size={15} /> },
    { key: 'dashboard', label: 'Tổng quan', icon: <BarChart3 size={15} /> }
  ];

  if (!canView) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
        Bạn không có quyền truy cập module E-Learning.
      </div>
    );
  }

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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={22} style={{ color: 'var(--primary)' }} />
          Học trực tuyến
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--line)' }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                  color: activeTab === tab.key ? 'white' : 'var(--foreground)',
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

          {activeTab !== 'dashboard' && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadData()}
              disabled={isLoading}
              title="Làm mới"
            >
              <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Search + Actions bar */}
      {activeTab !== 'dashboard' && (
        <div style={{
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid var(--line)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: 400, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'courses' ? 'Tìm khóa học...' : 'Tìm câu hỏi...'}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>

          {canCreate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (activeTab === 'courses') setIsCreateCourseOpen(true);
                else setIsCreateQuestionOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={15} />
              {activeTab === 'courses' ? 'Tạo khóa học' : 'Thêm câu hỏi'}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div style={{
          margin: '0.75rem 1.5rem',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))',
          borderRadius: 'var(--radius-md)',
          color: 'var(--danger)',
          fontSize: '0.8rem'
        }}>
          {errorMessage}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
        {activeTab === 'dashboard' && <DashboardPanel stats={dashboard} />}

        {activeTab === 'courses' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {isLoading && courses.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
                Đang tải...
              </div>
            ) : courses.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
                Chưa có khóa học nào. Bấm "Tạo khóa học" để bắt đầu.
              </div>
            ) : (
              courses.map((course) => (
                <div
                  key={course.id}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: 'var(--surface)',
                    transition: 'box-shadow 0.15s ease',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedCourse(course)}
                  onMouseOver={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                  onMouseOut={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  {/* Cover placeholder */}
                  <div style={{
                    height: 120,
                    background: `linear-gradient(135deg, color-mix(in srgb, var(--primary) 20%, var(--surface)), color-mix(in srgb, var(--info) 15%, var(--surface)))`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <BookOpen size={36} style={{ color: 'var(--primary)', opacity: 0.5 }} />
                  </div>

                  <div style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
                        {course.title}
                      </h3>
                      <Badge variant={statusToBadge(course.status)}>{course.status || 'DRAFT'}</Badge>
                    </div>

                    {course.description && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 0.75rem', lineHeight: 1.4 }}>
                        {course.description.length > 100 ? course.description.slice(0, 100) + '...' : course.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <FilePlus size={12} /> {course._count?.lessons ?? 0} bài học
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Users size={12} /> {course._count?.enrollments ?? 0} học viên
                      </span>
                    </div>

                    {/* Quick actions */}
                    {canCreate && (
                      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
                        {course.status?.toUpperCase() === 'DRAFT' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(e) => { e.stopPropagation(); void handlePublish(course.id); }}
                            style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }}
                          >
                            <PlayCircle size={12} /> Xuất bản
                          </button>
                        )}
                        {course.status?.toUpperCase() !== 'ARCHIVED' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(e) => { e.stopPropagation(); void handleArchive(course.id); }}
                            style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem', color: 'var(--danger)' }}
                          >
                            <Trash2 size={12} /> Lưu trữ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'questions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {isLoading && questions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>Đang tải...</div>
            ) : questions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem' }}>
                Ngân hàng câu hỏi trống. Bấm "Thêm câu hỏi" để bắt đầu.
              </div>
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{q.questionText}</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      {(q.tags ?? []).map((t) => (
                        <Badge key={t} variant="neutral">{t}</Badge>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem' }}>
                    {(q.options ?? []).map((opt) => (
                      <div
                        key={opt.id}
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${opt.isCorrect ? 'var(--success)' : 'var(--line)'}`,
                          background: opt.isCorrect ? 'color-mix(in srgb, var(--success) 8%, var(--surface))' : 'transparent',
                          fontSize: '0.78rem'
                        }}
                      >
                        {opt.isCorrect && <CheckCircle2 size={11} style={{ color: 'var(--success)', marginRight: 4 }} />}
                        {opt.optionText}
                      </div>
                    ))}
                  </div>

                  {q.explanation && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Side panels */}
      <CreateCoursePanel
        isOpen={isCreateCourseOpen}
        onClose={() => setIsCreateCourseOpen(false)}
        onCreated={() => void loadCourses()}
      />
      <CreateQuestionPanel
        isOpen={isCreateQuestionOpen}
        onClose={() => setIsCreateQuestionOpen(false)}
        onCreated={() => void loadQuestions()}
      />

      {/* Course detail panel */}
      <SidePanel
        title={selectedCourse?.title ?? 'Chi tiết khóa học'}
        isOpen={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
      >
        {selectedCourse && (
          <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <Badge variant={statusToBadge(selectedCourse.status)}>{selectedCourse.status || 'DRAFT'}</Badge>
            </div>

            {selectedCourse.description && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                {selectedCourse.description}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div style={{ padding: '0.75rem', background: 'color-mix(in srgb, var(--info) 8%, var(--surface))', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedCourse._count?.sections ?? 0}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Phần</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'color-mix(in srgb, var(--primary) 8%, var(--surface))', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedCourse._count?.lessons ?? 0}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Bài học</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'color-mix(in srgb, var(--success) 8%, var(--surface))', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedCourse._count?.enrollments ?? 0}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Học viên</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'color-mix(in srgb, var(--warning) 8%, var(--surface))', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedCourse.enrollPolicy ?? 'INVITE'}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Chính sách</div>
              </div>
            </div>

            {selectedCourse.createdAt && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Tạo: {new Date(selectedCourse.createdAt).toLocaleDateString('vi-VN')}
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
