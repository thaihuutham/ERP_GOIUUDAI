# ADR-004: Shared Schema Tenant Isolation

## Status
Accepted

## Context
Yêu cầu hiện tại chạy cho 1 công ty nhưng phải SaaS-ready để mở nhiều công ty sau này mà không phải viết lại hệ thống.

## Decision
- Tất cả bảng Prisma có trường `tenant_Id`.
- Dùng `nestjs-cls` để lưu tenant context theo request.
- Dùng Prisma query extension để tự động áp tenant filter ở cấp truy vấn toàn cục.

## Consequences
- Giảm rủi ro rò rỉ dữ liệu chéo tenant do dev quên where.
- Phù hợp để mở rộng multi-company chỉ bằng cách thay tenant resolution middleware.
