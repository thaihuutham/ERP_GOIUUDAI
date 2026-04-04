# ADR-037 — Typed List Manager For Settings Security/Finance Tags

## Status
Accepted (2026-04-04)

## Context
Trong `Settings Center`, một số field trọng yếu vẫn nhập tự do dạng comma-list:
- `access_security.superAdminIds`
- `access_security.permissionPolicy.superAdminIds`
- `access_security.permissionPolicy.superAdminEmails`
- `finance_controls.postingPeriods.lockedPeriods`

Input tự do gây 3 rủi ro vận hành:
1. Dễ nhập sai format (đặc biệt email và kỳ kế toán).
2. Dữ liệu trùng lặp/không chuẩn hóa giữa các lần chỉnh sửa.
3. Khó dùng cho người không IT vì phải tự nhớ cú pháp comma.

## Decision
Áp dụng pattern `typed list manager` cho nhóm field trên:
1. UI chuyển từ ô text comma sang manager dạng bảng + modal add/edit/delete.
2. Mỗi field gắn `managedListType` để enforce format theo loại:
   - `userId`
   - `email`
   - `period` (`YYYY-MM`)
3. Backend giữ vai trò enforce cuối:
   - chuẩn hóa (trim, dedupe, canonical format),
   - reject payload sai format ngay ở `validateDomainPayload`.
4. Dữ liệu vẫn lưu theo schema hiện tại (array string), không đổi contract domain payload.

## Initial Scope (Phase 2)
- `access_security.superAdminIds`
- `access_security.permissionPolicy.superAdminIds`
- `access_security.permissionPolicy.superAdminEmails`
- `finance_controls.postingPeriods.lockedPeriods`

## Consequences
### Positive
- Đồng nhất chuẩn nhập liệu giữa UI và backend.
- Giảm lỗi do nhập comma thủ công.
- Mở rộng trực tiếp được cho các field `tags` còn lại ở phase sau.

### Trade-offs
- Tăng complexity component settings-center.
- Cần bổ sung test cho cả normalize và validation typed list.

## Rollout Governance
- Theo dõi tổng thể tại:
  - `docs/design/TAXONOMY-TAG-FIELD-ROLLOUT-PLAN.md`
- Quy tắc áp dụng:
  - field list quan trọng mới không dùng input comma tự do,
  - phải khai báo rõ loại list và validation backend tương ứng.
