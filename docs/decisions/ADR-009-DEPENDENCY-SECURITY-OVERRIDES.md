# ADR-009: Dependency Security Overrides (Zero Audit Warnings)

## Status
Accepted

## Decision
Giữ `@nestjs/*` ở nhánh `11.1.17` và `prisma/@prisma/client` ở `6.19.2`, đồng thời áp dụng `npm overrides` tại root:
- `path-to-regexp` -> `8.4.0`
- `@prisma/config@6.19.2 > effect` -> `3.20.0`

## Rationale
- Tránh migration lớn Prisma 7 trong cùng phiên hardening (Prisma 7 yêu cầu thay đổi cấu hình datasource/client).
- Loại bỏ toàn bộ cảnh báo `npm audit` mà không thay đổi hành vi nghiệp vụ ERP.
- Giữ nhịp phát hành, giảm rủi ro regression chức năng.

## Notes
- `npm ls` có thể báo `invalid` do override ép phiên bản cao hơn dependency pin cứng; đây là trạng thái có chủ đích để vá CVE.
- Gate bảo mật chuẩn của dự án vẫn là `npm audit` trong `npm run quality:security`.
