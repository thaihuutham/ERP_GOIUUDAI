# ADR-010: Security Hardening for Tenant Isolation and Authenticated Context

## Status
Accepted

## Context
Phát hiện lỗ hổng bảo mật nghiêm trọng (Tenant Spoofing) khi hệ thống tin tưởng hoàn toàn vào Header `x-tenant-id` mà không đối soát với Token JWT. Ngoài ra, việc xác thực Webhook Zalo có thể bị bỏ qua nếu thiếu cấu hình secret, và các thông tin bí mật mặc định trong Docker/Env vẫn còn yếu.

## Decision
- **Ưu tiên JWT cho Tenant Isolation**: `resolveTenantIdFromRequest` luôn ưu tiên `tenantId` từ Token JWT đã xác thực. Nếu có Header gửi kèm, nó phải khớp với Token, nếu không hệ thống sẽ cảnh báo spoofing và ép dùng ID từ Token.
- **Đồng bộ Context tự động**: `JwtAuthGuard` chịu trách nhiệm thiết lập `TENANT_CONTEXT_KEY` ('tenantId') vào CLS ngay sau khi xác thực thành công, đảm bảo tính nhất quán cho Prisma Service.
- **Bắt buộc Webhook Signature**: Loại bỏ khả năng "silent skip" khi xác thực chữ ký Zalo OA Webhook. Nếu thiếu `ZALO_OA_WEBHOOK_SECRET`, hệ thống sẽ ném lỗi 401.
- **Harden Auth Default**: Mặc định `AUTH_ENABLED` là `true` trong toàn bộ hệ thống.
- **Clean Environment**: Thay thế toàn bộ mật khẩu và secret mặc định bằng placeholders (`REPLACE_ME`) trong `.env` và `docker-compose.yml`.
- **Global Payload Protection**: Prisma Extension (`attachTenantIntoData`) sẽ ghi đè trường `tenant_Id` từ context, ngăn chặn việc người dùng gửi thủ công trường này trong body request để phá vỡ cách ly.

## Consequences
- Hệ thống đạt mức bảo mật cao hơn cho mô hình SaaS/Multi-tenant.
- Các công cụ debug/test không sử dụng Token hợp lệ sẽ không thể truy cập dữ liệu (phải dùng Header cho route Public hoặc tắt Auth thủ công).
- Rollout production bắt buộc phải cấu hình đầy đủ các biến môi trường bí mật.
