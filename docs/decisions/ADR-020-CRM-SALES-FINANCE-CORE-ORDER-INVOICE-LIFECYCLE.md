# ADR-020: CRM-Sales-Finance Core Flow (Order Lifecycle + Invoice From Order)

## Status
Accepted

## Context
- Trên web Operations Boards, các nút nghiệp vụ chính (`Tạo khách hàng`, `Tạo đơn hàng`, `Tạo hóa đơn`) trước đây là placeholder UI, chưa gọi API thật.
- Luồng Sales -> Finance chưa có data-flow chuẩn ERP core:
  - chưa có endpoint chuẩn để xuất hóa đơn từ đơn hàng.
  - chưa ràng buộc chặt `1 Order -> 1 Invoice`.
  - điều kiện nghiệp vụ `chỉ xuất hóa đơn khi order APPROVED` chưa được enforce nhất quán.
- Sales API có drift giữa code và DB (đã phát sinh lỗi thiếu cột `Order.employeeId` trên runtime chưa apply migration).

## Decision
- Chuẩn hóa lifecycle order cho ERP core:
  - Bổ sung transition endpoints:
    - `POST /api/v1/sales/orders/:id/approve`
    - `POST /api/v1/sales/orders/:id/reject`
  - Chuẩn hóa state sau quyết định duyệt/sửa:
    - approve => `APPROVED`
    - reject => `REJECTED`
  - Không giữ order ở `PENDING` sau khi đã có quyết định.
- Chuẩn hóa liên kết Order-Invoice:
  - Thêm `Invoice.orderId` (nullable).
  - Thiết lập relation `Invoice.order -> Order`.
  - Enforce ràng buộc `1 Order -> 1 Invoice` bằng unique key tenant-scoped:
    - `@@unique([tenant_Id, orderId])`.
- Bổ sung endpoint nghiệp vụ tạo hóa đơn từ đơn hàng:
  - `POST /api/v1/finance/invoices/from-order`
  - Rule bắt buộc:
    - order phải ở trạng thái `APPROVED`
    - từ chối nếu order đã có invoice liên kết.
- CRM runtime taxonomy:
  - Bổ sung endpoint `GET /api/v1/crm/taxonomy` để web đọc stage/source runtime, tránh hardcode mismatch.
- Deploy/migration gate:
  - Chuẩn hóa rollout theo `prisma migrate deploy` trước khi start `api/web`.
  - Bổ sung checklist release chạy `prisma migrate status` để phát hiện pending migration trước release.

## Consequences
- Luồng core ERP trở nên nhất quán và có thể vận hành end-to-end:
  - tạo customer -> tạo order -> approve order -> xuất invoice -> approve/pay invoice.
- Giảm nguy cơ lỗi nghiệp vụ ở finance do xuất hóa đơn sai điều kiện.
- Tránh duplicate invoice cho cùng order ở tầng DB + service rule.
- Tăng độ an toàn vận hành deploy nhờ migration gate bắt buộc.
- Cần đảm bảo mọi environment (dev/staging/prod) được migrate bằng pipeline, không can thiệp thủ công trên VM.
