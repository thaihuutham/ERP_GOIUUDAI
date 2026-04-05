# ADR-044: Admin/User IAM Scope Hybrid

## Status
Accepted - 2026-04-05

## Context
Hệ thống hiện dùng role nền `ADMIN/MANAGER/STAFF` và permission engine legacy theo module/action. Nhu cầu mới yêu cầu:
- chuẩn hóa role nền thành `ADMIN/USER`,
- giữ kiểm soát chi tiết theo action,
- áp scope dữ liệu theo cây nhân sự,
- rollout an toàn không phá vận hành hiện tại.

## Decision
Chọn mô hình IAM hybrid và bổ sung runtime policy `access_security.iamV2`:
- `enabled`: bật/tắt IAM v2.
- `mode`: `OFF | SHADOW | ENFORCE`.
- `enforcementModules`: danh sách module bật enforce từng phần.
- `protectAdminCore`: chặn thay đổi quyền lõi admin bởi non-admin.
- `denySelfElevation`: chặn tự nâng quyền.

Mặc định an toàn:
- `enabled=false`
- `mode=SHADOW`
- `enforcementModules=[]`
- `protectAdminCore=true`
- `denySelfElevation=true`

## Consequences
- Có thể chạy dual-eval (legacy vs iam v2) trước khi enforce thật.
- Rollout/rollback theo module bằng policy runtime, không cần migration rollback.
- Logic bảo vệ admin core và chống self-elevation được cố định ở policy contract ngay từ phase đầu.

## Non-Goals
- Chưa thay đổi ngay role enum ứng dụng hoặc cắt bỏ logic legacy trong giai đoạn này.
- Chưa enforce toàn hệ thống trong một lần deploy.
