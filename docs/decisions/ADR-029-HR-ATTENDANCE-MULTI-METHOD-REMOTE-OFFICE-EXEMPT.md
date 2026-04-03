# ADR-029: HR Attendance Multi-Method (Remote/Office/Exempt)

## Status
Accepted

## Context
- Module HR cần hỗ trợ chấm công theo từng nhân sự thay vì một luồng duy nhất.
- Có 3 nhóm vận hành thực tế:
  - Nhân sự remote cần check-in/check-out online theo phiên làm việc.
  - Nhân sự văn phòng tổng hợp công từ file Excel cuối tháng.
  - Nhân sự miễn chấm công (không tính giờ theo bảng công).
- Yêu cầu UI cần theo dõi công theo tháng ở dạng ma trận theo ngày, kèm cơ chế admin đổi phương pháp chấm công theo từng nhân sự.

## Decision
- Chuẩn hóa phương pháp chấm công bằng enum `AttendanceMethod` với 3 giá trị:
  - `REMOTE_TRACKED`
  - `OFFICE_EXCEL`
  - `EXEMPT`
- Mở rộng dữ liệu:
  - `Employee.attendanceMethod` (default `REMOTE_TRACKED`).
  - `Attendance.workedMinutes` để lưu tổng phút làm theo từng bản ghi ngày/phiên.
  - `Attendance.attendanceMethod` để lưu phương pháp tại thời điểm ghi công.
- Chốt contract API mới:
  - `GET /api/v1/hr/attendance/monthly?year=YYYY&month=MM` trả ma trận chấm công theo ngày/tháng.
  - `POST /api/v1/hr/attendance/office-import` nhận JSON rows (frontend parse `.xlsx`).
- Chốt rule nghiệp vụ:
  - `check-in/check-out` chỉ dành cho `REMOTE_TRACKED`.
  - Remote cho phép nhiều phiên trong cùng ngày; `check-out` cộng dồn phút vào `workedMinutes`.
  - Nhân sự `OFFICE_EXCEL` và `EXEMPT` bị chặn ở check-in/check-out với lỗi rõ ràng.
  - Nhân sự `EXEMPT` luôn hiển thị trạng thái miễn chấm công ở bảng tháng.
- Chốt UI:
  - Route `/modules/hr/attendance` dùng board chuyên biệt (không dùng generic `ModuleWorkbench`).
  - Có dropdown tháng theo dõi, bảng ma trận theo ngày, inline đổi `attendanceMethod`, import `.xlsx`, remote self check-in/out.
  - Idle policy remote: không click 6 phút => auto check-out (best effort) + logout.

## Consequences
- Dữ liệu công linh hoạt theo từng nhóm nhân sự, giảm thao tác thủ công cho remote và office.
- UI chấm công theo tháng rõ ràng, dễ kiểm tra tổng phút làm theo từng ngày/nhân sự.
- Cần duy trì đồng bộ giữa file import Excel và danh mục `employeeCode` để tránh skipped rows.
- Idle timeout dựa trên click event ở frontend, nên cần e2e regression riêng khi thay đổi auth/session behavior.
