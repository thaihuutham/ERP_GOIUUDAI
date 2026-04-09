# ADR-057: Canonical effective date model for checkout/service lifecycle

- Status: Accepted
- Date: 2026-04-08

## Context
- Dữ liệu hiệu lực dịch vụ hiện rải rác theo nhiều field legacy (`policyFromAt/policyToAt/currentExpiryAt/...`) gây khó chuẩn hóa báo cáo và nhắc gia hạn.
- Checkout v1 cần một nguồn chuẩn để điều phối activation, renewal reminder, và đồng bộ hợp đồng dịch vụ xuyên nhóm sản phẩm.
- Đồng thời không được phá tương thích dữ liệu cũ đang được màn CRM/Finance hiện hữu sử dụng.

## Decision
1. Chọn `OrderItem.effectiveFrom/effectiveTo` làm canonical source ở lớp checkout line.
2. Khi activation line hoàn tất:
   - cập nhật `OrderItem.effectiveFrom/effectiveTo`,
   - đồng bộ `ServiceContract.startsAt/endsAt`.
3. Tiếp tục duy trì mapping sang field legacy theo loại sản phẩm/hợp đồng để không phá luồng cũ.
4. `effectiveFrom/effectiveTo` được dùng làm nguồn chuẩn cho logic nhắc gia hạn trong phase checkout v1.
5. Với dữ liệu lịch sử chưa qua checkout v1: giữ nguyên hành vi hiện có, không backfill bắt buộc trong phase này.

## Consequences
### Positive
- Một điểm chuẩn thống nhất cho hiệu lực dịch vụ mới.
- Giảm sai lệch giữa dữ liệu line-item, hợp đồng và tác vụ nhắc hạn.
- Cho phép tiến dần sang mô hình chuẩn mà không phải migration lớn ngay.

### Negative
- Cần duy trì lớp mapping song song canonical <-> legacy trong thời gian chuyển tiếp.
- Cần test chéo kỹ theo từng nhóm sản phẩm để tránh lệch ngày hiệu lực.

## Alternatives considered
1. Dùng luôn toàn bộ field legacy làm nguồn chuẩn: loại vì phân mảnh, khó mở rộng và khó kiểm soát nhất quán.
2. Backfill và cắt legacy ngay trong v1: loại vì rủi ro cao, scope lớn, ảnh hưởng báo cáo hiện tại.

## Follow-up
- Bổ sung test matrix theo product group cho sync canonical/legacy.
- Định nghĩa rõ migration phase tiếp theo để giảm dần phụ thuộc field legacy.
- Bổ sung telemetry kiểm tra drift giữa `OrderItem.effective*` và `ServiceContract.*`.
