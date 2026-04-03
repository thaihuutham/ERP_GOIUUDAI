# ADR-023: Ma Trận Ủy Quyền Xem Audit Log Theo Cấp Quản Lý

## Status
Accepted

## Context
- Hiện trạng trước thay đổi: user role `MANAGER` có thể xem audit rộng, chưa giới hạn theo phạm vi quản lý thực tế trong cây tổ chức.
- Yêu cầu nghiệp vụ:
  - Giám đốc xem toàn công ty.
  - Trưởng chi nhánh chỉ xem phạm vi chi nhánh.
  - Trưởng phòng chỉ xem phạm vi phòng.
  - Admin có thể bật/tắt độc lập từng nhóm quản lý.
  - Nhóm bị tắt phải bị chặn hoàn toàn.
- Source-of-truth nhóm quản lý cần nhất quán với tổ chức: `OrgUnit.managerEmployeeId`.
- Audit đã có hot/cold tier, nên enforcement scope phải áp dụng đồng thời cho cả hai đường truy vấn để tránh rò rỉ dữ liệu.

## Decision
- Bổ sung policy runtime mới tại domain `access_security`:
  - `auditViewPolicy.enabled`
  - `auditViewPolicy.groups.DIRECTOR.enabled`
  - `auditViewPolicy.groups.BRANCH_MANAGER.enabled`
  - `auditViewPolicy.groups.DEPARTMENT_MANAGER.enabled`
  - `auditViewPolicy.denyIfUngroupedManager`
- Tạo service riêng `AuditAccessScopeService` để resolve scope cho user hiện tại:
  - `ADMIN` luôn `company`.
  - `MANAGER`:
    - quản lý `COMPANY` + group `DIRECTOR` bật => `company`.
    - quản lý `BRANCH` + group `BRANCH_MANAGER` bật => `branch` + descendants.
    - quản lý `DEPARTMENT` + group `DEPARTMENT_MANAGER` bật => `department` + descendants.
    - không có scope hiệu lực => `403` khi `denyIfUngroupedManager=true`.
  - Nếu user thuộc nhiều nhóm, áp dụng union scope và ưu tiên scope rộng hơn (`company > branch > department`).
- Enforcement trực tiếp tại audit service (không phụ thuộc permission engine global):
  - Hot tier: lọc `actorId IN allowedActorIds` khi không phải company scope.
  - Cold tier: matcher archive lọc cùng actor scope.
  - `GET /audit/actions`: lọc taxonomy/count theo cùng scope.
  - `pageInfo` trả thêm `accessScope`.
- Settings Center Enterprise:
  - Thêm section cấu hình ma trận audit scope trong `access_security`.
  - Thêm module `audit` vào bảng permission matrix.
  - Thêm thao tác gán `managerEmployeeId` cho Org Unit từ UI.
- Permission engine hiện tại vẫn giữ nguyên, hoạt động như lớp bổ sung trước business logic.

## Consequences
- Quyền xem audit bám sát cấu trúc quản trị thực tế, giảm rủi ro lộ log ngoài phạm vi.
- Admin có thể điều tiết từng nhóm quản lý theo vận hành từng giai đoạn.
- Phụ thuộc vào chất lượng dữ liệu tổ chức:
  - nếu chưa gán `managerEmployeeId` đúng, manager có thể bị chặn xem audit theo policy.
- Scope audit được xác định theo actor thực hiện (không theo ownership object), cần truyền thông rõ cho đội vận hành khi đối soát dữ liệu.
