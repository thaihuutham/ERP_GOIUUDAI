'use client';

import { Award, CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { InfoTip } from './ui/info-tip';

type QuizQuestion = {
  questionId: string;
  questionText: string;
  options: { optionId: string; optionText: string }[];
};

type QuizStartResponse = {
  sessionId?: string;
  completed?: boolean;
  required?: boolean;
  reason?: string;
  score?: number;
  questions?: QuizQuestion[];
};

type QuizResult = {
  questionId: string;
  questionText: string;
  options: { optionId: string; optionText: string }[];
  selectedOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean;
  explanation: string | null;
};

type QuizSubmitResponse = {
  sessionId: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  results: QuizResult[];
};

type DailyQuizGateProps = {
  userEmail: string;
  onComplete: () => void;
};

export function DailyQuizGate({ userEmail, onComplete }: DailyQuizGateProps) {
  const [phase, setPhase] = useState<'loading' | 'quiz' | 'result'>('loading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startQuiz = useCallback(async () => {
    try {
      const data = await apiRequest<QuizStartResponse>('/elearning/daily-quiz/start', {
        query: { email: userEmail }
      });

      if (!data.required) {
        onComplete();
        return;
      }

      if (data.completed) {
        onComplete();
        return;
      }

      if (data.sessionId && data.questions) {
        setSessionId(data.sessionId);
        setQuestions(data.questions);
        setPhase('quiz');
      } else {
        // No questions available
        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải bài trắc nghiệm.');
    }
  }, [userEmail, onComplete]);

  useEffect(() => {
    void startQuiz();
  }, [startQuiz]);

  const handleSelectAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    const unanswered = questions.filter((q) => !answers[q.questionId]);
    if (unanswered.length > 0) {
      setError('Vui lòng trả lời tất cả câu hỏi.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const data = await apiRequest<QuizSubmitResponse>('/elearning/daily-quiz/submit', {
        method: 'POST',
        body: { sessionId, answers }
      });
      setResult(data);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi nộp bài.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 100) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
  };

  if (phase === 'loading') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center' }}>
          <Clock size={36} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Đang tải bài trắc nghiệm hàng ngày...</div>
          {error && (
            <div style={{ marginTop: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'result' && result) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        overflow: 'auto'
      }}>
        <div style={{
          width: '100%',
          maxWidth: 560,
          padding: '2rem',
          margin: '2rem',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--line)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
        }}>
          {/* Score header */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <Award size={40} style={{ color: getScoreColor(result.score), marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: getScoreColor(result.score) }}>
              {result.score}%
            </div>
             <div style={{ fontSize: '0.85rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
              {result.correctCount}/{result.totalQuestions} câu đúng
              <InfoTip
                title="Cách tính điểm"
                content="Điểm được tính theo số câu trả lời đúng:
• 0% — Sai hết
• 50% — Đúng một nửa
• 100% — Đúng hết tất cả

Kết quả sẽ được lưu lại và thống kê theo tuần, tháng, quý, năm."
              />
            </div>
          </div>

          {/* Results detail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {result.results.map((r, idx) => (
              <div
                key={r.questionId}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${r.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
                  background: r.isCorrect
                    ? 'color-mix(in srgb, var(--success) 5%, var(--surface))'
                    : 'color-mix(in srgb, var(--danger) 5%, var(--surface))'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {r.isCorrect
                    ? <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                    : <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />}
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Câu {idx + 1}: {r.questionText}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginLeft: '1.5rem' }}>
                  {r.options.map((opt) => {
                    const isSelected = opt.optionId === r.selectedOptionId;
                    const isCorrect = opt.optionId === r.correctOptionId;
                    return (
                      <div
                        key={opt.optionId}
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: isCorrect ? 600 : 400,
                          color: isCorrect
                            ? 'var(--success)'
                            : isSelected && !isCorrect
                              ? 'var(--danger)'
                              : 'var(--foreground)',
                          background: isCorrect
                            ? 'color-mix(in srgb, var(--success) 10%, var(--surface))'
                            : isSelected && !isCorrect
                              ? 'color-mix(in srgb, var(--danger) 10%, var(--surface))'
                              : 'transparent'
                        }}
                      >
                        {isCorrect ? '✓ ' : isSelected && !isCorrect ? '✗ ' : '  '}
                        {opt.optionText}
                      </div>
                    );
                  })}
                </div>

                {r.explanation && (
                  <div style={{ marginTop: '0.5rem', marginLeft: '1.5rem', fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    💡 {r.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onComplete}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Tiếp tục vào hệ thống
          </button>
        </div>
      </div>
    );
  }

  // Quiz phase
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--background)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      overflow: 'auto'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        padding: '2rem',
        margin: '2rem',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <HelpCircle size={36} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
            Trắc nghiệm hàng ngày
            <InfoTip
              title="Trắc nghiệm hàng ngày là gì?"
              content="Mỗi ngày khi đăng nhập, bạn cần trả lời một vài câu hỏi ngắn liên quan đến công việc. Câu hỏi được lấy ngẫu nhiên từ ngân hàng câu hỏi phù hợp với vị trí của bạn. Kết quả sẽ được lưu lại để theo dõi quá trình học tập."
            />
          </h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Trả lời {questions.length} câu hỏi để tiếp tục vào hệ thống
          </p>
        </div>

        {error && (
          <div style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '1rem',
            background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: '0.8rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {questions.map((q, idx) => (
            <div key={q.questionId}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.5rem' }}>
                Câu {idx + 1}: {q.questionText}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {q.options.map((opt) => {
                  const selected = answers[q.questionId] === opt.optionId;
                  return (
                    <button
                      key={opt.optionId}
                      type="button"
                      onClick={() => handleSelectAnswer(q.questionId, opt.optionId)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: `2px solid ${selected ? 'var(--primary)' : 'var(--line)'}`,
                        background: selected ? 'color-mix(in srgb, var(--primary) 8%, var(--surface))' : 'var(--surface)',
                        cursor: 'pointer',
                        fontSize: '0.83rem',
                        fontWeight: selected ? 600 : 400,
                        transition: 'all 0.15s ease',
                        color: 'var(--foreground)'
                      }}
                    >
                      {opt.optionText}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {Object.keys(answers).length}/{questions.length} đã trả lời
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>
    </div>
  );
}
