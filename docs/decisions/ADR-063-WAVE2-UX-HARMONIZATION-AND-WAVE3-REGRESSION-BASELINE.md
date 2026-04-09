# ADR-063: Wave 2 UX harmonization and Wave 3 regression baseline for domain module boards

- Status: Accepted
- Date: 2026-04-09

## Context
- ADR-062 đã hoàn tất Wave 1 migrate 5 module (`catalog`, `assets`, `projects`, `reports`, `notifications`) sang domain boards + dynamic option source.
- Follow-up bắt buộc của ADR-062:
  - Wave 2: chuẩn hóa toolbar/banner/loading/error/disabled reason.
  - Wave 3: chốt checklist mapping nút/trường nghiệp vụ làm baseline regression.
- Trạng thái trước patch:
  - module bị chặn quyền đang trả `null` (màn hình trắng cục bộ ở level board).
  - `ModuleWorkbench` chưa phản ánh rõ trạng thái degrade khi option source lỗi.
  - thiếu tài liệu regression baseline chuyên biệt cho 5 module Wave 1.

## Decision
1. Chuẩn hóa UX runtime trong `ModuleWorkbench`:
   - hiển thị thống nhất các trạng thái `error/success/info/warning` qua banner,
   - bổ sung hiển thị số filter đang áp dụng và nút `Xóa bộ lọc`,
   - hiển thị cảnh báo khi một phần action bị giới hạn quyền,
   - hiển thị trạng thái chỉ xem trong side panel khi không còn row action khả dụng.
2. Không cho board trả `null` khi deny:
   - `DomainModuleBoard` và `ModuleScreen` hiển thị notice có reason (`POLICY_LOADING`, `MODULE_DENIED`, ...).
3. Chuẩn hóa message bảng dùng chung:
   - mở rộng `StandardDataTable` hỗ trợ `loadingMessage` + `emptyMessage` theo feature.
4. Chốt tài liệu Wave 3 baseline:
   - tạo `docs/specs/WAVE3_DOMAIN_MODULES_REGRESSION_BASELINE.md` làm contract regression UI cho 5 module.

## Consequences
### Positive
- Giảm “silent failure” khi policy chưa sẵn sàng hoặc module bị chặn.
- Người vận hành hiểu rõ trạng thái hệ thống khi option source bị degrade.
- Regression có baseline rõ ràng cho các patch sau, giảm rủi ro drift behavior.

### Negative
- Tăng nhẹ độ phức tạp `ModuleWorkbench` (thêm state cho option hydration + warning).
- Cần duy trì tài liệu baseline song song khi đổi action/filter contract.

## Non-goals
- Không thay đổi business rules backend ERP.
- Không thay đổi role model hay policy engine.
- Không redesign toàn bộ UI identity của các module ngoài phạm vi board đã migrate.

## Follow-up
- Khi mở rộng migrate board cho module khác, phải áp lại invariants của ADR-063 ngay từ đầu.
- Mọi thay đổi action/filter của 5 module trong scope phải cập nhật `WAVE3_DOMAIN_MODULES_REGRESSION_BASELINE.md`.
