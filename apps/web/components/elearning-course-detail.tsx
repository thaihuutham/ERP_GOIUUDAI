'use client';

import {
  ArrowLeft,
  Check,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit3,
  FilePlus,
  FolderPlus,
  GripVertical,
  HelpCircle,
  Info,
  Layers,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  UserPlus,
  Users,
  Award,
  CheckCircle2,
  Video,
  FileText,
  Image,
  Link2,
  ClipboardList,
  ExternalLink,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { Badge, statusToBadge } from './ui';
import { InfoTip } from './ui/info-tip';

// ─── Types ──────────────────────────────────────────────────────────

type Section = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: Lesson[];
};

type Lesson = {
  id: string;
  title: string;
  contentType: string;
  sortOrder: number;
  durationMinutes?: number | null;
  status?: string;
};

type Exam = {
  id: string;
  title: string;
  description?: string | null;
  questionCount: number;
  passingScore: number;
  randomizeQuestions: boolean;
  status?: string;
  createdAt?: string;
};

type Question = {
  id: string;
  questionText: string;
  tags?: string[];
  options?: { id: string; optionText: string; isCorrect: boolean }[];
};

type CourseDetail = {
  id: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  tags?: string[];
  category?: string | null;
  enrollPolicy?: string;
  status?: string;
  publishedAt?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  sections: Section[];
  lessons?: Lesson[]; // loose lessons (sectionId = null)
  exams: Exam[];
  _count?: { enrollments?: number; certificates?: number; lessons?: number };
};

type Enrollment = {
  id: string;
  employeeId: string;
  enrollmentStatus: string;
  progressPercent: number;
  enrolledAt: string;
  completedAt?: string | null;
};

type ActiveTab = 'content' | 'enrollments' | 'exams' | 'settings';

// ─── Content Type Icons ─────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  VIDEO: <Video size={14} />,
  DOCUMENT: <FileText size={14} />,
  INFOGRAPHIC: <Image size={14} />,
  SLIDE: <ClipboardList size={14} />,
  EXTERNAL_LINK: <ExternalLink size={14} />,
  QUIZ: <HelpCircle size={14} />
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  DOCUMENT: 'Tài liệu',
  INFOGRAPHIC: 'Infographic',
  SLIDE: 'Trình chiếu',
  EXTERNAL_LINK: 'Liên kết ngoài',
  QUIZ: 'Trắc nghiệm'
};

// Dynamic categories fetched from API — fallback map for display
const CATEGORY_LABELS: Record<string, string> = {};

// ─── Shared styles ──────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--foreground)',
  marginBottom: '0.35rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem'
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: 'var(--foreground)',
  marginBottom: '0.75rem',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid var(--line)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

// ─── Add Section Dialog ─────────────────────────────────────────────

function AddSectionInline({
  courseId,
  onCreated
}: {
  courseId: string;
  onCreated: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiRequest(`/elearning/courses/${courseId}/sections`, {
        method: 'POST',
        body: { title: title.trim() }
      });
      setTitle('');
      setIsOpen(false);
      onCreated();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setIsOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
      >
        <FolderPlus size={14} /> Thêm phần mới
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tên phần (VD: Phần 1 - Giới thiệu)"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
        style={{ flex: 1 }}
      />
      <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving || !title.trim()}
        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
      >
        {saving ? '...' : 'Lưu'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => { setIsOpen(false); setTitle(''); }}
        style={{ padding: '0.4rem', fontSize: '0.8rem' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Add Lesson Dialog ──────────────────────────────────────────────

function AddLessonInline({
  courseId,
  sectionId,
  onCreated
}: {
  courseId: string;
  sectionId?: string | null;
  onCreated: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('DOCUMENT');
  const [contentUrl, setContentUrl] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiRequest(`/elearning/courses/${courseId}/lessons`, {
        method: 'POST',
        body: {
          title: title.trim(),
          sectionId: sectionId || undefined,
          contentType,
          contentUrl: contentUrl.trim() || undefined,
          contentHtml: contentHtml.trim() || undefined,
          durationMinutes: duration ? parseInt(duration, 10) : undefined
        }
      });
      setTitle('');
      setContentUrl('');
      setContentHtml('');
      setDuration('');
      setIsOpen(false);
      onCreated();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setIsOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
      >
        <Plus size={12} /> Thêm bài học
      </button>
    );
  }

  return (
    <div style={{
      padding: '0.75rem',
      border: '1px dashed var(--primary)',
      borderRadius: 'var(--radius-md)',
      background: 'color-mix(in srgb, var(--primary) 3%, var(--surface))',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tên bài học"
          autoFocus
          style={{ flex: 1 }}
        />
        <select className="input" value={contentType} onChange={(e) => setContentType(e.target.value)} style={{ width: 160 }}>
          {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {(contentType === 'VIDEO' || contentType === 'EXTERNAL_LINK' || contentType === 'SLIDE') && (
        <input
          className="input"
          value={contentUrl}
          onChange={(e) => setContentUrl(e.target.value)}
          placeholder={contentType === 'VIDEO' ? 'URL video (YouTube, Vimeo...)' : contentType === 'SLIDE' ? 'URL slide (Google Slides, Canva...)' : 'URL liên kết ngoài'}
        />
      )}

      {(contentType === 'DOCUMENT' || contentType === 'INFOGRAPHIC') && (
        <textarea
          className="input"
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          placeholder="Nội dung bài học (hỗ trợ HTML)"
          rows={3}
          style={{ resize: 'vertical' }}
        />
      )}

      {contentType === 'QUIZ' && (
        <div style={{
          padding: '0.6rem 0.75rem',
          borderRadius: 'var(--radius-sm)',
          background: 'color-mix(in srgb, var(--info) 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--info) 20%, var(--line))',
          fontSize: '0.76rem',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <HelpCircle size={13} style={{ color: 'var(--info)', flexShrink: 0 }} />
          Sau khi tạo bài trắc nghiệm, bạn có thể gắn câu hỏi từ ngân hàng câu hỏi bằng nút "Gắn câu hỏi" trên bài học.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          className="input"
          value={duration}
          onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
          placeholder="Thời lượng (phút)"
          style={{ width: 140 }}
        />
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}
          style={{ fontSize: '0.78rem' }}
        >
          Hủy
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving || !title.trim()}
          style={{ fontSize: '0.78rem' }}
        >
          {saving ? 'Đang lưu...' : 'Thêm bài học'}
        </button>
      </div>
    </div>
  );
}

// ─── Quiz Question Picker ───────────────────────────────────────────

function QuizQuestionPicker({
  lessonId,
  onClose
}: {
  lessonId: string;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [linked, setLinked] = useState<Question[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allQ, lessonData] = await Promise.all([
        apiRequest<any>('/elearning/questions', { query: { limit: '100', q: search || undefined } }),
        apiRequest<any>(`/elearning/lessons/${lessonId}`)
      ]);
      setQuestions(normalizeListPayload(allQ) as Question[]);
      const lqs = (lessonData?.lessonQuestions ?? []).map((lq: any) => lq.question).filter(Boolean);
      setLinked(lqs as Question[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [lessonId, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const linkedIds = new Set(linked.map((q) => q.id));

  const handleAdd = async (questionId: string) => {
    setAdding(questionId);
    try {
      await apiRequest(`/elearning/lessons/${lessonId}/questions`, {
        method: 'POST',
        body: { questionIds: [questionId] }
      });
      await loadData();
    } catch {
      /* ignore */
    } finally {
      setAdding(null);
    }
  };

  const handleRemove = async (questionId: string) => {
    try {
      await apiRequest(`/elearning/lessons/${lessonId}/questions/${questionId}`, { method: 'DELETE' });
      await loadData();
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{
      border: '1px solid color-mix(in srgb, var(--info) 30%, var(--line))',
      borderRadius: 'var(--radius-md)',
      background: 'color-mix(in srgb, var(--info) 3%, var(--surface))',
      padding: '0.75rem',
      marginTop: '0.25rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <HelpCircle size={14} style={{ color: 'var(--info)' }} />
          Câu hỏi trắc nghiệm ({linked.length} đã gắn)
        </span>
        <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '0.2rem' }}>
          <X size={14} />
        </button>
      </div>

      {/* Linked questions */}
      {linked.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          {linked.map((q) => (
            <div key={q.id} style={{
              padding: '0.4rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.78rem',
              background: 'color-mix(in srgb, var(--success) 6%, var(--surface))',
              border: '1px solid color-mix(in srgb, var(--success) 20%, var(--line))',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '0.25rem'
            }}>
              <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{q.questionText.length > 80 ? q.questionText.slice(0, 80) + '...' : q.questionText}</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void handleRemove(q.id)}
                style={{ padding: '0.15rem', color: 'var(--danger)', fontSize: '0.7rem' }}
                title="Gỡ câu hỏi"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search + add */}
      <input
        className="input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm câu hỏi trong ngân hàng..."
        style={{ marginBottom: '0.4rem', fontSize: '0.78rem' }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.76rem', padding: '0.5rem' }}>Đang tải...</div>
      ) : (
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          {questions.filter((q) => !linkedIds.has(q.id)).map((q) => (
            <div key={q.id} style={{
              padding: '0.4rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.76rem',
              borderBottom: '1px solid var(--line)'
            }}>
              <span style={{ flex: 1 }}>{q.questionText.length > 80 ? q.questionText.slice(0, 80) + '...' : q.questionText}</span>
              {q.tags && q.tags.length > 0 && (
                <Badge variant="neutral">{q.tags[0]}</Badge>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void handleAdd(q.id)}
                disabled={adding === q.id}
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: 'var(--primary)' }}
              >
                {adding === q.id ? '...' : '+ Gắn'}
              </button>
            </div>
          ))}
          {questions.filter((q) => !linkedIds.has(q.id)).length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.76rem', padding: '0.5rem' }}>
              Không tìm thấy câu hỏi. Hãy tạo câu hỏi trong tab "Ngân hàng câu hỏi".
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content Tab ────────────────────────────────────────────────────

function ContentTab({
  course,
  onRefresh
}: {
  course: CourseDetail;
  onRefresh: () => void;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(course.sections.map((s) => s.id))
  );
  const [quizPickerLesson, setQuizPickerLesson] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('Xóa phần này? Các bài học trong phần sẽ trở thành bài học tự do.')) return;
    try {
      await apiRequest(`/elearning/sections/${sectionId}`, { method: 'DELETE' });
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Xóa bài học này?')) return;
    try {
      await apiRequest(`/elearning/lessons/${lessonId}`, { method: 'DELETE' });
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  const handlePublishLesson = async (lessonId: string) => {
    try {
      await apiRequest(`/elearning/lessons/${lessonId}`, {
        method: 'PATCH',
        body: { status: 'ACTIVE' }
      });
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  const handlePublishAllContent = async () => {
    if (!confirm('Xuất bản tất cả nội dung đang ở trạng thái Nháp?')) return;
    try {
      await apiRequest(`/elearning/courses/${course.id}/publish`, { method: 'POST' });
      onRefresh();
    } catch {
      /* ignore */
    }
  };

  const isActive = course.status?.toUpperCase() === 'ACTIVE';
  const looseLessons = course.lessons ?? [];

  // Check if there are any DRAFT lessons
  const allLessons = [...course.sections.flatMap((s) => s.lessons), ...looseLessons];
  const hasDraftContent = allLessons.some((l) => !l.status || l.status === 'DRAFT');

  const renderLessonRow = (lesson: Lesson) => (
    <div key={lesson.id}>
      <div
        style={{
          padding: '0.5rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '0.25rem',
          transition: 'background 0.1s ease'
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 4%, var(--surface))')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <GripVertical size={12} style={{ color: 'var(--muted)', cursor: 'grab' }} />
        <span style={{ color: 'var(--primary)', flexShrink: 0 }}>
          {CONTENT_TYPE_ICONS[lesson.contentType] || <FileText size={14} />}
        </span>
        <span style={{ flex: 1, fontSize: '0.82rem' }}>{lesson.title}</span>
        {lesson.durationMinutes && (
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lesson.durationMinutes} phút</span>
        )}
        <Badge variant={statusToBadge(lesson.status)}>{lesson.status || 'DRAFT'}</Badge>
        {/* Quiz: link questions */}
        {lesson.contentType === 'QUIZ' && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setQuizPickerLesson(quizPickerLesson === lesson.id ? null : lesson.id)}
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--info)' }}
            title="Gắn câu hỏi trắc nghiệm"
          >
            <HelpCircle size={12} /> Câu hỏi
          </button>
        )}
        {/* Publish single lesson */}
        {isActive && (!lesson.status || lesson.status === 'DRAFT') && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handlePublishLesson(lesson.id)}
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--success)' }}
            title="Xuất bản bài học này"
          >
            <PlayCircle size={12} />
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void handleDeleteLesson(lesson.id)}
          style={{ padding: '0.2rem', color: 'var(--danger)' }}
          title="Xóa bài học"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {/* Quiz question picker inline */}
      {quizPickerLesson === lesson.id && (
        <div style={{ paddingLeft: '1.5rem', paddingRight: '0.5rem' }}>
          <QuizQuestionPicker lessonId={lesson.id} onClose={() => setQuizPickerLesson(null)} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Course structure info */}
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--info) 6%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--info) 20%, var(--line))',
        fontSize: '0.8rem',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <Info size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
        Cấu trúc khóa học: Tạo các <strong>Phần</strong> để nhóm bài học, sau đó thêm <strong>Bài học</strong> vào từng phần.
        Mỗi bài học có thể là video, tài liệu, infographic, slide, liên kết ngoài hoặc trắc nghiệm.
      </div>

      {/* Publish all content button */}
      {isActive && hasDraftContent && (
        <div style={{
          padding: '0.6rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: 'color-mix(in srgb, var(--warning) 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--warning) 25%, var(--line))',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8rem'
        }}>
          <Info size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ flex: 1, color: 'var(--muted)' }}>
            Khóa học đã xuất bản nhưng có nội dung đang ở trạng thái <strong>Nháp</strong>.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handlePublishAllContent()}
            style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <PlayCircle size={13} /> Xuất bản tất cả nội dung
          </button>
        </div>
      )}

      {/* Sections list */}
      {course.sections.map((section) => (
        <div key={section.id} style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden'
        }}>
          {/* Section header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'color-mix(in srgb, var(--primary) 4%, var(--surface))',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              borderBottom: expandedSections.has(section.id) ? '1px solid var(--line)' : 'none'
            }}
            onClick={() => toggleSection(section.id)}
          >
            {expandedSections.has(section.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Layers size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{section.title}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              {section.lessons.length} bài học
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => { e.stopPropagation(); void handleDeleteSection(section.id); }}
              style={{ padding: '0.2rem', color: 'var(--danger)' }}
              title="Xóa phần này"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Section lessons */}
          {expandedSections.has(section.id) && (
            <div style={{ padding: '0.5rem' }}>
              {section.lessons.length === 0 && (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>
                  Chưa có bài học. Bấm "Thêm bài học" để bắt đầu.
                </div>
              )}

              {section.lessons.map(renderLessonRow)}

              <div style={{ padding: '0.5rem 0.75rem' }}>
                <AddLessonInline courseId={course.id} sectionId={section.id} onCreated={onRefresh} />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add section button */}
      <AddSectionInline courseId={course.id} onCreated={onRefresh} />

      {/* Loose lessons (no section) */}
      {looseLessons.length > 0 && (
        <div style={{
          border: '1px solid color-mix(in srgb, var(--muted) 20%, var(--line))',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '0.75rem 1rem',
            background: 'color-mix(in srgb, var(--muted) 4%, var(--surface))',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FileText size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>Bài học tự do</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              {looseLessons.length} bài học
            </span>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {looseLessons.map(renderLessonRow)}
          </div>
        </div>
      )}

      {/* Add loose lesson */}
      <div style={{ marginTop: '0.25rem' }}>
        <AddLessonInline courseId={course.id} sectionId={null} onCreated={onRefresh} />
      </div>
    </div>
  );
}

// ─── Enrollments Tab ────────────────────────────────────────────────

function EnrollmentsTab({ courseId }: { courseId: string }) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollIds, setEnrollIds] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<any>(`/elearning/enrollments`, {
        query: { courseId, limit: '100' }
      });
      setEnrollments(normalizeListPayload(payload) as Enrollment[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadEnrollments();
  }, [loadEnrollments]);

  const handleEnroll = async () => {
    const ids = enrollIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setEnrolling(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ enrolled: number; skipped: number }>(`/elearning/courses/${courseId}/enroll`, {
        method: 'POST',
        body: { employeeIds: ids }
      });
      setMessage(`Đã ghi danh ${result.enrolled} nhân viên${result.skipped > 0 ? ` (${result.skipped} đã có sẵn)` : ''}.`);
      setEnrollIds('');
      await loadEnrollments();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lỗi ghi danh.');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Enroll form */}
      <div style={cardStyle}>
        <div style={labelStyle}>
          <UserPlus size={14} />
          Ghi danh nhân viên
          <InfoTip content="Nhập danh sách mã nhân viên (Employee ID) cách nhau bằng dấu phẩy để ghi danh hàng loạt. Nhân viên đã ghi danh sẽ được bỏ qua tự động." />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="input"
            value={enrollIds}
            onChange={(e) => setEnrollIds(e.target.value)}
            placeholder="Nhập mã NV cách nhau bằng dấu phẩy (VD: emp1, emp2)"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleEnroll()}
            disabled={enrolling || !enrollIds.trim()}
            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            {enrolling ? 'Đang ghi danh...' : 'Ghi danh'}
          </button>
        </div>
        {message && (
          <div style={{
            marginTop: '0.5rem',
            fontSize: '0.78rem',
            color: message.startsWith('Đã') ? 'var(--success)' : 'var(--danger)'
          }}>
            {message}
          </div>
        )}
      </div>

      {/* Enrollment list */}
      <div style={sectionHeaderStyle}>
        <Users size={16} />
        Danh sách học viên ({enrollments.length})
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>Đang tải...</div>
      ) : enrollments.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem', fontSize: '0.85rem' }}>
          Chưa có học viên. Hãy ghi danh nhân viên ở trên.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {enrollments.map((e) => (
            <div key={e.id} style={{
              padding: '0.6rem 0.75rem',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.82rem'
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--muted)' }}>
                {e.employeeId.slice(0, 12)}...
              </span>
              <Badge variant={
                e.enrollmentStatus === 'COMPLETED' ? 'success' :
                e.enrollmentStatus === 'IN_PROGRESS' ? 'info' :
                'neutral'
              }>
                {e.enrollmentStatus === 'COMPLETED' ? 'Hoàn thành' :
                 e.enrollmentStatus === 'IN_PROGRESS' ? 'Đang học' :
                 'Đã ghi danh'}
              </Badge>
              <div style={{ flex: 1 }}>
                <div style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--line)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${e.progressPercent}%`,
                    background: e.progressPercent >= 100 ? 'var(--success)' : 'var(--primary)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {e.progressPercent}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Exams Tab ──────────────────────────────────────────────────────

function ExamsTab({ courseId, course, onRefresh }: { courseId: string; course: CourseDetail; onRefresh: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState('10');
  const [passingScore, setPassingScore] = useState('70');
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    void loadExams();
  }, [courseId]);

  const loadExams = async () => {
    try {
      const course = await apiRequest<CourseDetail>(`/elearning/courses/${courseId}`);
      setExams(course.exams ?? []);
    } catch {
      /* ignore */
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiRequest('/elearning/exams', {
        method: 'POST',
        body: {
          courseId,
          title: title.trim(),
          questionCount: parseInt(questionCount, 10) || 10,
          passingScore: parseInt(passingScore, 10) || 70
        }
      });
      setTitle('');
      setShowCreate(false);
      await loadExams();
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--info) 6%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--info) 20%, var(--line))',
        fontSize: '0.8rem',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <Info size={14} style={{ color: 'var(--info)', flexShrink: 0 }} />
        <div>
          <div>Bài thi cuối khóa lấy câu hỏi theo thứ tự ưu tiên:</div>
          <div style={{ marginTop: '0.25rem' }}>
            <strong>1.</strong> Câu hỏi gắn vào bài học Trắc nghiệm trong khóa →{' '}
            <strong>2.</strong> Ngân hàng câu hỏi theo nhóm "<em>{course.category ? CATEGORY_LABELS[course.category] ?? course.category : 'Chưa chọn'}</em>" →{' '}
            <strong>3.</strong> Toàn bộ ngân hàng (nếu không có lọc)
          </div>
          <div style={{ marginTop: '0.25rem' }}>Đạt điểm ngưỡng → cấp chứng nhận tự động.</div>
        </div>
      </div>

      {/* Existing exams */}
      {exams.map((exam) => (
        <div key={exam.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{exam.title}</span>
            <Badge variant={statusToBadge(exam.status)}>{exam.status || 'ACTIVE'}</Badge>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
            <span>📝 {exam.questionCount} câu hỏi</span>
            <span>✅ Điểm đạt: {exam.passingScore}%</span>
            <span>{exam.randomizeQuestions ? '🔀 Ngẫu nhiên' : '📋 Theo thứ tự'}</span>
          </div>
        </div>
      ))}

      {/* Create exam */}
      {showCreate ? (
        <div style={{
          ...cardStyle,
          border: '1px dashed var(--primary)',
          background: 'color-mix(in srgb, var(--primary) 3%, var(--surface))'
        }}>
          <div style={labelStyle}>Tạo bài thi mới</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên bài thi (VD: Bài thi cuối khóa)"
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Số câu hỏi</label>
                <input
                  className="input"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Điểm đạt (%)</label>
                <input
                  className="input"
                  value={passingScore}
                  onChange={(e) => setPassingScore(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Hủy</button>
              <button type="button" className="btn btn-primary" onClick={() => void handleCreate()} disabled={saving || !title.trim()}>
                {saving ? 'Đang tạo...' : 'Tạo bài thi'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
        >
          <Plus size={14} /> Tạo bài thi
        </button>
      )}
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────

function SettingsTab({
  course,
  onRefresh
}: {
  course: CourseDetail;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? '');
  const [enrollPolicy, setEnrollPolicy] = useState(course.enrollPolicy ?? 'INVITE');
  const [category, setCategory] = useState(course.category ?? '');
  const [tags, setTags] = useState((course.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState<{ code: string; label: string }[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await apiRequest<any>('/elearning/question-categories');
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setDynamicCategories(list.map((c: any) => ({ code: c.code, label: c.label })));
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest(`/elearning/courses/${course.id}`, {
        method: 'PATCH',
        body: {
          title: title.trim(),
          description: description.trim() || null,
          enrollPolicy,
          category: category || null,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean)
        }
      });
      setMsg('Đã lưu thay đổi.');
      onRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Lỗi cập nhật.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 600 }}>
      <div>
        <div style={labelStyle}>
          Tên khóa học <span style={{ color: 'var(--danger)' }}>*</span>
          <InfoTip content="Tên ngắn gọn, dễ hiểu. VD: 'Quy trình bán hàng' hoặc 'An toàn lao động 2024'." />
        </div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <div style={labelStyle}>
          Mô tả
          <InfoTip content="Mô tả chi tiết nội dung khóa học để nhân viên hiểu mục tiêu trước khi tham gia." />
        </div>
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div>
        <div style={labelStyle}>
          Chính sách ghi danh
          <InfoTip content="'Mời' — chỉ Admin/HR ghi danh nhân viên. 'Mở' — nhân viên tự ghi danh từ danh sách khóa học." />
        </div>
        <select className="input" value={enrollPolicy} onChange={(e) => setEnrollPolicy(e.target.value)}>
          <option value="INVITE">Mời (Admin ghi danh)</option>
          <option value="OPEN">Mở (Nhân viên tự ghi danh)</option>
        </select>
      </div>

      <div>
        <div style={labelStyle}>
          Nhóm khóa học
          <InfoTip content="Nhóm khóa học quyết định phạm vi câu hỏi cho bài thi cuối khóa. Hệ thống sẽ ưu tiên lấy câu hỏi từ ngân hàng câu hỏi có cùng nhóm." />
        </div>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">-- Chưa chọn --</option>
          {dynamicCategories.map((cat) => (
            <option key={cat.code} value={cat.code}>{cat.label}</option>
          ))}
        </select>
      </div>

      <div>
        <div style={labelStyle}>
          Tags
          <InfoTip content="Nhãn phân loại khóa học, cách nhau bằng dấu phẩy. VD: onboarding, bắt buộc, sale" />
        </div>
        <input
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="VD: onboarding, bắt buộc, sale"
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSave()}
          disabled={saving || !title.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
        {msg && (
          <span style={{
            fontSize: '0.78rem',
            color: msg.startsWith('Đã') ? 'var(--success)' : 'var(--danger)'
          }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ElearningCourseDetail({
  courseId,
  onBack
}: {
  courseId: string;
  onBack: () => void;
}) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('content');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<CourseDetail>(`/elearning/courses/${courseId}`);
      setCourse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải khóa học.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await apiRequest(`/elearning/courses/${courseId}/publish`, { method: 'POST' });
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi xuất bản.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading && !course) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
        Đang tải khóa học...
      </div>
    );
  }

  if (error && !course) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> Quay lại
        </button>
      </div>
    );
  }

  if (!course) return null;

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'content', label: 'Nội dung', icon: <BookOpen size={14} /> },
    { key: 'enrollments', label: `Học viên (${course._count?.enrollments ?? 0})`, icon: <Users size={14} /> },
    { key: 'exams', label: `Bài thi (${course.exams?.length ?? 0})`, icon: <Award size={14} /> },
    { key: 'settings', label: 'Cài đặt', icon: <Settings size={14} /> }
  ];

  const totalLessons = course.sections.reduce((sum, s) => sum + s.lessons.length, 0) + (course.lessons?.length ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {/* Top row: back + title + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onBack}
            style={{ padding: '0.35rem', flexShrink: 0 }}
            title="Quay lại danh sách"
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {course.title}
            </h2>
            {course.description && (
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.2rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {course.description}
              </p>
            )}
          </div>

          <Badge variant={statusToBadge(course.status)}>
            {course.status === 'ACTIVE' ? 'Đã xuất bản' : course.status === 'ARCHIVED' ? 'Đã xóa' : 'Nháp'}
          </Badge>

          <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
            {course.status?.toUpperCase() === 'DRAFT' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handlePublish()}
                disabled={publishing}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
              >
                <PlayCircle size={14} />
                {publishing ? 'Đang xuất bản...' : 'Xuất bản'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadCourse()}
              title="Làm mới"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Layers size={13} /> {course.sections.length} phần
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FilePlus size={13} /> {totalLessons} bài học
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Users size={13} /> {course._count?.enrollments ?? 0} học viên
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Award size={13} /> {course._count?.certificates ?? 0} chứng nhận
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: 'none', marginBottom: '-0.75rem' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? 'var(--primary)' : 'var(--muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
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

      {/* Error */}
      {error && (
        <div style={{
          margin: '0.75rem 1.5rem 0',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))',
          borderRadius: 'var(--radius-md)',
          color: 'var(--danger)',
          fontSize: '0.8rem'
        }}>
          {error}
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' }}>
        {activeTab === 'content' && <ContentTab course={course} onRefresh={() => void loadCourse()} />}
        {activeTab === 'enrollments' && <EnrollmentsTab courseId={courseId} />}
        {activeTab === 'exams' && <ExamsTab courseId={courseId} course={course} onRefresh={() => void loadCourse()} />}
        {activeTab === 'settings' && <SettingsTab course={course} onRefresh={() => void loadCourse()} />}
      </div>
    </div>
  );
}
