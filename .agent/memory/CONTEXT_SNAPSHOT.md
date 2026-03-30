# CONTEXT SNAPSHOT

## Last Updated
- Time: 2026-03-30 09:12 +07
- By: Antigravity
- Session Log: `.agent/sessions/2026-03-30_0910_antigravity.md`

## Current State
- **Repository Initialized and Pushed**:
  - `https://github.com/thaihuutham/ERP_GOIUUDAI.git`
  - Branch: `main`
  - `.gitignore` verified to exclude sensitive data.
- **Security Hardened (Tenant Isolation & Auth)**:
  - `resolveTenantIdFromRequest` prioritizes verified JWT over headers.
  - `JwtAuthGuard` synchronizes `TENANT_CONTEXT_KEY` ('tenantId') into CLS.
  - `AUTH_ENABLED` defaults to `true` in code.
  - `attachTenantIntoData` in Prisma extension forces context `tenant_Id`, ignoring payload overrides.
  - Zalo OA Webhook strictly verifies signatures; fails if `ZALO_OA_WEBHOOK_SECRET` is missing.
- Backend hội thoại đã hoàn chỉnh các nhánh chính:
  - `conversations` (thread/message/evaluation latest)
  - `zalo` (personal login/send + OA webhook ingest + OA outbound send)
  - `conversation-quality` (job/run/evaluation scheduler)
- OA outbound đã bật ở cả API + UI:
  - API: `POST /api/v1/zalo/accounts/:id/oa/messages/send`
  - UI: `crm-conversations-workbench` gọi endpoint OA send thay cho thông báo “chưa bật”.
- API build/start production đã được chuẩn hóa:
  - `apps/api` build dùng `tsc-alias --resolve-full-paths --resolve-full-extension .js`
  - `start`/`start:prod` chạy `node dist/main.js` không phụ thuộc `ts-node/esm`.
- Deploy env rollout cho VM + GitHub Actions đã hoàn thiện:
  - workflow `deploy-vm` truyền env từ GitHub `Secrets/Variables`
  - script deploy tạo `/opt/erp-retail/.deploy.env` (permission `600`)
  - `docker compose --env-file` dùng env runtime thay vì hardcode
  - compose đã nhận đủ nhóm env `AI_OPENAI_COMPAT_*` + `ZALO_OA_*`.
- Đã cập nhật tài liệu vận hành/deploy + ADR:
  - `docs/deployment/VM_AUTODEPLOY.md`
  - `docs/operations/RUNBOOK.md`
  - `README.md`
  - `docs/decisions/ADR-007-DEPLOY-ENV-ROLLOUT-GITHUB-VM.md`
  - `docs/decisions/ADR-010-TENANT-SECURITY-HARDENING.md`
- Đã bổ sung script smoke hậu deploy cho CRM Conversations:
  - `scripts/deploy/smoke-crm-conversations.sh`
  - Kiểm tra 3 nhóm: OA webhook signature, AI quality run-now, OA outbound (optional theo env).
- Đã bổ sung pipeline 1 lệnh cho test + security:
  - `npm run quality:security` -> lint, api test, build, `npm audit` (high/prod deps)
  - hỗ trợ `AUDIT_STRICT=true` để bật hard gate.
- Đã harden deploy/runtime:
  - `deploy-from-runner.sh` fail sớm khi `AUTH_ENABLED=true` nhưng `JWT_SECRET` mặc định/rỗng
  - validate multiline env trước khi ghi `.deploy.env`
  - Docker build stages thêm `npm prune --omit=dev --workspaces --include-workspace-root`
- Đã redesign panel khách hàng trong `crm-operations-board` theo layout vận hành:
  - action bar (`+ Khách hàng mới`, `Nhập khách hàng`, toggle filters)
  - thống kê nhanh theo tập dữ liệu đang lọc
  - bảng có chọn dòng + phân trang số dòng/trang
  - `Column settings` (ẩn/hiện + đổi vị trí cột, lưu localStorage)
  - xuất CSV mở được bằng Excel + nhập CSV map cột linh hoạt.

## Verification (latest)
- `npm run quality:security` ✅ (Pass all 35 tests, audit clean, build success)
- `bash -n scripts/deploy/smoke-crm-conversations.sh` ✅
- `npm audit` ✅ (`0 vulnerabilities`)
- `docker compose config` ✅

## Technical Notes
- **Tenant Spoofing Safeguard**: The system now rejects/warns about header-based tenant IDs if they don't match the authenticated JWT claim.
- **Context Sync**: Ensure `TENANT_CONTEXT_KEY` is always used in Prisma services for multi-tenant isolation.
- `.deploy.env` must be rotated/set correctly on VM as local `.env` now contains placeholders.

## Next Concrete Steps
1. Thiết lập đầy đủ GitHub Secrets/Variables theo runbook mới.
2. Chạy `deploy-vm` (workflow_dispatch) và verify healthcheck production.
3. Chạy `scripts/deploy/smoke-crm-conversations.sh` sau deploy với secrets thật để xác nhận:
   - OA webhook signature (`ZALO_OA_WEBHOOK_SECRET`)
   - AI scoring (`AI_OPENAI_COMPAT_*`)
   - OA outbound (nếu đã có `ZALO_OA_ACCESS_TOKEN`/account id).
4. Theo dõi release upstream Nest/Prisma để rút gọn hoặc gỡ `overrides` khi không còn cần thiết.
