# ADR-046: Zalo Account Assignment via Specialized Table

## Status
Accepted - 2026-04-05

## Context
ERP đã có nền tảng Zalo cá nhân/OA và conversation thread/message, nhưng chưa có cơ chế phân quyền record-level rõ ràng để:
- admin gán từng tài khoản Zalo cho nhân viên chăm sóc,
- kiểm soát quyền đọc/trả lời theo từng account,
- vận hành an toàn khi rollout chức năng multi-account inbox.

Yêu cầu hiện tại ưu tiên:
- triển khai nhanh, rủi ro thấp,
- nghiệp vụ rõ ràng cho team vận hành,
- không phá luồng business logic ERP đang chạy.

## Decision
Chọn mô hình bảng chuyên biệt `zalo_account_assignments` trong ERP thay vì dùng trực tiếp `iam_record_access_grants` cho phase tích hợp ZaloCRM.

Hợp đồng dữ liệu tối thiểu của assignment:
- `zaloAccountId`
- `userId`
- `permissionLevel` (`READ` | `CHAT` | `ADMIN`)
- `assignedBy`
- `assignedAt`
- `revokedAt` (nullable soft-revoke)
- unique active assignment theo cặp (`zaloAccountId`, `userId`).

Nguyên tắc enforce:
- `ADMIN` hệ thống giữ quyền full-access (không bị chặn bởi assignment).
- `USER` chỉ thấy account/thread thuộc assignment active.
- gửi tin nhắn yêu cầu tối thiểu quyền `CHAT`.
- thao tác quản trị account/assignment yêu cầu quyền `ADMIN`.

## Consequences
- Ưu điểm:
  - time-to-deliver nhanh, mapping 1-1 với nghiệp vụ “admin chia account cho nhân viên”.
  - dễ test, dễ audit, rollback đơn giản.
  - giảm coupling với rollout IAM v2 tổng thể.
- Đánh đổi:
  - tồn tại thêm một lớp authorization domain-specific cho Zalo.
  - cần kế hoạch đồng bộ dài hạn nếu hợp nhất về IAM record-level chung sau này.

## Non-Goals
- Chưa hợp nhất ngay assignment Zalo vào `iam_record_access_grants`.
- Chưa thay đổi role model tổng thể (`ADMIN/USER`) ngoài phạm vi module Zalo/Conversations.
- Không thay đổi luồng deploy production trực tiếp thủ công trên VM.
