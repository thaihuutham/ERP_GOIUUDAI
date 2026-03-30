# Retail ERP - SaaS Ready (Shared Schema)

Dự án ERP được rebuild theo kiến trúc mới để giữ toàn bộ feature-set cũ nhưng nâng cấp khả năng mở rộng và bảo trì.

## Stack chính
- API: NestJS + Prisma + PostgreSQL
- Tenant Context: nestjs-cls + Prisma Extensions
- Web: Next.js (React 19)
- Cache/Queue nền tảng: Redis
- Deploy: MacBook -> GitHub -> VM (self-hosted runner, không SSH tay mỗi lần)
- Omnichannel CRM: Zalo cá nhân (`zca-js`) + Zalo OA webhook
- AI QC theo lịch: OpenAI-compatible endpoint (ví dụ 9router)

## Điểm quan trọng
- Mọi bảng Prisma đều có trường `tenant_Id`.
- Tenant filtering được áp dụng toàn cục ở tầng Prisma query extension.
- Hiện tại chạy 1 công ty với `DEFAULT_TENANT_ID`, nhưng middleware/tenant-resolver đã sẵn để mở multi-company.

## Cấu trúc repo
- `apps/api`: NestJS ERP API modules
- `apps/web`: Next.js ERP frontend skeleton
- `packages/shared`: shared types/constants
- `packages/ui`: UI primitives
- `legacy/erp-firebase-v1`: mã nguồn cũ để tham chiếu nghiệp vụ

## Local quick start
```bash
cp config/.env.example config/.env
npm install
npm run prisma:generate
npm run dev:api
# terminal khác
npm run dev:web
```

## API production start (local smoke)
```bash
npm run build --workspace @erp/api
npm run start:prod --workspace @erp/api
```
- `start:prod` chạy trực tiếp `node dist/main.js` (không phụ thuộc `ts-node/esm`).

## Auth & RBAC (Phase 0)
- API guard bật/tắt bằng `AUTH_ENABLED` (`true` ở staging/prod).
- JWT ký HS256 dùng `JWT_SECRET`.
- Public route hiện tại: `GET /api/v1/health`.
- Các route nhạy cảm (`settings`, `workflows`, `finance` mutate) đã gắn role check.

### Phát token dev/staging cho QA
```bash
npm run token:dev --workspace @erp/api -- \
  --role ADMIN \
  --sub qa_admin \
  --email qa-admin@example.com \
  --tenant tenant_demo_company \
  --secret change_me_to_a_long_secret
```

## Verify checklist trước merge
```bash
npm run lint --workspace @erp/api
npm run build --workspace @erp/api
npm run test --workspace @erp/api
```

## Quality + Security pipeline
```bash
npm run quality:security
```
- Script chạy tuần tự: lint -> API tests -> build -> `npm audit` (high, prod deps).
- Trạng thái hiện tại: `npm audit` sạch (`0 vulnerabilities`).
- Bật chế độ chặn cứng khi audit fail:
```bash
AUDIT_STRICT=true npm run quality:security
```
- Ghi chú dependency hardening: xem `docs/decisions/ADR-009-DEPENDENCY-SECURITY-OVERRIDES.md`.

## Zalo + AI conversation quality (Phase mới)
- Ưu tiên kênh `ZALO_PERSONAL` trước, đồng thời hỗ trợ `ZALO_OA`.
- Module API mới:
  - `conversations`: thread/message + ingest message ngoài
  - `zalo`: quản lý account, QR login/reconnect, gửi tin, OA webhook ingest
  - `conversation-quality`: job/runs/evaluations, scheduler batch theo lịch
- Env bắt buộc cho AI scoring:
  - `AI_OPENAI_COMPAT_BASE_URL`
  - `AI_OPENAI_COMPAT_API_KEY`
  - `AI_OPENAI_COMPAT_MODEL` (optional, mặc định `gpt-4o-mini`)
  - `AI_OPENAI_COMPAT_TIMEOUT_MS` (optional)
- Webhook OA:
  - Endpoint: `POST /api/v1/zalo/oa/webhook/messages`
  - Header chữ ký: `x-zalo-signature`
  - Secret kiểm tra chữ ký: `ZALO_OA_WEBHOOK_SECRET` (khuyến nghị bật ở staging/prod)
- OA outbound (optional):
  - `ZALO_OA_OUTBOUND_URL`
  - `ZALO_OA_ACCESS_TOKEN`
  - `ZALO_OA_API_BASE_URL`, `ZALO_OA_OUTBOUND_TIMEOUT_MS` (optional tuning)

## Post-deploy smoke
- Script nhanh cho CRM Conversations: `scripts/deploy/smoke-crm-conversations.sh`
- Xem chi tiết biến môi trường chạy smoke trong `docs/operations/RUNBOOK.md`.
