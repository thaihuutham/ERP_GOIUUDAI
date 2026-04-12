import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma, ElearningQuestionTag } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';

type DailyQuizQuestion = {
  questionId: string;
  questionText: string;
  options: { optionId: string; optionText: string }[];
};

type DailyQuizSessionData = {
  questions: DailyQuizQuestion[];
  submittedAnswers?: Record<string, string>;
};

@Injectable()
export class DailyQuizService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  /**
   * Check if the current employee has completed the daily quiz today.
   * Returns { required, completed, sessionId? }
   */
  async check(employeeId: string): Promise<{ required: boolean; completed: boolean; sessionId?: string }> {
    const settings = await this.getElearningSettings();
    if (!settings.dailyQuiz.enabled) {
      return { required: false, completed: true };
    }

    // Check if role is bypassed
    // (bypass check would need auth context; for now we skip role bypass at service level)

    const today = this.todayDate();
    const session = await this.prisma.client.dailyQuizSession.findFirst({
      where: { employeeId, quizDate: today }
    });

    if (!session) {
      return { required: true, completed: false };
    }

    return {
      required: true,
      completed: session.completed,
      sessionId: session.id
    };
  }

  /**
   * Start or resume today's daily quiz for an employee.
   * If a session exists and is incomplete, return it.
   * If no session, create one with 2 random questions by position.
   */
  async start(employeeId: string) {
    const settings = await this.getElearningSettings();
    if (!settings.dailyQuiz.enabled) {
      return { required: false };
    }

    const today = this.todayDate();

    // Check existing session
    const existing = await this.prisma.client.dailyQuizSession.findFirst({
      where: { employeeId, quizDate: today }
    });

    if (existing) {
      if (existing.completed) {
        return {
          sessionId: existing.id,
          completed: true,
          score: existing.score,
          questions: (existing.questionsJson as DailyQuizSessionData).questions
        };
      }
      // Return incomplete session (persistent quiz)
      return {
        sessionId: existing.id,
        completed: false,
        questions: (existing.questionsJson as DailyQuizSessionData).questions
      };
    }

    // Get employee info for position/department filtering
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId },
      select: { positionId: true, departmentId: true, position: true }
    });

    // Build question filter by position/department
    const questionCount = settings.dailyQuiz.questionCount ?? 2;
    const questions = await this.getRandomQuestions(
      questionCount,
      employee?.positionId ?? null,
      employee?.departmentId ?? null
    );

    if (questions.length === 0) {
      return { required: false, reason: 'Ngân hàng câu hỏi trống.' };
    }

    const tenantId = this.prisma.getTenantId();
    const sessionData: DailyQuizSessionData = {
      questions: questions.map((q) => ({
        questionId: q.id,
        questionText: q.questionText,
        options: q.options.map((o) => ({
          optionId: o.id,
          optionText: o.optionText
        }))
      }))
    };

    const session = await this.prisma.client.dailyQuizSession.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        quizDate: today,
        questionsJson: sessionData as unknown as Prisma.InputJsonObject,
        completed: false
      }
    });

    return {
      sessionId: session.id,
      completed: false,
      questions: sessionData.questions
    };
  }

  /**
   * Submit daily quiz answers.
   * Returns score + correct answers for display.
   */
  async submit(sessionId: string, answers: Record<string, string>) {
    const session = await this.prisma.client.dailyQuizSession.findFirst({
      where: { id: sessionId }
    });
    if (!session) throw new NotFoundException('Phiên trắc nghiệm không tồn tại.');
    if (session.completed) throw new BadRequestException('Bài trắc nghiệm đã được nộp.');

    const sessionData = session.questionsJson as unknown as DailyQuizSessionData;
    const questionIds = sessionData.questions.map((q) => q.questionId);

    // Get correct answers
    const correctOptions = await this.prisma.client.elearningQuestionOption.findMany({
      where: { questionId: { in: questionIds }, isCorrect: true }
    });
    const correctMap = new Map<string, string>();
    for (const opt of correctOptions) {
      correctMap.set(opt.questionId, opt.id);
    }

    // Get explanations
    const questionDetails = await this.prisma.client.elearningQuestion.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, explanation: true }
    });
    const explanationMap = new Map(questionDetails.map((q) => [q.id, q.explanation]));

    // Grade: each question worth 50% (for 2 questions)
    const totalQuestions = sessionData.questions.length;
    let correctCount = 0;
    for (const q of sessionData.questions) {
      const selectedId = answers[q.questionId];
      const correctId = correctMap.get(q.questionId);
      if (selectedId && selectedId === correctId) {
        correctCount++;
      }
    }

    const score = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    // Update session
    const updatedData: DailyQuizSessionData = {
      ...sessionData,
      submittedAnswers: answers
    };

    await this.prisma.client.dailyQuizSession.updateMany({
      where: { id: sessionId },
      data: {
        questionsJson: updatedData as unknown as Prisma.InputJsonObject,
        score,
        completed: true,
        completedAt: new Date()
      }
    });

    // Build result with correct answers for display
    const results = sessionData.questions.map((q) => ({
      questionId: q.questionId,
      questionText: q.questionText,
      options: q.options,
      selectedOptionId: answers[q.questionId] ?? null,
      correctOptionId: correctMap.get(q.questionId) ?? null,
      isCorrect: answers[q.questionId] === correctMap.get(q.questionId),
      explanation: explanationMap.get(q.questionId) ?? null
    }));

    return {
      sessionId,
      score,
      totalQuestions,
      correctCount,
      results
    };
  }

  /**
   * Get daily quiz stats for an employee (personal) or all employees (admin).
   */
  async getStats(query: {
    employeeId?: string;
    period?: 'week' | 'month' | 'quarter' | 'year';
  }) {
    const now = new Date();
    let startDate: Date;

    switch (query.period) {
      case 'week': {
        const dayOfWeek = now.getDay() || 7;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek + 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'quarter': {
        const currentMonth = now.getMonth();
        const quarterStart = currentMonth - (currentMonth % 3);
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      }
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const where: Prisma.DailyQuizSessionWhereInput = {
      completed: true,
      quizDate: { gte: startDate },
      ...(query.employeeId ? { employeeId: query.employeeId } : {})
    };

    const sessions = await this.prisma.client.dailyQuizSession.findMany({
      where,
      orderBy: { quizDate: 'desc' },
      take: 500
    });

    const totalSessions = sessions.length;
    const totalScore = sessions.reduce((sum, s) => sum + (s.score ?? 0), 0);
    const averageScore = totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0;
    const perfectScores = sessions.filter((s) => s.score === 100).length;
    const zeroScores = sessions.filter((s) => s.score === 0).length;

    return {
      period: query.period ?? 'month',
      startDate: startDate.toISOString().slice(0, 10),
      totalSessions,
      averageScore,
      perfectScores,
      zeroScores,
      sessions: sessions.map((s) => ({
        id: s.id,
        quizDate: s.quizDate,
        score: s.score,
        completedAt: s.completedAt
      }))
    };
  }

  /**
   * Company-wide daily quiz report for HR/Admin view.
   */
  async getCompanyReport(query: { period?: 'week' | 'month' | 'quarter' | 'year' }) {
    const stats = await this.getStats({ period: query.period });

    // Group by employee
    const sessions = await this.prisma.client.dailyQuizSession.findMany({
      where: {
        completed: true,
        quizDate: { gte: new Date(stats.startDate) }
      },
      select: {
        employeeId: true,
        score: true,
        quizDate: true
      },
      orderBy: { quizDate: 'desc' },
      take: 2000
    });

    const byEmployee = new Map<string, { total: number; sumScore: number }>();
    for (const s of sessions) {
      const entry = byEmployee.get(s.employeeId) ?? { total: 0, sumScore: 0 };
      entry.total += 1;
      entry.sumScore += s.score ?? 0;
      byEmployee.set(s.employeeId, entry);
    }

    const employeeStats = Array.from(byEmployee.entries()).map(([employeeId, data]) => ({
      employeeId,
      totalQuizzes: data.total,
      averageScore: data.total > 0 ? Math.round(data.sumScore / data.total) : 0
    }));

    return {
      ...stats,
      employeeStats: employeeStats.sort((a, b) => b.averageScore - a.averageScore)
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async getRandomQuestions(count: number, positionId: string | null, departmentId: string | null) {
    // Strategy: try position-specific first, then department-specific, then GENERAL
    const where: Prisma.ElearningQuestionWhereInput = {
      status: GenericStatus.ACTIVE,
      OR: [
        ...(positionId ? [{ positionId }] : []),
        ...(departmentId ? [{ departmentId }] : []),
        { tags: { has: ElearningQuestionTag.GENERAL } },
        { positionId: null, departmentId: null }
      ]
    };

    const totalCount = await this.prisma.client.elearningQuestion.count({ where });
    if (totalCount === 0) return [];

    // Random offset approach for better randomness
    const maxSkip = Math.max(0, totalCount - count);
    const skip = Math.floor(Math.random() * (maxSkip + 1));

    const questions = await this.prisma.client.elearningQuestion.findMany({
      where,
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      skip,
      take: count
    });

    return questions;
  }

  private async getElearningSettings() {
    try {
      const envelope = await this.runtimeSettings.getDomainEnvelope('elearning_policies');
      const settings = (envelope?.data ?? {}) as Record<string, any>;
      return {
        dailyQuiz: {
          enabled: settings?.dailyQuiz?.enabled ?? false,
          questionCount: settings?.dailyQuiz?.questionCount ?? 2,
          positionMapping: settings?.dailyQuiz?.positionMapping ?? true,
          bypassRoles: settings?.dailyQuiz?.bypassRoles ?? ['ADMIN']
        }
      };
    } catch {
      return {
        dailyQuiz: {
          enabled: false,
          questionCount: 2,
          positionMapping: true,
          bypassRoles: ['ADMIN']
        }
      };
    }
  }

  private todayDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
