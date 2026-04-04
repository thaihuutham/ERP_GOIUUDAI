# ADR-036 — Taxonomy Management Pattern + In-use Delete Guard

## Status
Accepted (2026-04-04)

## Context
Settings Center hiện có nhiều trường kiểu `tags` nhập tự do. Với các taxonomy đang gán trực tiếp lên dữ liệu nghiệp vụ (ví dụ CRM `customerStage`, `source`), cách nhập tự do gây rủi ro:
- giá trị không chuẩn hóa,
- khó quản trị vòng đời taxonomy,
- có thể xóa nhầm taxonomy đang được dữ liệu sử dụng.

## Decision
Chuẩn hóa taxonomy theo pattern quản trị thống nhất:
1. Thêm giá trị qua nút `Thêm`.
2. Quản lý bằng bảng chi tiết (danh sách + tìm kiếm + edit/delete action).
3. Hiển thị thống kê số bản ghi đang áp dụng từng giá trị taxonomy.
4. Cấm xóa taxonomy khi `usageCount > 0` (enforced ở backend).
5. Edit (đổi tên) taxonomy phải đồng bộ dữ liệu đang gán để không tạo giá trị mồ côi.

## Initial Scope (Phase 1)
- `sales_crm_policies.customerTaxonomy.stages` ↔ `Customer.customerStage`
- `sales_crm_policies.customerTaxonomy.sources` ↔ `Customer.source`
- Các form CRM dùng các trường trên phải chuyển sang chọn có kiểm soát (không free-text).

## Consequences
### Positive
- Loại bỏ xóa nhầm taxonomy đang dùng.
- Dữ liệu CRM đồng nhất và dễ vận hành cho user không IT.
- Tạo nền tảng mở rộng sang các trường `tags` tương tự khác.

### Trade-offs
- Tăng complexity backend cho quản lý taxonomy (stats/guard/rename flow).
- Cần rollout theo phase để tránh thay đổi lớn một lúc.

## Rollout Governance
- Kế hoạch mở rộng toàn hệ thống được theo dõi tại: `docs/design/TAXONOMY-TAG-FIELD-ROLLOUT-PLAN.md`.
- Mọi taxonomy mới kiểu “dùng cho dữ liệu nghiệp vụ” phải dùng cùng pattern này.
