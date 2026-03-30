# CURRENT_TASK

## Trạng thái tổng quan
- Phase: CRM Omnichannel + AI QC Integration (backend + inbox UI + API flow tests + web e2e)
- Last updated: 2026-03-30 09:12 +07
- Owner: Antigravity session

## In Progress
### Task ID: RETAIL-CRM-004
- Tên: Bảo mật hóa hệ thống Đa thuê (SaaS Hardening)
- Mục tiêu:
  - Khắc phục lỗ hổng Tenant Spoofing qua Header.
  - Đồng bộ Tenant Context từ Token JWT vào CLS.
  - Thắt chặt kiểm tra chữ ký Zalo OA Webhook.
  - Chuẩn hóa cấu hình bí mật (Secrets) tránh lộ lọt.
- Tiến độ:
  - [x] Harden `resolveTenantIdFromRequest` (JWT priority)
  - [x] Harden `JwtAuthGuard` (CLS context sync + default Auth true)
  - [x] Harden Zalo Webhook signature verification (Strict mode)
  - [x] Harden Prisma extension (Payload override protection)
  - [x] Clean up `.env` and `docker-compose.yml` (Placeholders for secrets)
  - [x] Verify full pipeline `npm run quality:security` (35 tests pass)
  - [x] Initialize Git repository and Push to `https://github.com/thaihuutham/ERP_GOIUUDAI.git`

## Completed Tasks
### Task ID: RETAIL-CRM-002
- [x] Tích hợp Zalo (personal + OA) và chấm điểm hội thoại AI theo lịch
### Task ID: RETAIL-CRM-003
- [x] Redesign trang khách hàng theo layout vận hành thực tế

## Blocked
- Không blocked kỹ thuật tại thời điểm cập nhật.

## Next Up
1. Set đầy đủ GitHub Secrets/Variables theo runbook mới, sau đó chạy `deploy-vm` (workflow_dispatch) để xác nhận rollout thực tế.
2. Chạy `scripts/deploy/smoke-crm-conversations.sh` trên môi trường đã deploy để verify nghiệp vụ thật với hệ thống bảo mật mới.
3. Theo dõi release upstream Nest/Prisma để gỡ dần `npm overrides` khi bản chính thức đã vá CVE.
4. Nếu cần import/xuất chuẩn `.xlsx` (không qua CSV), bổ sung endpoint/import service chuyên dụng và worker validate dữ liệu theo batch.
