# ADR-041 — Settings Center Position & Permission Hub

## Status
Accepted (2026-04-04)

## Context
User yêu cầu đưa toàn bộ cấu hình vị trí công việc và quyền theo vị trí vào Trung tâm cấu hình hệ thống, gồm:
- quản trị vị trí ngay trong Settings Center (thêm/sửa/xóa),
- hiển thị số nhân sự theo từng vị trí,
- click vào vị trí để mở trang chi tiết có 2 tab: quyền và danh sách nhân viên.

Luồng cũ chỉ có ma trận quyền theo vị trí bằng dropdown, chưa có CRUD vị trí và chưa có view nhân sự theo vị trí trong cùng một trung tâm.

## Decision
1. Bổ sung API quản trị vị trí trong `settings` domain:
   - `GET /settings/positions`
   - `POST /settings/positions`
   - `PATCH /settings/positions/:positionId`
   - `DELETE /settings/positions/:positionId`
   - `GET /settings/positions/:positionId/employees`
2. `GET /settings/positions` trả về metadata vận hành cho UI:
   - `employeeCount` (số nhân sự đang gắn vị trí),
   - `permissionRuleCount`,
   - thông tin vị trí chuẩn hóa (`title`, `code`, `level`, `status`...).
3. Guard xóa vị trí:
   - không cho xóa nếu còn nhân sự đang sử dụng vị trí,
   - khi xóa hợp lệ thì cleanup `PositionPermissionRule` theo vị trí.
4. Refactor tab ma trận quyền trong Settings Center thành “hub” vị trí:
   - danh sách vị trí + headcount + thao tác CRUD,
   - detail panel 2 tab (`Chi tiết quyền`, `Danh sách nhân viên`),
   - giữ nguyên override theo user ở cùng tab bảo mật.

## Consequences
### Positive
- Admin thao tác vị trí + quyền tập trung tại một nơi, không phải đi qua HR module để cấu hình quyền.
- Dễ kiểm soát tác động vận hành nhờ hiển thị headcount theo vị trí trước khi chỉnh/sửa/xóa.
- Mô hình phân quyền theo vị trí rõ ràng hơn khi có tab nhân sự gắn trực tiếp với vị trí.

### Trade-offs
- API `settings` mở rộng scope nghiệp vụ HR ở mức metadata vận hành (vị trí + nhân sự theo vị trí).
- Cần giữ đồng bộ contract hiển thị giữa dữ liệu HR core và settings hub khi schema vị trí mở rộng trong tương lai.
