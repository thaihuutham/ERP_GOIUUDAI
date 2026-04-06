# ADR-050: CRM Customer360 endpoint canonicalization

- Status: Accepted
- Date: 2026-04-06

## Context
- API CRM đang tồn tại 2 route alias cùng trỏ một nghiệp vụ khách hàng:
  - `/api/v1/crm/customers`
  - `/api/v1/crm/customer-360`
- Song song này làm tăng chi phí bảo trì:
  - tài liệu và frontend dễ lệch chuẩn endpoint;
  - test/integration phải cover trùng tuyến;
  - khó quản trị contract ổn định cho client mới.

## Decision
- Chuẩn hóa một route duy nhất cho Customer360:
  - **Canonical**: `/api/v1/crm/customers`
- Loại bỏ alias `/api/v1/crm/customer-360` khỏi `CrmController`.
- Cập nhật web module definitions để toàn bộ hành động list/create/update/archive Customer360 dùng `/crm/customers`.
- Tạo data dictionary chuyên biệt cho Customer360 tại:
  - `docs/specs/CUSTOMER360_DATA_DICTIONARY.md`

## Consequences
### Positive
- Contract API rõ ràng, không còn route trùng nghĩa.
- Giảm rủi ro drift giữa backend, frontend, và tài liệu.
- Đơn giản hóa monitoring/observability theo một endpoint chuẩn.

### Negative
- Client cũ còn gọi `/crm/customer-360` sẽ lỗi `404` sau thay đổi.

## Mitigation
- Đã cập nhật endpoint tại frontend nội bộ ERP trong cùng phiên.
- Data dictionary ghi rõ endpoint canonical để onboarding session mới.

