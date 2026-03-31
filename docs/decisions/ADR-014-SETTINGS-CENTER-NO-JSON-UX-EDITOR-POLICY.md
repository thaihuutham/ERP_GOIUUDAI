# ADR-014: Settings Center No-JSON UX + Editor Permission Policy

## Status
Accepted

## Context
- UI Settings trước đây dựa mạnh vào JSON editor, không phù hợp người vận hành không rành IT.
- Cần giữ compatibility API/domain payload hiện có trong migration window, nhưng trải nghiệm vận hành phải chuyển sang form nghiệp vụ.
- Quyền sửa settings không thể cứng theo role endpoint; cần policy cấu hình theo domain để mở rộng linh hoạt.

## Decision
- Ẩn hoàn toàn JSON editor trên UI Settings Center vận hành.
- Chuẩn hóa Settings Center UI theo form domain-based (tick chọn, select, input có đơn vị, preset chips, validate theo field, diff ngôn ngữ nghiệp vụ).
- Giữ 12 domain trong điều hướng tab, mapper chỉ cập nhật field đã định nghĩa và merge với payload gốc để không mất unknown key.
- Mở rộng `access_security` schema v1 với `settingsEditorPolicy`:
  - `settingsEditorPolicy.domainRoleMap`
  - `settingsEditorPolicy.userDomainMap`
- Enforcement backend:
  - `ADMIN` luôn có quyền (fallback an toàn).
  - Người dùng khác chỉ sửa domain khi được cấp explicit trong policy.
  - Domain nhạy cảm (`access_security`, `finance_controls`, `integrations`) yêu cầu explicit grant.
- Bổ sung reason contract cho save flow:
  - `reasonTemplate` + `reasonNote` được hợp nhất thành `reason` để ghi audit.

## Consequences
- Người dùng nghiệp vụ có thể cấu hình hệ thống mà không cần thao tác JSON.
- Giảm rủi ro chỉnh sai path kỹ thuật, tăng khả năng kiểm soát thay đổi qua reason + diff + validate.
- Quyền sửa settings chuyển từ hardcoded role gate sang policy linh hoạt, nhưng vẫn giữ safety fallback cho ADMIN khi policy thiếu/sai.
