# ADR-038 — HR Appendix Managed List For Options And Template Fields

## Status
Accepted (2026-04-04)

## Context
Nhóm cấu hình HR appendix trong `Settings Center` còn dùng nhập tự do cho:
- `hr_policies.appendixFieldCatalog.custom_*.options`
- `hr_policies.appendixTemplates.PLxx.fields`

Nhập tự do tạo rủi ro vận hành:
1. Option bị trùng/không chuẩn hóa.
2. Template fieldKey lệch catalog chuẩn.
3. UI không thân thiện cho non-IT vì phải nhớ cú pháp key.

## Decision
Áp dụng pattern managed-list đồng bộ với phase 2:
1. UI chuyển các field HR trên sang `managedList`.
2. Bổ sung 2 kiểu list mới:
   - `freeText`: quản lý option text có dedupe/trim.
   - `fieldKey`: picker bắt buộc chọn từ `appendixFieldCatalog`.
3. Backend chuẩn hóa và enforce:
   - options của field `select` được trim + dedupe.
   - template fieldKey được normalize theo catalog và reject key ngoài catalog/namespace.
4. Giữ nguyên contract lưu trữ domain (array/list trong payload HR), không đổi schema DB.

## Scope (Phase 3)
- `appendixFieldCatalog.custom_1.options`
- `appendixFieldCatalog.custom_2.options`
- `appendixFieldCatalog.custom_3.options`
- `appendixTemplates.PL01..PL10.fields`

## Consequences
### Positive
- Đồng bộ chuẩn nhập có kiểm soát cho HR appendix.
- Giảm lỗi dữ liệu do key tự gõ.
- Tạo nền tảng rollout cho các field tags tự do còn lại.

### Trade-offs
- Tăng logic UI cho managed-list/picker options.
- Cần thêm test e2e để giữ ổn định behavior theo tab HR.
