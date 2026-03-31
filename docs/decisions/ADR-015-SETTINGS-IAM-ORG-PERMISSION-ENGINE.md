# ADR-015: IAM + Org Chart Tree + Permission Engine cho Settings Center Enterprise

## Status
Accepted

## Context
- Settings Center Enterprise đã có domain policy, audit và snapshot nhưng chưa có đầy đủ năng lực IAM vận hành:
  - provision tài khoản nhân viên theo luồng nghiệp vụ.
  - quản lý cây tổ chức chuẩn doanh nghiệp.
  - phân quyền chi tiết theo hành động nghiệp vụ.
- Hệ thống đang chạy MVP single-tenant (`GOIUUDAI`) với staged auth rollout (`AUTH_ENABLED=false` mặc định) nên phải đảm bảo không phá behavior ERP hiện hữu.
- Cần chuyển từ role mô phỏng ở web sang token thật khi bật auth để UI bám đúng quyền runtime.

## Decision
- Bổ sung lớp IAM backend:
  - `AuthModule` với endpoints:
    - `POST /api/v1/auth/login`
    - `POST /api/v1/auth/refresh`
    - `POST /api/v1/auth/logout`
    - `POST /api/v1/auth/change-password`
  - mở rộng lifecycle account trong `User`:
    - `isActive`, `mustChangePassword`, `lastLoginAt`, `passwordChangedAt`, `passwordResetAt`.
  - mật khẩu lưu hash `bcryptjs`, flow mặc định: mật khẩu tạm + bắt buộc đổi lần đầu.

- Bổ sung tổ chức chuẩn cây:
  - model `OrgUnit` self-reference với `OrgUnitType`:
    - `COMPANY`, `BRANCH`, `DEPARTMENT`, `TEAM`.
  - enforce hierarchy cứng:
    - `COMPANY` root
    - `BRANCH -> COMPANY`
    - `DEPARTMENT -> BRANCH`
    - `TEAM -> DEPARTMENT`
  - giữ `Department`/`Position` cũ để không phá luồng HR hiện có.

- Bổ sung engine phân quyền chi tiết:
  - `PositionPermissionRule` (theo vị trí).
  - `UserPermissionOverride` (ngoại lệ theo user).
  - `PermissionGuard` global sau `JwtAuthGuard`, resolution:
    - HTTP map: `GET/HEAD=VIEW`, `POST=CREATE`, `PUT/PATCH=UPDATE`, `DELETE=DELETE`.
    - route markers `/approve|/reject|/submit|/escalate|/delegate|/restore|/reindex|/pay` => `APPROVE`.
    - precedence `DENY` cao nhất.
  - fallback chuyển đổi:
    - nếu chưa có granular rule cho endpoint/module thì fallback `@Roles`.
    - break-glass qua `access_security.permissionPolicy.superAdminIds/superAdminEmails` (và tương thích `superAdminIds` legacy).

- Mở rộng Settings domain schema:
  - `access_security.permissionPolicy` gồm:
    - `enabled`
    - `conflictPolicy`
    - `superAdminIds`
    - `superAdminEmails`
  - giữ tương thích `settingsEditorPolicy`.

- UI Settings Center no-JSON:
  - `org_profile`: panel cây tổ chức (create/move node + tree view).
  - `hr_policies`: panel tạo nhân viên + tài khoản, reset mật khẩu tạm.
  - `access_security`: ma trận quyền theo vị trí + override theo user (5 action chuẩn).
  - web auth mode:
    - khi `NEXT_PUBLIC_AUTH_ENABLED=true`: dùng login thật, bỏ role switch localStorage, enforce đổi mật khẩu lần đầu.
    - khi `NEXT_PUBLIC_AUTH_ENABLED=false`: giữ behavior MVP cũ.

## Consequences
- Có thể vận hành provisioning account và phân quyền tập trung ngay trong Settings Center.
- Cho phép bật auth theo staged rollout mà không làm gãy pipeline MVP.
- Tăng độ an toàn truy cập API với deny-first policy và guard runtime.
- Tăng độ phức tạp cấu hình, cần runbook/seed quyền ban đầu trước khi bật prod toàn phần.

