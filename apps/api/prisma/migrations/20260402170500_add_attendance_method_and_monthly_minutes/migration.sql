-- Attendance method per employee + worked minutes tracking
CREATE TYPE "AttendanceMethod" AS ENUM ('REMOTE_TRACKED', 'OFFICE_EXCEL', 'EXEMPT');

ALTER TABLE "Employee"
  ADD COLUMN "attendanceMethod" "AttendanceMethod" NOT NULL DEFAULT 'REMOTE_TRACKED';

ALTER TABLE "Attendance"
  ADD COLUMN "workedMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attendanceMethod" "AttendanceMethod" NOT NULL DEFAULT 'REMOTE_TRACKED';

CREATE INDEX "Employee_tenant_Id_attendanceMethod_idx" ON "Employee"("tenant_Id", "attendanceMethod");
CREATE INDEX "Attendance_tenant_Id_attendanceMethod_idx" ON "Attendance"("tenant_Id", "attendanceMethod");
