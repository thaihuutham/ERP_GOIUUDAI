# ADR-030: HR Attendance V2 - Daily Method Priority + Exempt-Day API

## Status
Accepted

## Context
- ADR-029 đã giới thiệu đa phương thức chấm công (`REMOTE_TRACKED`, `OFFICE_EXCEL`, `EXEMPT`) nhưng còn gate cứng theo `Employee.attendanceMethod`.
- Nghiệp vụ thực tế có case mixed trong cùng tháng cho cùng một nhân sự:
  - một phần ngày remote,
  - một phần ngày office import,
  - một phần ngày công tác miễn chấm công.
- Nếu giữ gate theo employee-level method thì không mô hình hóa đúng thực tế vận hành.

## Decision
- Nâng source of truth từ employee-level method sang daily-level method:
  - tổng hợp `GET /api/v1/hr/attendance/monthly` dựa trên `Attendance.attendanceMethod` của từng ngày.
- Rule tổng hợp ngày:
  - có record `EXEMPT` trong ngày => `status=EXEMPT`, `workedMinutes=0`.
  - không EXEMPT, có tổng phút công > 0 => `WORKED`.
  - còn lại => `NO_DATA`.
- `monthTotalMinutes` chỉ cộng ngày `WORKED`.
- `Employee.attendanceMethod` được giữ làm default/nhãn vận hành, không còn là gate cứng cho toàn tháng.
- Bỏ chặn cứng theo `Employee.attendanceMethod` trong:
  - `POST /api/v1/hr/attendance/check-in`
  - `POST /api/v1/hr/attendance/check-out`
  - `POST /api/v1/hr/attendance/office-import`
- Thêm conflict guard theo ngày:
  - ngày đã EXEMPT => chặn check-in và office-import.
  - ngày đã có worked/open session => chặn đánh dấu EXEMPT.
- Thêm API admin thao tác exempt theo ngày:
  - `POST /api/v1/hr/attendance/exempt-day` với `{ employeeId, workDate, note? }`
  - `DELETE /api/v1/hr/attendance/exempt-day?employeeId=...&workDate=...`
- Không thay đổi response shape của `GET /api/v1/hr/attendance/monthly`.

## Consequences
- Hệ thống phản ánh đúng case mixed-method thực tế trong cùng tháng.
- Giảm phụ thuộc vào employee-level toggle và tránh sai lệch khi có ngày công tác đột xuất.
- Frontend bảng chấm công cần hiển thị metadata đếm ngày `WORKED/EXEMPT` để phân biệt trong khi cell `NO_DATA` và `EXEMPT` đều để trống.
- Cần regression test rõ cho các luồng conflict theo ngày (check-in/import/exempt-day).
