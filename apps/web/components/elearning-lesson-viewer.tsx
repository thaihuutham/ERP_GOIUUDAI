'use client';

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Image,
  Link2,
  MessageSquare,
  PlayCircle,
  Send,
  Video
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { InfoTip } from './ui/info-tip';
import { Badge, statusToBadge } from './ui';

// ─── Types ──────────────────────────────────────────────────────────

type Lesson = {
  id: string;
  title: string;
  contentType?: string;
  contentUrl?: string | null;
  contentFileId?: string | null;
  contentHtml?: string | null;
  description?: string | null;
  sortOrder?: number;
  durationMinutes?: number | null;
  status?: string;
};

type Section = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: Lesson[];
};

type CourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
  sections?: Section[];
  lessons?: Lesson[];
};

type LessonProgress = {
  lessonId: string;
  completed: boolean;
};

type Comment = {
  id: string;
  lessonId: string;
  employeeId: string;
  content: string;
  createdAt: string;
  parentId?: string | null;
};

type LessonViewerProps = {
  courseId: string;
  employeeId?: string;
  onBack: () => void;
};

// ─── Content type icon map ──────────────────────────────────────────

const CONTENT_ICON: Record<string, React.ReactNode> = {
  VIDEO: <Video size={15} style={{ color: 'var(--danger)' }} />,
  DOCUMENT: <FileText size={15} style={{ color: 'var(--info)' }} />,
  INFOGRAPHIC: <Image size={15} style={{ color: 'var(--success)' }} />,
  SLIDE: <FileText size={15} style={{ color: 'var(--warning)' }} />,
  EXTERNAL_LINK: <Link2 size={15} style={{ color: 'var(--primary)' }} />,
  QUIZ: <BookOpen size={15} style={{ color: 'var(--primary)' }} />
};

const CONTENT_LABEL: Record<string, string> = {
  VIDEO: 'Video',
  DOCUMENT: 'Tài liệu',
  INFOGRAPHIC: 'Hình ảnh minh họa',
  SLIDE: 'Trình chiếu',
  EXTERNAL_LINK: 'Liên kết ngoài',
  QUIZ: 'Bài kiểm tra'
};

// ─── Content Viewer (per content type) ──────────────────────────────

function LessonContent({ lesson }: { lesson: Lesson }) {
  const type = (lesson.contentType ?? '').toUpperCase();
  const url = lesson.contentUrl?.trim();

  if (type === 'VIDEO' && url) {
    // Auto-detect YouTube/Vimeo for embed
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      return (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeMatch[1]}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={lesson.title}
          />
        </div>
      );
    }

    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <iframe
            src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen"
            allowFullScreen
            title={lesson.title}
          />
        </div>
      );
    }

    // Generic video
    return (
      <video
        controls
        style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
        src={url}
      >
        Trình duyệt không hỗ trợ phát video.
      </video>
    );
  }

  if (type === 'DOCUMENT' && (url || lesson.contentFileId)) {
    const fileUrl = url || `/api/v1/files/${lesson.contentFileId}`;
    return (
      <div style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--surface)'
      }}>
        <iframe
          src={fileUrl}
          style={{ width: '100%', height: 600, border: 'none' }}
          title={lesson.title}
        />
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={14} style={{ color: 'var(--info)' }} />
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--info)' }}>
            Tải tài liệu về máy
          </a>
        </div>
      </div>
    );
  }

  if (type === 'INFOGRAPHIC' && (url || lesson.contentFileId)) {
    const imgUrl = url || `/api/v1/files/${lesson.contentFileId}`;
    return (
      <div style={{ textAlign: 'center' }}>
        <img
          src={imgUrl}
          alt={lesson.title}
          style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}
        />
      </div>
    );
  }

  if (type === 'SLIDE' && (url || lesson.contentFileId)) {
    const slideUrl = url || `/api/v1/files/${lesson.contentFileId}`;
    return (
      <div style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden'
      }}>
        <iframe
          src={slideUrl}
          style={{ width: '100%', height: 500, border: 'none' }}
          title={lesson.title}
        />
      </div>
    );
  }

  if (type === 'EXTERNAL_LINK' && url) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--primary) 5%, var(--surface))'
      }}>
        <Link2 size={32} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
        <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--muted)' }}>
          Nội dung bài học được liên kết từ trang bên ngoài.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <ExternalLink size={14} /> Mở liên kết
        </a>
      </div>
    );
  }

  // Fallback: HTML content or no content
  if (lesson.contentHtml) {
    return (
      <div
        style={{
          padding: '1.25rem',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface)',
          fontSize: '0.88rem',
          lineHeight: 1.7
        }}
        dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
      />
    );
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
      <BookOpen size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
      <p style={{ fontSize: '0.85rem' }}>Bài học chưa có nội dung.</p>
    </div>
  );
}

// ─── Comment Section ────────────────────────────────────────────────

function CommentSection({ lessonId }: { lessonId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await apiRequest<any>(`/elearning/lessons/${lessonId}/comments`);
      setComments(normalizeListPayload(payload) as Comment[]);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const handleSend = async () => {
    if (!newComment.trim() || isSending) return;
    setIsSending(true);
    try {
      await apiRequest(`/elearning/lessons/${lessonId}/comments`, {
        method: 'POST',
        body: { content: newComment.trim() }
      });
      setNewComment('');
      await loadComments();
    } catch {
      // silent
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{
      marginTop: '1.5rem',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '0.75rem 1rem',
        background: 'color-mix(in srgb, var(--primary) 4%, var(--surface))',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        fontWeight: 600
      }}>
        <MessageSquare size={15} />
        Hỏi đáp & thảo luận
        <InfoTip
          title="Hỏi đáp bài học"
          content="Bạn có thể đặt câu hỏi hoặc thảo luận về nội dung bài học tại đây. Người tạo khóa học sẽ trả lời câu hỏi của bạn."
        />
      </div>

      <div style={{ padding: '1rem', maxHeight: 300, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '1rem' }}>Đang tải...</div>
        ) : comments.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '1rem' }}>
            Chưa có bình luận nào. Hãy đặt câu hỏi nếu bạn cần hỗ trợ!
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} style={{
              padding: '0.6rem 0',
              borderBottom: '1px solid var(--line)',
              fontSize: '0.82rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  {c.employeeId?.slice(-6) || 'Ẩn danh'}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                  {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <div style={{ color: 'var(--foreground)' }}>{c.content}</div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <input
          className="input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Nhập câu hỏi hoặc góp ý..."
          onKeyDown={(e) => e.key === 'Enter' && void handleSend()}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSend()}
          disabled={isSending || !newComment.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <Send size={14} /> Gửi
        </button>
      </div>
    </div>
  );
}

// ─── Main Lesson Viewer ─────────────────────────────────────────────

export function ElearningLessonViewer({ courseId, employeeId, onBack }: LessonViewerProps) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  const loadCourse = useCallback(async () => {
    setIsLoading(true);
    try {
      const [courseData, progressData] = await Promise.all([
        apiRequest<CourseDetail>(`/elearning/courses/${courseId}`),
        employeeId
          ? apiRequest<any>(`/elearning/my/progress`, { query: { courseId, employeeId } })
          : Promise.resolve(null)
      ]);
      setCourse(courseData);

      // Auto-expand all sections
      const sectionIds = (courseData.sections ?? []).map((s) => s.id);
      setExpandedSections(new Set(sectionIds));

      // Load completed lessons
      if (progressData) {
        const completed = (normalizeListPayload(progressData) as LessonProgress[])
          .filter((p) => p.completed)
          .map((p) => p.lessonId);
        setCompletedLessons(new Set(completed));
      }

      // Auto-select first lesson
      const firstSection = (courseData.sections ?? [])[0];
      const firstLesson = firstSection?.lessons?.[0] ?? (courseData.lessons ?? [])[0];
      if (firstLesson) {
        setSelectedLesson(firstLesson);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [courseId, employeeId]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  // Flatten all lessons for navigation
  const allLessons = useMemo(() => {
    if (!course) return [];
    if (course.sections && course.sections.length > 0) {
      return course.sections.flatMap((s) => s.lessons ?? []);
    }
    return course.lessons ?? [];
  }, [course]);

  const currentIndex = useMemo(() => {
    if (!selectedLesson) return -1;
    return allLessons.findIndex((l) => l.id === selectedLesson.id);
  }, [allLessons, selectedLesson]);

  const progressPercent = useMemo(() => {
    if (allLessons.length === 0) return 0;
    return Math.round((completedLessons.size / allLessons.length) * 100);
  }, [allLessons, completedLessons]);

  const handleComplete = async () => {
    if (!selectedLesson || isCompleting) return;
    setIsCompleting(true);
    try {
      await apiRequest(`/elearning/lessons/${selectedLesson.id}/complete`, { method: 'POST' });
      setCompletedLessons((prev) => new Set([...prev, selectedLesson.id]));
    } catch {
      // silent
    } finally {
      setIsCompleting(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
        Đang tải khóa học...
      </div>
    );
  }

  if (!course) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>Không tìm thấy khóa học.</p>
        <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginTop: '1rem' }}>
          <ArrowLeft size={14} /> Quay lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar — Table of Contents */}
      <div style={{
        width: 300,
        minWidth: 260,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        background: 'color-mix(in srgb, var(--primary) 2%, var(--surface))',
        overflow: 'hidden'
      }}>
        {/* Course header */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              fontSize: '0.75rem',
              padding: 0,
              marginBottom: '0.5rem'
            }}
          >
            <ArrowLeft size={12} /> Quay lại danh sách
          </button>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.3 }}>
            {course.title}
          </h3>

          {/* Progress bar */}
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                Tiến độ
                <InfoTip
                  title="Tiến độ học tập"
                  content="Thanh này thể hiện phần trăm bài học bạn đã hoàn thành trong khóa học. Bấm nút 'Tôi đã học xong' sau khi đọc xong mỗi bài để cập nhật tiến độ."
                />
              </span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{progressPercent}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: 'var(--success)',
                borderRadius: 3,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>

        {/* Lessons list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0' }}>
          {(course.sections ?? []).length > 0 ? (
            (course.sections ?? []).map((section) => (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    textAlign: 'left'
                  }}
                >
                  {expandedSections.has(section.id)
                    ? <ChevronDown size={13} />
                    : <ChevronRight size={13} />}
                  {section.title}
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {section.lessons?.length ?? 0} bài
                  </span>
                </button>

                {expandedSections.has(section.id) && (
                  <div>
                    {(section.lessons ?? []).map((lesson) => {
                      const isActive = selectedLesson?.id === lesson.id;
                      const isDone = completedLessons.has(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => setSelectedLesson(lesson)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.55rem 1rem 0.55rem 2rem',
                            background: isActive ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))' : 'transparent',
                            border: 'none',
                            borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            color: isActive ? 'var(--primary)' : 'var(--foreground)',
                            fontWeight: isActive ? 600 : 400,
                            textAlign: 'left',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          {isDone
                            ? <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                            : (CONTENT_ICON[(lesson.contentType ?? '').toUpperCase()] || <BookOpen size={14} style={{ flexShrink: 0 }} />)}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lesson.title}
                          </span>
                          {lesson.durationMinutes && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', flexShrink: 0 }}>
                              {lesson.durationMinutes}p
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          ) : (
            (course.lessons ?? []).map((lesson) => {
              const isActive = selectedLesson?.id === lesson.id;
              const isDone = completedLessons.has(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setSelectedLesson(lesson)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.55rem 1rem',
                    background: isActive ? 'color-mix(in srgb, var(--primary) 10%, var(--surface))' : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    color: isActive ? 'var(--primary)' : 'var(--foreground)',
                    fontWeight: isActive ? 600 : 400,
                    textAlign: 'left'
                  }}
                >
                  {isDone
                    ? <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    : (CONTENT_ICON[(lesson.contentType ?? '').toUpperCase()] || <BookOpen size={14} />)}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lesson.title}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        {selectedLesson ? (
          <>
            {/* Lesson header */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {CONTENT_ICON[(selectedLesson.contentType ?? '').toUpperCase()]}
                <Badge variant="neutral">{CONTENT_LABEL[(selectedLesson.contentType ?? '').toUpperCase()] || selectedLesson.contentType}</Badge>
                {selectedLesson.durationMinutes && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    ⏱ {selectedLesson.durationMinutes} phút
                  </span>
                )}
                {completedLessons.has(selectedLesson.id) && (
                  <Badge variant="success">✓ Đã hoàn thành</Badge>
                )}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                {selectedLesson.title}
              </h2>
              {selectedLesson.description && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {selectedLesson.description}
                </p>
              )}
            </div>

            {/* Content */}
            <LessonContent lesson={selectedLesson} />

            {/* Complete button */}
            {!completedLessons.has(selectedLesson.id) && (
              <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleComplete()}
                  disabled={isCompleting}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <CheckCircle2 size={15} />
                  {isCompleting ? 'Đang cập nhật...' : 'Tôi đã học xong bài này'}
                </button>
                <InfoTip
                  title="Đánh dấu hoàn thành"
                  content="Bấm nút này sau khi bạn đã xem/đọc hết nội dung bài học. Hệ thống sẽ ghi nhận tiến độ của bạn. Bạn chỉ cần bấm 1 lần, hệ thống sẽ tự lưu."
                />
              </div>
            )}

            {/* Navigation buttons */}
            <div style={{
              marginTop: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '1rem',
              borderTop: '1px solid var(--line)'
            }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={currentIndex <= 0}
                onClick={() => currentIndex > 0 && setSelectedLesson(allLessons[currentIndex - 1])}
                style={{ fontSize: '0.8rem' }}
              >
                ← Bài trước
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={currentIndex >= allLessons.length - 1}
                onClick={() => currentIndex < allLessons.length - 1 && setSelectedLesson(allLessons[currentIndex + 1])}
                style={{ fontSize: '0.8rem' }}
              >
                Bài tiếp theo →
              </button>
            </div>

            {/* Comments */}
            <CommentSection lessonId={selectedLesson.id} />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
            <BookOpen size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p style={{ fontSize: '0.9rem' }}>Chọn một bài học từ danh sách bên trái để bắt đầu.</p>
          </div>
        )}
      </div>
    </div>
  );
}
