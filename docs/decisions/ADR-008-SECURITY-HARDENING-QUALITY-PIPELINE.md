# ADR-008: Security Hardening for Deploy + Unified Quality/Security Pipeline

## Status
Accepted

## Context
Dự án cần một quy trình nhất quán để:
- chạy test/lint/build theo chuẩn trước khi release,
- kiểm tra bảo mật dependency định kỳ,
- giảm rủi ro deploy production với secret mặc định hoặc env injection ngoài ý muốn.

## Decision
- Thêm pipeline 1 lệnh:
  - `npm run quality:security`
  - thực thi: lint -> API tests -> build -> `npm audit --audit-level=high --omit=dev`
  - hỗ trợ `AUDIT_STRICT=true` để biến audit thành hard gate.
- Harden deploy script:
  - fail sớm nếu `AUTH_ENABLED=true` nhưng `JWT_SECRET` rỗng hoặc placeholder.
  - chặn giá trị env multiline trước khi ghi `.deploy.env` để tránh env-file injection.
- Giảm bề mặt tấn công runtime container:
  - `npm prune --omit=dev --workspaces --include-workspace-root` trong Docker build stages (API/Web).
- Cập nhật NestJS patch versions trong API workspace (11.1.17).

## Consequences
- Quy trình quality/security có thể chạy local và CI với cùng behavior.
- Deploy production an toàn hơn, khó xảy ra cấu hình sai secret.
- Runtime image gọn hơn và hạn chế mang dev dependencies không cần thiết.
- Một số vulnerability từ upstream dependencies vẫn tồn tại và cần kế hoạch major upgrade riêng (Prisma/Nest transitive chain).
