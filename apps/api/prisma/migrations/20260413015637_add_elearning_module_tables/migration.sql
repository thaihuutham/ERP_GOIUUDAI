-- CreateEnum
CREATE TYPE "CustomerDistributionStrategy" AS ENUM ('ROUND_ROBIN', 'LEAST_PENDING', 'CAP_FILL', 'KPI_WEIGHTED');

-- CreateEnum
CREATE TYPE "CustomerAssignmentAction" AS ENUM ('AUTO_ASSIGNED', 'MANUAL_ASSIGNED', 'RECLAIMED_IDLE', 'RECLAIMED_FAILED', 'ROTATION', 'RETURNED_TO_POOL');

-- CreateEnum
CREATE TYPE "ElearningContentType" AS ENUM ('VIDEO', 'DOCUMENT', 'INFOGRAPHIC', 'SLIDE', 'EXTERNAL_LINK', 'QUIZ');

-- CreateTable (dynamic question categories — replaces old ElearningQuestionTag enum)
CREATE TABLE "ElearningQuestionCategory" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElearningQuestionCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElearningQuestionCategory_tenant_Id_code_key"
    ON "ElearningQuestionCategory"("tenant_Id", "code");

CREATE INDEX "ElearningQuestionCategory_tenant_Id_status_idx"
    ON "ElearningQuestionCategory"("tenant_Id", "status");

-- CreateEnum
CREATE TYPE "ElearningEnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountAmount" DECIMAL(18,2),
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ElearningCourse" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enrollPolicy" TEXT NOT NULL DEFAULT 'INVITE',
    "category" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningSection" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningLesson" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionId" TEXT,
    "title" TEXT NOT NULL,
    "contentType" "ElearningContentType" NOT NULL,
    "contentUrl" TEXT,
    "contentFileId" TEXT,
    "contentHtml" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "allowPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningQuestion" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "explanation" TEXT,
    "tags" TEXT[] DEFAULT ARRAY['GENERAL']::TEXT[],
    "positionId" TEXT,
    "departmentId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningQuestionOption" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionText" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningLessonQuestion" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElearningLessonQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningExam" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT true,
    "status" "GenericStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningExamAttempt" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "answersJson" JSONB,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningEnrollment" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "enrollmentStatus" "ElearningEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningLessonProgress" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "quizScore" DOUBLE PRECISION,
    "quizAnswersJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningCertificate" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "examAttemptId" TEXT,
    "certificateCode" TEXT,
    "score" DOUBLE PRECISION,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElearningComment" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElearningComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyQuizSession" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quizDate" DATE NOT NULL,
    "questionsJson" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAssignmentLog" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStaffId" TEXT,
    "toStaffId" TEXT,
    "action" "CustomerAssignmentAction" NOT NULL,
    "reason" TEXT,
    "strategyUsed" TEXT,
    "rotationRound" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAssignmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRotationBlacklist" (
    "id" TEXT NOT NULL,
    "tenant_Id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRotationBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElearningCourse_tenant_Id_idx" ON "ElearningCourse"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningCourse_tenant_Id_status_idx" ON "ElearningCourse"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX "ElearningSection_tenant_Id_idx" ON "ElearningSection"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningSection_tenant_Id_courseId_sortOrder_idx" ON "ElearningSection"("tenant_Id", "courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "ElearningLesson_tenant_Id_idx" ON "ElearningLesson"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningLesson_tenant_Id_courseId_sortOrder_idx" ON "ElearningLesson"("tenant_Id", "courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "ElearningLesson_tenant_Id_sectionId_idx" ON "ElearningLesson"("tenant_Id", "sectionId");

-- CreateIndex
CREATE INDEX "ElearningQuestion_tenant_Id_idx" ON "ElearningQuestion"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningQuestion_tenant_Id_status_idx" ON "ElearningQuestion"("tenant_Id", "status");

-- CreateIndex
CREATE INDEX "ElearningQuestion_tenant_Id_positionId_idx" ON "ElearningQuestion"("tenant_Id", "positionId");

-- CreateIndex
CREATE INDEX "ElearningQuestion_tenant_Id_departmentId_idx" ON "ElearningQuestion"("tenant_Id", "departmentId");

-- CreateIndex
CREATE INDEX "ElearningQuestionOption_tenant_Id_idx" ON "ElearningQuestionOption"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningQuestionOption_tenant_Id_questionId_idx" ON "ElearningQuestionOption"("tenant_Id", "questionId");

-- CreateIndex
CREATE INDEX "ElearningLessonQuestion_tenant_Id_idx" ON "ElearningLessonQuestion"("tenant_Id");

-- CreateIndex
CREATE UNIQUE INDEX "ElearningLessonQuestion_tenant_Id_lessonId_questionId_key" ON "ElearningLessonQuestion"("tenant_Id", "lessonId", "questionId");

-- CreateIndex
CREATE INDEX "ElearningExam_tenant_Id_idx" ON "ElearningExam"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningExam_tenant_Id_courseId_idx" ON "ElearningExam"("tenant_Id", "courseId");

-- CreateIndex
CREATE INDEX "ElearningExamAttempt_tenant_Id_idx" ON "ElearningExamAttempt"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningExamAttempt_tenant_Id_examId_employeeId_idx" ON "ElearningExamAttempt"("tenant_Id", "examId", "employeeId");

-- CreateIndex
CREATE INDEX "ElearningEnrollment_tenant_Id_idx" ON "ElearningEnrollment"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningEnrollment_tenant_Id_courseId_idx" ON "ElearningEnrollment"("tenant_Id", "courseId");

-- CreateIndex
CREATE INDEX "ElearningEnrollment_tenant_Id_employeeId_idx" ON "ElearningEnrollment"("tenant_Id", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ElearningEnrollment_tenant_Id_courseId_employeeId_key" ON "ElearningEnrollment"("tenant_Id", "courseId", "employeeId");

-- CreateIndex
CREATE INDEX "ElearningLessonProgress_tenant_Id_idx" ON "ElearningLessonProgress"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningLessonProgress_tenant_Id_enrollmentId_idx" ON "ElearningLessonProgress"("tenant_Id", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ElearningLessonProgress_tenant_Id_enrollmentId_lessonId_key" ON "ElearningLessonProgress"("tenant_Id", "enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "ElearningCertificate_tenant_Id_idx" ON "ElearningCertificate"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningCertificate_tenant_Id_courseId_idx" ON "ElearningCertificate"("tenant_Id", "courseId");

-- CreateIndex
CREATE INDEX "ElearningCertificate_tenant_Id_employeeId_idx" ON "ElearningCertificate"("tenant_Id", "employeeId");

-- CreateIndex
CREATE INDEX "ElearningComment_tenant_Id_idx" ON "ElearningComment"("tenant_Id");

-- CreateIndex
CREATE INDEX "ElearningComment_tenant_Id_lessonId_createdAt_idx" ON "ElearningComment"("tenant_Id", "lessonId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyQuizSession_tenant_Id_idx" ON "DailyQuizSession"("tenant_Id");

-- CreateIndex
CREATE INDEX "DailyQuizSession_tenant_Id_employeeId_quizDate_idx" ON "DailyQuizSession"("tenant_Id", "employeeId", "quizDate");

-- CreateIndex
CREATE INDEX "DailyQuizSession_tenant_Id_employeeId_completed_idx" ON "DailyQuizSession"("tenant_Id", "employeeId", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuizSession_tenant_Id_employeeId_quizDate_key" ON "DailyQuizSession"("tenant_Id", "employeeId", "quizDate");

-- CreateIndex
CREATE INDEX "CustomerAssignmentLog_tenant_Id_idx" ON "CustomerAssignmentLog"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomerAssignmentLog_tenant_Id_customerId_idx" ON "CustomerAssignmentLog"("tenant_Id", "customerId");

-- CreateIndex
CREATE INDEX "CustomerAssignmentLog_tenant_Id_toStaffId_idx" ON "CustomerAssignmentLog"("tenant_Id", "toStaffId");

-- CreateIndex
CREATE INDEX "CustomerAssignmentLog_tenant_Id_createdAt_idx" ON "CustomerAssignmentLog"("tenant_Id", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRotationBlacklist_tenant_Id_idx" ON "CustomerRotationBlacklist"("tenant_Id");

-- CreateIndex
CREATE INDEX "CustomerRotationBlacklist_tenant_Id_customerId_idx" ON "CustomerRotationBlacklist"("tenant_Id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRotationBlacklist_tenant_Id_customerId_staffId_key" ON "CustomerRotationBlacklist"("tenant_Id", "customerId", "staffId");

-- AddForeignKey
ALTER TABLE "ElearningSection" ADD CONSTRAINT "ElearningSection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "ElearningCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLesson" ADD CONSTRAINT "ElearningLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "ElearningCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLesson" ADD CONSTRAINT "ElearningLesson_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ElearningSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningQuestionOption" ADD CONSTRAINT "ElearningQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ElearningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLessonQuestion" ADD CONSTRAINT "ElearningLessonQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ElearningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLessonQuestion" ADD CONSTRAINT "ElearningLessonQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ElearningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningExam" ADD CONSTRAINT "ElearningExam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "ElearningCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningExamAttempt" ADD CONSTRAINT "ElearningExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ElearningExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningEnrollment" ADD CONSTRAINT "ElearningEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "ElearningCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLessonProgress" ADD CONSTRAINT "ElearningLessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ElearningEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningLessonProgress" ADD CONSTRAINT "ElearningLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ElearningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningCertificate" ADD CONSTRAINT "ElearningCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "ElearningCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningCertificate" ADD CONSTRAINT "ElearningCertificate_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "ElearningExamAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElearningComment" ADD CONSTRAINT "ElearningComment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "ElearningLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignmentLog" ADD CONSTRAINT "CustomerAssignmentLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
