import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ElearningService } from './elearning.service';
import { DailyQuizService } from './daily-quiz.service';

@Controller('elearning')
export class ElearningController {
  constructor(
    private readonly elearningService: ElearningService,
    private readonly dailyQuizService: DailyQuizService
  ) {}

  // ─── Courses ───────────────────────────────────────────────────

  @Get('courses')
  listCourses(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    return this.elearningService.listCourses({
      q,
      status,
      limit: limit ? parseInt(limit, 10) : undefined
    });
  }

  @Get('courses/:id')
  getCourse(@Param('id') id: string) {
    return this.elearningService.getCourse(id);
  }

  @Post('courses')
  createCourse(@Body() body: Record<string, unknown>) {
    return this.elearningService.createCourse(body);
  }

  @Patch('courses/:id')
  updateCourse(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.updateCourse(id, body);
  }

  @Post('courses/:id/publish')
  publishCourse(@Param('id') id: string) {
    return this.elearningService.publishCourse(id);
  }

  @Post('courses/:id/archive')
  archiveCourse(@Param('id') id: string) {
    return this.elearningService.archiveCourse(id);
  }

  // ─── Sections ──────────────────────────────────────────────────

  @Post('courses/:id/sections')
  createSection(@Param('id') courseId: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.createSection(courseId, body);
  }

  @Patch('sections/:id')
  updateSection(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.updateSection(id, body);
  }

  @Delete('sections/:id')
  deleteSection(@Param('id') id: string) {
    return this.elearningService.deleteSection(id);
  }

  // ─── Lessons ───────────────────────────────────────────────────

  @Post('courses/:id/lessons')
  createLesson(@Param('id') courseId: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.createLesson(courseId, body);
  }

  @Get('lessons/:id')
  getLesson(@Param('id') id: string) {
    return this.elearningService.getLesson(id);
  }

  @Patch('lessons/:id')
  updateLesson(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.updateLesson(id, body);
  }

  @Delete('lessons/:id')
  deleteLesson(@Param('id') id: string) {
    return this.elearningService.deleteLesson(id);
  }

  // ─── Lesson Questions ──────────────────────────────────────────

  @Post('lessons/:id/questions')
  addQuestionsToLesson(@Param('id') lessonId: string, @Body() body: { questionIds: string[] }) {
    return this.elearningService.addQuestionsToLesson(lessonId, body.questionIds ?? []);
  }

  @Delete('lessons/:lessonId/questions/:questionId')
  removeQuestionFromLesson(
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string
  ) {
    return this.elearningService.removeQuestionFromLesson(lessonId, questionId);
  }

  // ─── Questions (Question Bank) ─────────────────────────────────

  @Get('questions')
  listQuestions(
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('positionId') positionId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('limit') limit?: string
  ) {
    return this.elearningService.listQuestions({
      q,
      tag,
      positionId,
      departmentId,
      limit: limit ? parseInt(limit, 10) : undefined
    });
  }

  @Post('questions')
  createQuestion(@Body() body: Record<string, unknown>) {
    return this.elearningService.createQuestion(body);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.elearningService.updateQuestion(id, body);
  }

  @Delete('questions/:id')
  archiveQuestion(@Param('id') id: string) {
    return this.elearningService.archiveQuestion(id);
  }

  // ─── Enrollment ────────────────────────────────────────────────

  @Post('courses/:id/enroll')
  enrollEmployees(@Param('id') courseId: string, @Body() body: { employeeIds: string[] }) {
    return this.elearningService.enrollEmployees(courseId, body.employeeIds ?? []);
  }

  @Get('enrollments')
  listEnrollments(
    @Query('courseId') courseId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    return this.elearningService.listEnrollments({
      courseId,
      employeeId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined
    });
  }

  // ─── Lesson Progress ──────────────────────────────────────────

  @Post('lessons/:id/complete')
  completeLesson(
    @Param('id') lessonId: string,
    @Body() body: { employeeId: string; quizAnswers?: Record<string, string> }
  ) {
    return this.elearningService.completeLesson(lessonId, body.employeeId, body.quizAnswers);
  }

  @Get('my/progress')
  getMyProgress(@Query('employeeId') employeeId: string, @Query('courseId') courseId: string) {
    return this.elearningService.getMyProgress(employeeId, courseId);
  }

  // ─── Exams ─────────────────────────────────────────────────────

  @Post('exams')
  createExam(@Body() body: Record<string, unknown> & { courseId: string }) {
    return this.elearningService.createExam(body.courseId, body);
  }

  @Post('exams/:id/start')
  startExam(@Param('id') examId: string, @Body() body: { employeeId: string }) {
    return this.elearningService.startExam(examId, body.employeeId);
  }

  @Post('exam-attempts/:id/submit')
  submitExamAttempt(@Param('id') attemptId: string, @Body() body: { answers: Record<string, string> }) {
    return this.elearningService.submitExamAttempt(attemptId, body.answers ?? {});
  }

  // ─── Certificates ─────────────────────────────────────────────

  @Get('certificates')
  listCertificates(
    @Query('courseId') courseId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('limit') limit?: string
  ) {
    return this.elearningService.listCertificates({
      courseId,
      employeeId,
      limit: limit ? parseInt(limit, 10) : undefined
    });
  }

  // ─── Comments ──────────────────────────────────────────────────

  @Get('lessons/:id/comments')
  listComments(@Param('id') lessonId: string) {
    return this.elearningService.listComments(lessonId);
  }

  @Post('lessons/:id/comments')
  createComment(
    @Param('id') lessonId: string,
    @Body() body: { employeeId: string; content: string; parentId?: string }
  ) {
    return this.elearningService.createComment(lessonId, body.employeeId, body.content, body.parentId);
  }

  // ─── Dashboard ─────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard() {
    return this.elearningService.getDashboard();
  }

  // ─── Daily Quiz ────────────────────────────────────────────────

  @Get('daily-quiz/check')
  async checkDailyQuiz(
    @Query('employeeId') employeeId?: string,
    @Query('email') email?: string
  ) {
    const resolvedId = employeeId ?? (email ? await this.resolveEmployeeIdByEmail(email) : undefined);
    if (!resolvedId) return { required: false, completed: true };
    return this.dailyQuizService.check(resolvedId);
  }

  @Get('daily-quiz/start')
  async startDailyQuiz(
    @Query('employeeId') employeeId?: string,
    @Query('email') email?: string
  ) {
    const resolvedId = employeeId ?? (email ? await this.resolveEmployeeIdByEmail(email) : undefined);
    if (!resolvedId) return { required: false };
    return this.dailyQuizService.start(resolvedId);
  }

  @Post('daily-quiz/submit')
  submitDailyQuiz(@Body() body: { sessionId: string; answers: Record<string, string> }) {
    return this.dailyQuizService.submit(body.sessionId, body.answers ?? {});
  }

  @Get('daily-quiz/stats')
  getDailyQuizStats(
    @Query('employeeId') employeeId?: string,
    @Query('period') period?: string
  ) {
    return this.dailyQuizService.getStats({
      employeeId,
      period: period as 'week' | 'month' | 'quarter' | 'year'
    });
  }

  @Get('daily-quiz/report')
  getDailyQuizReport(@Query('period') period?: string) {
    return this.dailyQuizService.getCompanyReport({
      period: period as 'week' | 'month' | 'quarter' | 'year'
    });
  }

  // ─── Internal helpers ──────────────────────────────────────────

  private async resolveEmployeeIdByEmail(email: string): Promise<string | undefined> {
    const { PrismaService } = await import('../../prisma/prisma.service');
    // Use injected service instead
    const employee = await this.elearningService['prisma'].client.employee.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    });
    return employee?.id ?? undefined;
  }
}
