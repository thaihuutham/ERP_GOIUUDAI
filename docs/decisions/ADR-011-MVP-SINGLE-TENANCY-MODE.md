# ADR-011: MVP Single-Tenancy Mode (GOIUUDAI Locked)

## Status
Accepted

## Context
- Dự án giai đoạn MVP chưa có luồng đăng ký công ty/tài khoản SaaS.
- Việc giữ cơ chế nhận tenant từ JWT/Header làm tăng độ phức tạp vận hành và rủi ro cấu hình sai.
- Nhu cầu hiện tại là chạy ổn định cho 1 công ty nội bộ duy nhất.

## Decision
- Bổ sung biến cấu hình `TENANCY_MODE` với mặc định `single`.
- Đặt `AUTH_ENABLED=false` làm mặc định cho giai đoạn MVP single-tenant để vận hành nội bộ không cần luồng đăng nhập.
- Khi `TENANCY_MODE=single`:
  - Resolver tenant luôn trả `DEFAULT_TENANT_ID` (hiện tại `GOIUUDAI`).
  - Bỏ qua tenant từ header/JWT cho việc định tuyến dữ liệu.
  - Nếu bật auth thủ công (`AUTH_ENABLED=true`), `JwtAuthGuard` từ chối token mang tenant khác `DEFAULT_TENANT_ID`.
- Khi cần mở lại đa công ty trong tương lai, chuyển `TENANCY_MODE=multi` để dùng lại luồng tenant theo JWT/Header.

## Consequences
- Giảm mạnh rủi ro tenant spoofing/desync ở MVP.
- Hành vi runtime rõ ràng, dễ vận hành và debug hơn.
- Loại bỏ tình trạng `401` hàng loạt ở UI khi chưa có login flow.
- Khi mở multi-tenant sau này, cần UAT lại các luồng auth/token issuance theo nhiều tenant.
