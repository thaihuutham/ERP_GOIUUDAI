# ADR-061: Admin/User Policy-as-Data authorization with big-bang cutover

- Status: Accepted
- Date: 2026-04-09

## Context
- ERP hiện tại đang tồn tại role model hỗn hợp `ADMIN|MANAGER|STAFF` với nhiều check hardcode ở API/UI.
- Yêu cầu nghiệp vụ mới đã chốt:
  - hệ thống chỉ còn `ADMIN` và `USER`,
  - `USER` nhận quyền chi tiết từ vị trí công việc,
  - nếu một user có nhiều vị trí thì quyền hiệu lực là union,
  - override và chỉnh sửa nhạy cảm dùng mô hình duyệt 2 bước,
  - `ADMIN` là quyền cao nhất và có thể apply trực tiếp.
- Mục tiêu kiến trúc: loại bỏ phụ thuộc hardcode role ở decision path, chuyển toàn bộ quyết định quyền về data model có thể cấu hình trong Settings.

## Decision
1. Chuẩn hóa identity role về 2 giá trị duy nhất:
   - `ADMIN`: full settings control + bypass policy checks tập trung.
   - `USER`: bắt buộc đi qua policy resolver.
2. Áp dụng kiến trúc `policy-as-data` trên toàn ERP:
   - action catalog chuẩn hóa toàn bộ thao tác,
   - permission set gán cho position,
   - user nhận quyền thông qua position assignment,
   - effective permission tính theo union của mọi position active.
3. Áp dụng `approval-as-policy` cho action nhạy cảm:
   - `request -> approve` trước khi mutate dữ liệu,
   - `ADMIN` được phép direct-apply theo policy và vẫn phải ghi audit.
4. Với bản ghi đã có callback ngoài, chỉnh tay phải đi qua approval policy (trừ admin direct apply).
5. Quy tắc conflict giữa callback ngoài và thao tác nội bộ: `last-write-wins` theo timestamp/version của bản ghi.
6. Rule hóa đơn điện tử dùng policy theo `orderGroup`, không cho override cấp sản phẩm trong scope này.
7. Phương thức triển khai: big-bang cutover toàn hệ thống sau khi rehearsal pass, không rollout module-by-module cho role model mới.

## Consequences
### Positive
- Giảm rủi ro drift quyền do hardcode role rải rác.
- Cho phép quản trị phân quyền theo vị trí linh hoạt và auditable.
- Tạo nền tảng bền vững dài hạn cho mở rộng action/policy không cần sửa code core.

### Negative
- Chi phí migration lớn trong một đợt cutover.
- Rủi ro thay đổi đồng thời nhiều module nếu kiểm thử không đủ sâu.
- Cần governance nghiêm ngặt cho Action Catalog và policy schema.

## Non-goals
- Không mở thêm role hệ thống ngoài `ADMIN` và `USER`.
- Không giữ backward-compat runtime cho decision path dựa vào `MANAGER|STAFF`.
- Không mở rule hóa đơn cấp sản phẩm trong phase này.

## Risk controls
- Bắt buộc conflict matrix trước khi sửa code hàng loạt.
- Bắt buộc action catalog freeze trước khi wiring guard.
- Bắt buộc rehearsal + rollback drill trước production cutover.
- Bắt buộc full regression/e2e + permission negative tests trước go-live.

## Follow-up
- Tạo cutover charter chi tiết (scope, gate, rollback).
- Tạo conflict matrix toàn repo cho legacy role checks.
- Tạo action catalog v1 và approval policy template.
