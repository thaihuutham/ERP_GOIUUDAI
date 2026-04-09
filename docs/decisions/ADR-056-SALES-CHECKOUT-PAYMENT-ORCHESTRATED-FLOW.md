# ADR-056: Sales Checkout payment-orchestrated flow (core + adapters)

- Status: Accepted
- Date: 2026-04-08

## Context
- Flow sale hiện tại chưa khóa snapshot thương mại đầy đủ, chưa chuẩn hóa callback ngân hàng idempotent, và còn cho phép thao tác mark-paid thủ công bởi vai trò không phù hợp.
- V1 cần một core checkout dùng chung cho 3 nhóm sản phẩm `INSURANCE|TELECOM|DIGITAL`, nhưng vẫn giữ tương thích dữ liệu/order hiện có của ERP.
- Yêu cầu vận hành: sale chỉ tạo đơn + gửi link/QR; trạng thái thanh toán do webhook xử lý; override chỉ cho vai trò kế toán/admin có audit.

## Decision
1. Chọn mở rộng trên `Order` hiện có, không tách service checkout riêng trong v1.
2. Bổ sung lớp `PaymentIntent` + `PaymentTransaction` + `PaymentOverrideLog` làm trục điều phối thanh toán.
3. Áp dụng trạng thái checkout chuẩn trên đơn:
   - `PENDING_PAYMENT -> PARTIALLY_PAID -> PAID -> ACTIVATING -> ACTIVE` (hoặc `CANCELLED`).
4. Khóa thương mại tại thời điểm tạo đơn bằng `commercialLockedAt` + `commercialSnapshotJson`.
5. Callback ngân hàng đi qua endpoint tích hợp có HMAC + idempotency key; thanh toán một phần được hỗ trợ theo policy.
6. Tự động tắt QR khi intent đạt `PAID` hoặc `CANCELLED`.
7. Legacy endpoint `POST /api/v1/crm/payment-requests/:id/mark-paid` bị harden:
   - sale/staff bị chặn,
   - chỉ manager/admin được override,
   - bắt buộc `reason` + `reference`,
   - ghi dấu audit vào note và đồng bộ invoice thanh toán.
8. V1 áp dụng cho đơn mới từ ngày go-live; không rewrite dữ liệu lịch sử.

## Consequences
### Positive
- Luồng thanh toán tập trung, nhất quán cho nhiều nhóm sản phẩm.
- Giảm sai sót thao tác tay vì webhook-first + guard quyền override.
- Tăng khả năng reconcile do có transaction log và override log riêng.

### Negative
- Tăng số bảng và trạng thái cần vận hành/giám sát.
- Cần quản lý secret callback và retry/reconcile chặt chẽ hơn.
- Một số UX v1 còn thiên về thao tác kỹ thuật (sẽ cải tiến theo phase).

## Alternatives considered
1. Tách bounded context/service checkout độc lập: sạch hơn nhưng scope quá lớn cho v1.
2. Giữ flow cũ + xử lý ngoài ERP bằng n8n: nhanh nhưng không đảm bảo guard quyền/audit trong ERP.

## Follow-up
- Bổ sung rate-limit chuyên biệt cho payment callback endpoint.
- Bổ sung test tích hợp cho idempotency, partial payment, và override race scenarios.
- Bổ sung màn reconcile/ops dashboard cho payment intent và transaction drift.
