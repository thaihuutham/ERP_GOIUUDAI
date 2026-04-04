# ADR-039 — CRM Tag Registry And Custom-Field Structured Options

## Status
Accepted (2026-04-04)

## Context
Rollout chuẩn hóa các trường nhập tự do đang bước vào:
- Phase 4: CRM free tags (`customer.tags`, `interaction.tags`, `interaction.resultTag`).
- Phase 5: custom-fields options đang phụ thuộc CSV/string input.

Rủi ro trước khi chuẩn hóa:
1. Người dùng nhập tag không đồng nhất gây nhiễu báo cáo/filter.
2. Không có guard rename/delete theo usage cho CRM tags.
3. Custom-field options thiếu định danh ổn định (chỉ text) nên khó đổi label mà vẫn giữ semantics.

## Decision
1. Chuẩn hóa CRM tags qua `tagRegistry` trong `sales_crm_policies`:
   - `customerTags`
   - `interactionTags`
   - `interactionResultTags`
2. Backend là lớp enforce cuối:
   - create/update customer và create interaction chỉ chấp nhận giá trị trong registry.
   - settings service hỗ trợ create/rename/delete với usage guard + migrate dữ liệu liên quan khi rename.
3. Custom-fields options chuyển sang model row có khóa ổn định:
   - `{ key, label, order }`
   - canonical value lưu theo `key`, cho phép input theo `label` và map về `key`.
4. Giữ tương thích chuyển tiếp:
   - tiếp tục đọc dữ liệu options cũ dạng string/CSV trong giai đoạn migration.

## Consequences
### Positive
- Dữ liệu CRM tags nhất quán, giảm lỗi nhập do free text.
- Rename/delete tag an toàn hơn nhờ usage guard + migration.
- Custom-field options có định danh ổn định, hỗ trợ đổi label mà không làm sai dữ liệu đã lưu.

### Trade-offs
- Tăng logic normalize/validation ở backend và UI manager.
- Cần duy trì lớp tương thích đọc dữ liệu cũ cho tới khi cleanup hardening phase.
