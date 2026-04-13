-- Backfill drift: schema/service expects ElearningCourse.category, but initial eLearning migration omitted this column.
-- NOTE: For fresh installs, this is a no-op since the initial migration now includes the column as TEXT.
ALTER TABLE "ElearningCourse"
ADD COLUMN IF NOT EXISTS "category" TEXT;
