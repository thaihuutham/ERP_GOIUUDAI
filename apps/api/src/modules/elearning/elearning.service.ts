import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ElearningContentType,
  ElearningEnrollmentStatus,
  ElearningQuestionTag,
  GenericStatus,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';

type ElearningPayload = Record<string, unknown>;

@Injectable()
export class ElearningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  // ─── Courses ─────────────────────────────────────────────────────

  async listCourses(query: { q?: string; status?: string; limit?: number }) {
    const keyword = query.q?.trim();
    const where: Prisma.ElearningCourseWhereInput = {
      ...(query.status ? { status: query.status as GenericStatus } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    return this.prisma.client.elearningCourse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
      include: {
        _count: { select: { sections: true, lessons: true, enrollments: true } }
      }
    });
  }

  async getCourse(id: string) {
    const course = await this.prisma.client.elearningCourse.findFirst({
      where: { id },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                contentType: true,
                sortOrder: true,
                durationMinutes: true,
                status: true
              }
            }
          }
        },
        exams: { orderBy: { createdAt: 'desc' } },
        _count: { select: { enrollments: true, certificates: true } }
      }
    });
    if (!course) throw new NotFoundException('Khóa học không tồn tại.');
    return course;
  }

  async createCourse(payload: ElearningPayload) {
    const tenantId = this.prisma.getTenantId();
    const title = this.toString(payload.title);
    if (!title) throw new BadRequestException('Thiếu tên khóa học.');

    return this.prisma.client.elearningCourse.create({
      data: {
        tenant_Id: tenantId,
        title,
        slug: this.toSlug(title),
        description: this.toNullable(payload.description),
        coverImageUrl: this.toNullable(payload.coverImageUrl),
        tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
        enrollPolicy: this.toNullable(payload.enrollPolicy) ?? 'INVITE',
        status: GenericStatus.DRAFT,
        createdBy: this.toNullable(payload.createdBy)
      }
    });
  }

  async updateCourse(id: string, payload: ElearningPayload) {
    await this.ensureCourseExists(id);
    await this.prisma.client.elearningCourse.updateMany({
      where: { id },
      data: {
        ...(payload.title ? { title: String(payload.title) } : {}),
        ...(payload.description !== undefined ? { description: this.toNullable(payload.description) } : {}),
        ...(payload.coverImageUrl !== undefined ? { coverImageUrl: this.toNullable(payload.coverImageUrl) } : {}),
        ...(Array.isArray(payload.tags) ? { tags: payload.tags.map(String) } : {}),
        ...(payload.enrollPolicy ? { enrollPolicy: String(payload.enrollPolicy) } : {}),
        ...(payload.status ? { status: payload.status as GenericStatus } : {})
      }
    });
    return this.prisma.client.elearningCourse.findFirst({ where: { id } });
  }

  async publishCourse(id: string) {
    await this.ensureCourseExists(id);
    await this.prisma.client.elearningCourse.updateMany({
      where: { id },
      data: { status: GenericStatus.ACTIVE, publishedAt: new Date() }
    });
    return this.prisma.client.elearningCourse.findFirst({ where: { id } });
  }

  async archiveCourse(id: string) {
    await this.ensureCourseExists(id);
    await this.prisma.client.elearningCourse.updateMany({
      where: { id },
      data: { status: GenericStatus.ARCHIVED }
    });
    return this.prisma.client.elearningCourse.findFirst({ where: { id } });
  }

  // ─── Sections ────────────────────────────────────────────────────

  async createSection(courseId: string, payload: ElearningPayload) {
    const tenantId = this.prisma.getTenantId();
    await this.ensureCourseExists(courseId);
    const title = this.toString(payload.title);
    if (!title) throw new BadRequestException('Thiếu tên phân vùng.');

    const maxSort = await this.prisma.client.elearningSection.aggregate({
      where: { courseId },
      _max: { sortOrder: true }
    });

    return this.prisma.client.elearningSection.create({
      data: {
        tenant_Id: tenantId,
        courseId,
        title,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1
      }
    });
  }

  async updateSection(id: string, payload: ElearningPayload) {
    await this.prisma.client.elearningSection.updateMany({
      where: { id },
      data: {
        ...(payload.title ? { title: String(payload.title) } : {}),
        ...(typeof payload.sortOrder === 'number' ? { sortOrder: payload.sortOrder } : {})
      }
    });
    return this.prisma.client.elearningSection.findFirst({ where: { id } });
  }

  async deleteSection(id: string) {
    return this.prisma.client.elearningSection.deleteMany({ where: { id } });
  }

  // ─── Lessons ─────────────────────────────────────────────────────

  async createLesson(courseId: string, payload: ElearningPayload) {
    const tenantId = this.prisma.getTenantId();
    await this.ensureCourseExists(courseId);
    const title = this.toString(payload.title);
    if (!title) throw new BadRequestException('Thiếu tên bài học.');

    const contentType = this.normalizeContentType(payload.contentType);

    const maxSort = await this.prisma.client.elearningLesson.aggregate({
      where: { courseId, sectionId: this.toNullable(payload.sectionId) ?? undefined },
      _max: { sortOrder: true }
    });

    return this.prisma.client.elearningLesson.create({
      data: {
        tenant_Id: tenantId,
        courseId,
        sectionId: this.toNullable(payload.sectionId),
        title,
        contentType,
        contentUrl: this.toNullable(payload.contentUrl),
        contentFileId: this.toNullable(payload.contentFileId),
        contentHtml: this.toNullable(payload.contentHtml),
        description: this.toNullable(payload.description),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        durationMinutes: typeof payload.durationMinutes === 'number' ? payload.durationMinutes : null,
        status: GenericStatus.DRAFT
      }
    });
  }

  async updateLesson(id: string, payload: ElearningPayload) {
    await this.prisma.client.elearningLesson.updateMany({
      where: { id },
      data: {
        ...(payload.title ? { title: String(payload.title) } : {}),
        ...(payload.sectionId !== undefined ? { sectionId: this.toNullable(payload.sectionId) } : {}),
        ...(payload.contentType ? { contentType: this.normalizeContentType(payload.contentType) } : {}),
        ...(payload.contentUrl !== undefined ? { contentUrl: this.toNullable(payload.contentUrl) } : {}),
        ...(payload.contentFileId !== undefined ? { contentFileId: this.toNullable(payload.contentFileId) } : {}),
        ...(payload.contentHtml !== undefined ? { contentHtml: this.toNullable(payload.contentHtml) } : {}),
        ...(payload.description !== undefined ? { description: this.toNullable(payload.description) } : {}),
        ...(typeof payload.sortOrder === 'number' ? { sortOrder: payload.sortOrder } : {}),
        ...(typeof payload.durationMinutes === 'number' ? { durationMinutes: payload.durationMinutes } : {}),
        ...(payload.status ? { status: payload.status as GenericStatus } : {})
      }
    });
    return this.prisma.client.elearningLesson.findFirst({ where: { id } });
  }

  async deleteLesson(id: string) {
    return this.prisma.client.elearningLesson.deleteMany({ where: { id } });
  }

  async getLesson(id: string) {
    const lesson = await this.prisma.client.elearningLesson.findFirst({
      where: { id },
      include: {
        lessonQuestions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: { options: { orderBy: { sortOrder: 'asc' } } }
            }
          }
        }
      }
    });
    if (!lesson) throw new NotFoundException('Bài học không tồn tại.');
    return lesson;
  }

  // ─── Questions ───────────────────────────────────────────────────

  async listQuestions(query: { q?: string; tag?: string; positionId?: string; departmentId?: string; limit?: number }) {
    const keyword = query.q?.trim();
    const where: Prisma.ElearningQuestionWhereInput = {
      status: GenericStatus.ACTIVE,
      ...(query.tag ? { tags: { has: query.tag as ElearningQuestionTag } } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(keyword
        ? { questionText: { contains: keyword, mode: 'insensitive' } }
        : {})
    };

    return this.prisma.client.elearningQuestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
      include: {
        options: { orderBy: { sortOrder: 'asc' } }
      }
    });
  }

  async createQuestion(payload: ElearningPayload) {
    const tenantId = this.prisma.getTenantId();
    const questionText = this.toString(payload.questionText);
    if (!questionText) throw new BadRequestException('Thiếu nội dung câu hỏi.');

    const options = Array.isArray(payload.options) ? payload.options : [];
    if (options.length < 2) throw new BadRequestException('Cần ít nhất 2 đáp án.');

    const hasCorrect = options.some((opt: any) => opt.isCorrect === true);
    if (!hasCorrect) throw new BadRequestException('Cần ít nhất 1 đáp án đúng.');

    const tags = this.normalizeQuestionTags(payload.tags);

    return this.prisma.client.elearningQuestion.create({
      data: {
        tenant_Id: tenantId,
        questionText,
        explanation: this.toNullable(payload.explanation),
        tags,
        positionId: this.toNullable(payload.positionId),
        departmentId: this.toNullable(payload.departmentId),
        points: typeof payload.points === 'number' ? payload.points : 1,
        createdBy: this.toNullable(payload.createdBy),
        options: {
          create: options.map((opt: any, idx: number) => ({
            tenant_Id: tenantId,
            optionText: String(opt.optionText ?? opt.text ?? ''),
            isCorrect: opt.isCorrect === true,
            sortOrder: idx
          }))
        }
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
  }

  async updateQuestion(id: string, payload: ElearningPayload) {
    const existing = await this.prisma.client.elearningQuestion.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Câu hỏi không tồn tại.');

    await this.prisma.client.elearningQuestion.updateMany({
      where: { id },
      data: {
        ...(payload.questionText ? { questionText: String(payload.questionText) } : {}),
        ...(payload.explanation !== undefined ? { explanation: this.toNullable(payload.explanation) } : {}),
        ...(payload.tags ? { tags: this.normalizeQuestionTags(payload.tags) } : {}),
        ...(payload.positionId !== undefined ? { positionId: this.toNullable(payload.positionId) } : {}),
        ...(payload.departmentId !== undefined ? { departmentId: this.toNullable(payload.departmentId) } : {}),
        ...(typeof payload.points === 'number' ? { points: payload.points } : {}),
        ...(payload.status ? { status: payload.status as GenericStatus } : {})
      }
    });

    // Replace options if provided
    if (Array.isArray(payload.options)) {
      const tenantId = this.prisma.getTenantId();
      await this.prisma.client.elearningQuestionOption.deleteMany({ where: { questionId: id } });
      await this.prisma.client.elearningQuestionOption.createMany({
        data: (payload.options as any[]).map((opt, idx) => ({
          tenant_Id: tenantId,
          questionId: id,
          optionText: String(opt.optionText ?? opt.text ?? ''),
          isCorrect: opt.isCorrect === true,
          sortOrder: idx
        }))
      });
    }

    return this.prisma.client.elearningQuestion.findFirst({
      where: { id },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
  }

  async archiveQuestion(id: string) {
    await this.prisma.client.elearningQuestion.updateMany({
      where: { id },
      data: { status: GenericStatus.ARCHIVED }
    });
    return this.prisma.client.elearningQuestion.findFirst({ where: { id } });
  }

  // ─── Lesson ↔ Question linking ───────────────────────────────────

  async addQuestionsToLesson(lessonId: string, questionIds: string[]) {
    const tenantId = this.prisma.getTenantId();
    const lesson = await this.prisma.client.elearningLesson.findFirst({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Bài học không tồn tại.');

    const existing = await this.prisma.client.elearningLessonQuestion.findMany({
      where: { lessonId },
      select: { questionId: true }
    });
    const existingIds = new Set(existing.map((lq) => lq.questionId));
    const newIds = questionIds.filter((qid) => !existingIds.has(qid));

    if (newIds.length > 0) {
      const maxSort = await this.prisma.client.elearningLessonQuestion.aggregate({
        where: { lessonId },
        _max: { sortOrder: true }
      });
      let order = (maxSort._max.sortOrder ?? 0) + 1;
      await this.prisma.client.elearningLessonQuestion.createMany({
        data: newIds.map((qid) => ({
          tenant_Id: tenantId,
          lessonId,
          questionId: qid,
          sortOrder: order++
        }))
      });
    }

    return { added: newIds.length };
  }

  async removeQuestionFromLesson(lessonId: string, questionId: string) {
    return this.prisma.client.elearningLessonQuestion.deleteMany({
      where: { lessonId, questionId }
    });
  }

  // ─── Enrollment ──────────────────────────────────────────────────

  async enrollEmployees(courseId: string, employeeIds: string[]) {
    const tenantId = this.prisma.getTenantId();
    await this.ensureCourseExists(courseId);

    const existing = await this.prisma.client.elearningEnrollment.findMany({
      where: { courseId, employeeId: { in: employeeIds } },
      select: { employeeId: true }
    });
    const existingSet = new Set(existing.map((e) => e.employeeId));
    const newIds = employeeIds.filter((eid) => !existingSet.has(eid));

    if (newIds.length > 0) {
      await this.prisma.client.elearningEnrollment.createMany({
        data: newIds.map((eid) => ({
          tenant_Id: tenantId,
          courseId,
          employeeId: eid,
          enrollmentStatus: ElearningEnrollmentStatus.ENROLLED
        }))
      });
    }

    return { enrolled: newIds.length, skipped: existingSet.size };
  }

  async listEnrollments(query: { courseId?: string; employeeId?: string; status?: string; limit?: number }) {
    const where: Prisma.ElearningEnrollmentWhereInput = {
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { enrollmentStatus: query.status as ElearningEnrollmentStatus } : {})
    };

    return this.prisma.client.elearningEnrollment.findMany({
      where,
      orderBy: { enrolledAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
      include: {
        course: { select: { id: true, title: true, status: true } }
      }
    });
  }

  // ─── Lesson Progress ─────────────────────────────────────────────

  async completeLesson(lessonId: string, employeeId: string, quizAnswers?: Record<string, string>) {
    const lesson = await this.prisma.client.elearningLesson.findFirst({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Bài học không tồn tại.');

    const enrollment = await this.prisma.client.elearningEnrollment.findFirst({
      where: { courseId: lesson.courseId, employeeId }
    });
    if (!enrollment) throw new BadRequestException('Nhân viên chưa ghi danh khóa học này.');

    let quizScore: number | null = null;
    if (lesson.contentType === ElearningContentType.QUIZ && quizAnswers) {
      quizScore = await this.gradeQuizAnswers(lessonId, quizAnswers);
    }

    const tenantId = this.prisma.getTenantId();
    const progress = await this.prisma.client.elearningLessonProgress.upsert({
      where: {
        tenant_Id_enrollmentId_lessonId: {
          tenant_Id: tenantId,
          enrollmentId: enrollment.id,
          lessonId
        }
      },
      create: {
        tenant_Id: tenantId,
        enrollmentId: enrollment.id,
        lessonId,
        completed: true,
        completedAt: new Date(),
        quizScore,
        quizAnswersJson: quizAnswers ?? Prisma.JsonNull
      },
      update: {
        completed: true,
        completedAt: new Date(),
        ...(quizScore !== null ? { quizScore, quizAnswersJson: quizAnswers } : {})
      }
    });

    // Update enrollment progress percent
    await this.recalculateEnrollmentProgress(enrollment.id);

    return progress;
  }

  async getMyProgress(employeeId: string, courseId: string) {
    const enrollment = await this.prisma.client.elearningEnrollment.findFirst({
      where: { courseId, employeeId },
      include: {
        progress: {
          include: { lesson: { select: { id: true, title: true, contentType: true } } }
        },
        course: { select: { id: true, title: true } }
      }
    });
    return enrollment;
  }

  // ─── Exams ───────────────────────────────────────────────────────

  async createExam(courseId: string, payload: ElearningPayload) {
    const tenantId = this.prisma.getTenantId();
    await this.ensureCourseExists(courseId);
    const title = this.toString(payload.title);
    if (!title) throw new BadRequestException('Thiếu tên bài thi.');

    return this.prisma.client.elearningExam.create({
      data: {
        tenant_Id: tenantId,
        courseId,
        title,
        description: this.toNullable(payload.description),
        questionCount: typeof payload.questionCount === 'number' ? payload.questionCount : 10,
        passingScore: typeof payload.passingScore === 'number' ? payload.passingScore : 70,
        randomizeQuestions: payload.randomizeQuestions !== false,
        status: GenericStatus.ACTIVE
      }
    });
  }

  async startExam(examId: string, employeeId: string) {
    const exam = await this.prisma.client.elearningExam.findFirst({
      where: { id: examId },
      include: { course: { select: { id: true } } }
    });
    if (!exam) throw new NotFoundException('Bài thi không tồn tại.');

    // Get random questions from course's question pool
    const lessonQuestionIds = await this.prisma.client.elearningLessonQuestion.findMany({
      where: {
        lesson: { courseId: exam.courseId }
      },
      select: { questionId: true }
    });
    const questionIds = [...new Set(lessonQuestionIds.map((lq) => lq.questionId))];

    const allQuestions = await this.prisma.client.elearningQuestion.findMany({
      where: {
        id: { in: questionIds },
        status: GenericStatus.ACTIVE
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });

    // Random select
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, exam.questionCount);

    const tenantId = this.prisma.getTenantId();
    return this.prisma.client.elearningExamAttempt.create({
      data: {
        tenant_Id: tenantId,
        examId,
        employeeId,
        answersJson: {
          questions: selected.map((q) => ({
            questionId: q.id,
            questionText: q.questionText,
            options: q.options.map((o) => ({
              optionId: o.id,
              optionText: o.optionText
            }))
          }))
        },
        startedAt: new Date()
      }
    });
  }

  async submitExamAttempt(attemptId: string, answers: Record<string, string>) {
    const attempt = await this.prisma.client.elearningExamAttempt.findFirst({
      where: { id: attemptId },
      include: { exam: true }
    });
    if (!attempt) throw new NotFoundException('Lượt thi không tồn tại.');
    if (attempt.submittedAt) throw new BadRequestException('Bài thi đã được nộp.');

    // Grade
    const questionsData = (attempt.answersJson as any)?.questions ?? [];
    const questionIds = questionsData.map((q: any) => q.questionId);
    const correctOptions = await this.prisma.client.elearningQuestionOption.findMany({
      where: { questionId: { in: questionIds }, isCorrect: true }
    });
    const correctMap = new Map<string, string[]>();
    for (const opt of correctOptions) {
      const arr = correctMap.get(opt.questionId) ?? [];
      arr.push(opt.id);
      correctMap.set(opt.questionId, arr);
    }

    let correctCount = 0;
    for (const q of questionsData) {
      const selectedId = answers[q.questionId];
      const correctIds = correctMap.get(q.questionId) ?? [];
      if (selectedId && correctIds.includes(selectedId)) {
        correctCount++;
      }
    }

    const totalQuestions = questionsData.length;
    const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passed = score >= attempt.exam.passingScore;

    await this.prisma.client.elearningExamAttempt.updateMany({
      where: { id: attemptId },
      data: {
        answersJson: {
          questions: questionsData,
          submittedAnswers: answers
        },
        score,
        passed,
        submittedAt: new Date()
      }
    });

    // Auto-issue certificate if passed
    if (passed) {
      const tenantId = this.prisma.getTenantId();
      await this.prisma.client.elearningCertificate.create({
        data: {
          tenant_Id: tenantId,
          courseId: attempt.exam.courseId,
          employeeId: attempt.employeeId,
          examAttemptId: attemptId,
          certificateCode: `CERT-${Date.now().toString(36).toUpperCase()}`,
          score,
          issuedAt: new Date()
        }
      });
    }

    return {
      attemptId,
      score,
      passed,
      totalQuestions,
      correctCount,
      correctAnswers: Object.fromEntries(correctMap)
    };
  }

  // ─── Certificates ────────────────────────────────────────────────

  async listCertificates(query: { courseId?: string; employeeId?: string; limit?: number }) {
    const where: Prisma.ElearningCertificateWhereInput = {
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {})
    };

    return this.prisma.client.elearningCertificate.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
      include: {
        course: { select: { id: true, title: true } }
      }
    });
  }

  // ─── Comments ────────────────────────────────────────────────────

  async listComments(lessonId: string) {
    return this.prisma.client.elearningComment.findMany({
      where: { lessonId },
      orderBy: { createdAt: 'asc' },
      take: 200
    });
  }

  async createComment(lessonId: string, employeeId: string, content: string, parentId?: string) {
    const tenantId = this.prisma.getTenantId();
    const lesson = await this.prisma.client.elearningLesson.findFirst({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Bài học không tồn tại.');

    return this.prisma.client.elearningComment.create({
      data: {
        tenant_Id: tenantId,
        lessonId,
        employeeId,
        content,
        parentId: parentId ?? null
      }
    });
  }

  // ─── Dashboard / Stats ──────────────────────────────────────────

  async getDashboard() {
    const [totalCourses, totalEnrollments, totalCertificates, completedEnrollments] = await Promise.all([
      this.prisma.client.elearningCourse.count({ where: { status: GenericStatus.ACTIVE } }),
      this.prisma.client.elearningEnrollment.count(),
      this.prisma.client.elearningCertificate.count(),
      this.prisma.client.elearningEnrollment.count({
        where: { enrollmentStatus: ElearningEnrollmentStatus.COMPLETED }
      })
    ]);

    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100)
      : 0;

    return {
      totalCourses,
      totalEnrollments,
      totalCertificates,
      completedEnrollments,
      completionRate
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async ensureCourseExists(id: string) {
    const course = await this.prisma.client.elearningCourse.findFirst({ where: { id } });
    if (!course) throw new NotFoundException('Khóa học không tồn tại.');
    return course;
  }

  private async gradeQuizAnswers(lessonId: string, answers: Record<string, string>): Promise<number> {
    const lessonQuestions = await this.prisma.client.elearningLessonQuestion.findMany({
      where: { lessonId },
      include: {
        question: {
          include: { options: true }
        }
      }
    });

    if (lessonQuestions.length === 0) return 100;

    let correct = 0;
    for (const lq of lessonQuestions) {
      const selectedOptionId = answers[lq.questionId];
      const correctOption = lq.question.options.find((o) => o.isCorrect);
      if (selectedOptionId && correctOption && selectedOptionId === correctOption.id) {
        correct++;
      }
    }

    return (correct / lessonQuestions.length) * 100;
  }

  private async recalculateEnrollmentProgress(enrollmentId: string) {
    const enrollment = await this.prisma.client.elearningEnrollment.findFirst({
      where: { id: enrollmentId }
    });
    if (!enrollment) return;

    const totalLessons = await this.prisma.client.elearningLesson.count({
      where: { courseId: enrollment.courseId, status: GenericStatus.ACTIVE }
    });
    const completedLessons = await this.prisma.client.elearningLessonProgress.count({
      where: { enrollmentId, completed: true }
    });

    const progressPercent = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    const isComplete = progressPercent >= 100;

    await this.prisma.client.elearningEnrollment.updateMany({
      where: { id: enrollmentId },
      data: {
        progressPercent,
        enrollmentStatus: isComplete
          ? ElearningEnrollmentStatus.COMPLETED
          : ElearningEnrollmentStatus.IN_PROGRESS,
        ...(isComplete ? { completedAt: new Date() } : {})
      }
    });
  }

  private normalizeContentType(value: unknown): ElearningContentType {
    const str = String(value ?? '').toUpperCase();
    const valid: ElearningContentType[] = ['VIDEO', 'DOCUMENT', 'INFOGRAPHIC', 'SLIDE', 'EXTERNAL_LINK', 'QUIZ'];
    return valid.includes(str as ElearningContentType)
      ? (str as ElearningContentType)
      : ElearningContentType.DOCUMENT;
  }

  private normalizeQuestionTags(tags: unknown): ElearningQuestionTag[] {
    if (!Array.isArray(tags)) return [ElearningQuestionTag.GENERAL];
    const valid = Object.values(ElearningQuestionTag);
    return tags
      .map((t) => String(t).toUpperCase())
      .filter((t) => valid.includes(t as ElearningQuestionTag)) as ElearningQuestionTag[];
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return undefined;
  }

  private toNullable(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private toSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
      .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
      .replace(/[ìíịỉĩ]/g, 'i')
      .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
      .replace(/[ùúụủũưừứựửữ]/g, 'u')
      .replace(/[ỳýỵỷỹ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
