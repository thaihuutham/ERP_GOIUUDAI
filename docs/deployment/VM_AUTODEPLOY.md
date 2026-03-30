# VM AUTODEPLOY

## Luồng
MacBook -> GitHub -> VM self-hosted runner -> docker compose build/up

## Thành phần deploy
- `postgres` (stateful)
- `redis`
- `api` (NestJS)
- `web` (Next.js)

## Biến môi trường mới cần cấu hình trên VM/Secrets
- `AI_OPENAI_COMPAT_BASE_URL`
- `AI_OPENAI_COMPAT_API_KEY`
- `AI_OPENAI_COMPAT_MODEL` (optional)
- `AI_OPENAI_COMPAT_TIMEOUT_MS` (optional)
- `ZALO_OA_WEBHOOK_SECRET` (khuyến nghị bật)
- `ZALO_OA_OUTBOUND_URL` (optional)
- `ZALO_OA_ACCESS_TOKEN` (optional)
- `ZALO_OA_API_BASE_URL` (optional)
- `ZALO_OA_OUTBOUND_TIMEOUT_MS` (optional)

## Chuẩn hóa inject env qua GitHub Actions
- Workflow `deploy-vm` truyền env vào `scripts/deploy/deploy-from-runner.sh`.
- Script deploy ghi file runtime `${DEPLOY_ENV_FILE:-/opt/erp-retail/.deploy.env}`.
- `docker compose --env-file ... build/up` dùng file này để inject env vào container.
- File `.deploy.env` phải được giữ private trên VM (chmod 600) và không commit vào git.

## Mapping khuyến nghị GitHub
- Secrets:
  - `JWT_SECRET`
  - `DATABASE_URL` (nếu không dùng mặc định)
  - `AI_OPENAI_COMPAT_API_KEY`
  - `ZALO_OA_WEBHOOK_SECRET`
  - `ZALO_OA_ACCESS_TOKEN` (optional)
- Variables:
  - `AUTH_ENABLED`
  - `DEFAULT_TENANT_ID`
  - `AI_OPENAI_COMPAT_BASE_URL`
  - `AI_OPENAI_COMPAT_MODEL`
  - `AI_OPENAI_COMPAT_TIMEOUT_MS`
  - `ZALO_OA_OUTBOUND_URL`
  - `ZALO_OA_API_BASE_URL`
  - `ZALO_OA_OUTBOUND_TIMEOUT_MS`

## Script chính
- `scripts/deploy/deploy-from-runner.sh`
- `scripts/deploy/healthcheck.sh`
- `scripts/deploy/smoke-crm-conversations.sh`

## Healthcheck
- API: `http://127.0.0.1:3001/api/v1/health`
- Web: `http://127.0.0.1:3000`

## Lưu ý vận hành
- Không SSH tay để deploy thường lệ.
- Mọi release qua GitHub Actions workflow.
- Không hardcode key API hoặc session thật vào repo/log CI.
- Deploy script fail sớm nếu `AUTH_ENABLED=true` mà `JWT_SECRET` chưa được set đúng (không cho chạy với placeholder).

## Post-deploy smoke (CRM Conversations)
Chạy sau khi workflow `deploy-vm` hoàn tất để verify nghiệp vụ mục tiêu:
- webhook signature path OA
- AI quality run (`conversation-quality`)
- OA outbound (khi có account/token thật)

Ví dụ:
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_WEBHOOK_SECRET="<zalo-oa-webhook-secret>" \
SMOKE_OA_ACCOUNT_ID="<existing-oa-account-id>" \
SMOKE_OA_EXTERNAL_THREAD_ID="<oa-user-id-or-thread-id>" \
scripts/deploy/smoke-crm-conversations.sh
```
