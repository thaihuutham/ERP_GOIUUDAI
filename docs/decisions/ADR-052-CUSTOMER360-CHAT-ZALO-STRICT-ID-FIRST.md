# ADR-052: Customer 360 trong chat (Zalo phase 1) với strict ID-first

- Status: Accepted
- Date: 2026-04-07

## Context
- Đội kinh doanh cần xem toàn bộ hồ sơ khách (Customer 360) ngay trong màn chat để tư vấn chính xác theo lịch sử mua hàng và chăm sóc.
- Phase 1 ưu tiên Zalo Personal, nhưng kiến trúc phải sẵn sàng mở rộng Facebook/TikTok mà không nhân bản logic dữ liệu.
- Môi trường vận hành yêu cầu hạn chế link sai khách hàng khi định danh chưa chắc chắn.

## Decision
- Chọn kiến trúc shared backend + shared UI blocks cho Customer 360:
  - mỗi kênh có màn chat riêng;
  - dùng chung engine identity + API tổng hợp + panel 360 + quick-create modal.
- Áp dụng rule nhận diện **strict ID-first**:
  - chỉ auto-link khi `(platform, externalUserId)` khớp exact;
  - không auto-link bằng phone/fuzzy.
- Mở rộng dữ liệu khách hàng:
  - thêm `Customer.needsSummary` cho tóm tắt nhu cầu;
  - giữ `CustomerInteraction` là lịch sử chăm sóc chi tiết chuẩn.
- Chuẩn hóa luồng chat -> khách hàng:
  - `matchStatus` cho thread: `matched | unmatched | suggested`;
  - endpoint gán tay `POST /conversations/threads/:id/link-customer`;
  - endpoint tạo nhanh transaction `POST /conversations/threads/:id/quick-create-customer`
    (create customer tối thiểu + social identity + link thread).
- Customer 360 panel dùng `GET /crm/customers/:id/customer-360` để hiển thị:
  - core profile + social accounts + orders + interactions + contract summary + vehicles.

## Consequences
### Positive
- Giảm thời gian tra cứu khi chat/gọi, tăng chất lượng tư vấn theo ngữ cảnh đầy đủ.
- Tránh link nhầm customer do bỏ auto-link fuzzy/phone.
- Mở đường cho đa kênh mà không phân mảnh dữ liệu.

### Negative
- Tăng thao tác thủ công cho case chưa có social identity exact.
- Cần UI rõ ràng cho luồng unmatched/suggested để nhân viên thao tác nhanh.

## Mitigation
- Bổ sung quick-create prefill social ID ngay trên thread để giảm thao tác.
- Bổ sung suggested-by-phone chỉ để gợi ý, không tự link.
- Đảm bảo endpoint quick-create idempotent theo social identity và thread hiện tại.
