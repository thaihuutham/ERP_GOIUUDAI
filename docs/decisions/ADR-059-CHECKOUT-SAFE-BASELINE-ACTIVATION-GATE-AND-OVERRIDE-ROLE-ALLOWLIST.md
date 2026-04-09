# ADR-059: Checkout safe-baseline activation gate + override role allowlist

- Status: Accepted
- Date: 2026-04-09

## Context
- Blueprint checkout v1 đã có payment orchestration và override/audit, nhưng vẫn còn gap vận hành:
  - activation line có thể complete khi trạng thái thanh toán chưa đủ theo policy,
  - cấu hình override roles có thể chứa role ngoài runtime v1 (`ACCOUNTANT`), gây lệch giữa Settings/UI và auth backend.
- Mục tiêu giai đoạn hiện tại là hardening theo safe baseline, không mở rộng role model ngoài `ADMIN/MANAGER/STAFF`.

## Decision
1. Thêm precondition tại `complete activation line`:
   - nếu policy nhóm sản phẩm yêu cầu full payment (`requireFullPayment=true`), activation bị chặn cho tới khi `PaymentIntent.status=PAID`.
2. Chuẩn hóa `paymentPolicy.overrideRoles` về allowlist runtime v1:
   - chỉ cho phép `ADMIN`, `MANAGER`,
   - giá trị ngoài allowlist bị loại bỏ trong normalize + runtime.
3. Đồng bộ UI Settings:
   - bỏ role ngoài runtime v1 khỏi danh sách chọn override.

## Consequences
### Positive
- Giảm rủi ro kích hoạt dịch vụ khi chưa hoàn tất thanh toán.
- Loại bỏ mismatch role giữa Settings và runtime guard.
- Tăng tính nhất quán giữa API policy, auth guard và UI vận hành.

### Negative
- Một số luồng thủ công cũ (kỳ vọng complete activation sớm) cần follow đúng payment-first policy.
- Đòi hỏi vận hành cập nhật quy trình xử lý exception qua override + audit thay vì bypass activation.

## Alternatives considered
1. Mở role `ACCOUNTANT` ngay: loại ở giai đoạn này vì blast radius lớn (schema/auth/web/test).
2. Chỉ cảnh báo, không chặn activation: loại vì không đạt mục tiêu hardening và dễ phát sinh sai lệch invoice/service lifecycle.
