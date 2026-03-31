# SCALING DESIGN

## Vì sao bỏ Firestore ở bản rebuild
- ERP cần query quan hệ, báo cáo tổng hợp, transaction rõ ràng.
- Với 2M khách hàng, SQL + index + cursor pagination phù hợp hơn cho workload nội bộ.

## Quyết định chính
1. PostgreSQL làm source of truth cho ERP transactional data.
2. Prisma schema chuẩn shared-schema, tất cả model có `tenant_Id`.
3. Lọc tenant toàn cục qua Prisma query extension để tránh quên filter ở từng service.
4. CRM list dùng cursor pagination (`cursor + take`) thay vì tải toàn bộ rồi slice.
5. Audit log dùng kiến trúc tiered storage:
   - `Hot`: PostgreSQL (12 tháng gần nhất, query nhanh).
   - `Cold`: MinIO object storage trên VM (dữ liệu >12 tháng, query chậm hơn có kiểm soát).
   - API/UI tra cứu audit hợp nhất hot+cold, bắt buộc query thời gian cụ thể khi chạm cold tier.

## Mở rộng tương lai
- Tách read-model/reporting khi dữ liệu lớn (materialized views, warehouse).
- Bổ sung queue jobs (BullMQ) cho tác vụ nặng.
- Khi cần, tách module nặng thành service độc lập mà không phá domain boundary hiện có.
