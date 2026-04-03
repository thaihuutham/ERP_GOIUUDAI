# ADR-025: AI Assistant Access Boundary v1 (Knowledge + Read-only Proxy + Scoped Dispatch)

## Status
Accepted

## Context
- Dự án cần thêm AI assistant hỗ trợ báo cáo vận hành định kỳ cho mô hình 50 nhân sự nội bộ.
- Yêu cầu bắt buộc: người dùng chỉ thấy dữ liệu trong quyền của mình, không được vượt scope khi dùng AI.
- Rủi ro chính cần chặn:
  - AI truy cập trực tiếp DB hoặc codebase và rò rỉ dữ liệu.
  - Prompt/context chứa dữ liệu vượt quyền actor.
  - Kênh chat (Zalo/Telegram) nhận báo cáo sai scope.

## Decision
- Triển khai Assistant v1 theo kiến trúc native trong monolith NestJS, nhưng tách boundary theo module:
  - `assistant-authz`: resolve scope + permission cho actor theo JWT/CLS.
  - `assistant-proxy`: nguồn dữ liệu nghiệp vụ read-only duy nhất cho AI.
  - `assistant-knowledge`: ingest tài liệu whitelist folder/link, có ACL theo scope/role.
  - `assistant-reports`: tạo run + artifacts riêng cho ERP và chat.
  - `assistant-dispatch`: whitelist channel webhook, scope cứng, retry/idempotency/audit.
- Chính sách scope mặc định:
  - `ADMIN = company`
  - `MANAGER = org scope` (branch/department theo cây tổ chức)
  - `STAFF = self`
- Cấu hình runtime mới trong `access_security.assistantAccessPolicy`:
  - `enabled`
  - `roleScopeDefaults`
  - `enforcePermissionEngine`
  - `denyIfNoScope`
  - `allowedModules`
  - `chatChannelScopeEnforced`
- AI tuyệt đối không đọc DB/code trực tiếp; chỉ qua:
  - Tri thức: folder/link whitelist đã ingest.
  - Nghiệp vụ: API proxy read-only có áp `tenant + scope + permission`.
- Phát hành tách luồng:
  - ERP artifact: chi tiết theo quyền, có duyệt.
  - Chat artifact: tự động, nhưng bắt buộc match scope channel whitelist.

## Consequences
- Tăng đáng kể mức an toàn dữ liệu khi mở AI cho nội bộ.
- Tăng độ phức tạp ở tầng policy/authz/proxy/dispatch nhưng đổi lại có audit trail và kiểm soát rò rỉ tốt hơn.
- Rollout an toàn qua feature flag, không thay đổi business logic ERP hiện hữu.
