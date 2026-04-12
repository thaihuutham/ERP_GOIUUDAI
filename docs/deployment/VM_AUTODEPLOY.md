# VM AUTODEPLOY

## Luồng
MacBook -> GitHub -> VM self-hosted runner -> docker compose build/up -> `prisma migrate deploy` -> healthcheck -> optional post-deploy Auth/RBAC smoke

## Thành phần deploy
- `postgres` (stateful)
- `redis`
- `meilisearch` (search index)
- `minio` (cold-tier object storage cho audit >12 tháng)
- `api` (NestJS)
- `web` (Next.js)

## Biến môi trường mới cần cấu hình trên VM/Secrets
- `SETTINGS_ENCRYPTION_MASTER_KEY` (bắt buộc nếu lưu key trực tiếp từ UI; AES-256-GCM master key, 32-byte base64 hoặc hex)
- `AI_OPENAI_COMPAT_BASE_URL`
- `AI_OPENAI_COMPAT_API_KEY` (fallback khi UI chưa nhập `integrations.ai.apiKey`)
- `AI_GEMINI_API_KEY` (optional fallback cho OCR Gemini khi chưa nhập key pool/UI)
- `AI_OPENAI_COMPAT_MODEL` (optional)
- `AI_OPENAI_COMPAT_TIMEOUT_MS` (optional)
- `ZALO_OA_WEBHOOK_SECRET` (fallback khi UI chưa nhập `integrations.zalo.webhookSecret`)
- `ZALO_OA_OUTBOUND_URL` (optional)
- `ZALO_OA_ACCESS_TOKEN` (fallback khi UI chưa nhập `integrations.zalo.accessToken`)
- `ZALO_OA_API_BASE_URL` (optional)
- `ZALO_OA_OUTBOUND_TIMEOUT_MS` (optional)
- `BHTOT_API_KEY` (fallback khi UI chưa nhập `integrations.bhtot.apiKey`)
- `SEARCH_ENGINE` (`sql` hoặc `meili_hybrid`)
- `MEILI_HOST`
- `MEILI_MASTER_KEY` (optional nếu không bật auth)
- `MEILI_INDEX_PREFIX` (optional)
- `MEILI_TIMEOUT_MS` (optional)
- `MEILI_ENABLE_WRITE_SYNC` (`true|false`)
- `PERMISSION_ENGINE_ENABLED` (`true|false`)
- `IAM_V2_ENABLED` (`true|false`, optional env override cho guard IAM v2)
- `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED` (`true|false`, bật smoke Auth/RBAC tự động sau deploy)
- `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` (CSV module đang enforce, ví dụ `sales,finance,crm`)
- `PHASE4_RELEASE_GATE_ENABLED` (`true|false`, bật release gate pre-deploy; mặc định workflow = `true`)
- `SMOKE_PAYMENT_CALLBACK_REQUIRED` (`true|false`, strict callback route check trong `smoke-production-readiness.sh`; mặc định `false`)
- `NEXT_PUBLIC_AUTH_ENABLED` (`true|false`, web login gate)
- `AUDIT_ARCHIVE_S3_ENDPOINT` (vd `http://minio:9000`)
- `AUDIT_ARCHIVE_S3_BUCKET` (vd `erp-audit-archive`)
- `AUDIT_ARCHIVE_S3_REGION` (default `us-east-1`)
- `AUDIT_ARCHIVE_S3_ACCESS_KEY`
- `AUDIT_ARCHIVE_S3_SECRET_KEY`
- `AUDIT_ARCHIVE_S3_FORCE_PATH_STYLE` (`true|false`, MinIO nên để `true`)
- `AUDIT_ARCHIVE_S3_TLS_ENABLED` (`true|false`)
- `AUDIT_MAINTENANCE_SCHEDULER_ENABLED` (`true|false`)
- `AUDIT_MAINTENANCE_SCHEDULER_UTC_HOUR` (default `19` = 02:00 ICT)
- `AUDIT_COLD_QUERY_MAX_DAYS` (default `31`)
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_PORT` (default `9000`)
- `MINIO_CONSOLE_PORT` (default `9001`)

## Chuẩn hóa inject env qua GitHub Actions
- Workflow `deploy-vm` truyền env vào `scripts/deploy/deploy-from-runner.sh`.
- Script deploy ghi file runtime `${DEPLOY_ENV_FILE:-/opt/erp-retail/.deploy.env}`.
- `docker compose --env-file ... build/up` dùng file này để inject env vào container.
- File `.deploy.env` phải được giữ private trên VM (chmod 600) và không commit vào git.
- Từ ADR-026: integrations key có thể nhập trực tiếp trong Settings Center; env secret đóng vai trò fallback/runtime bootstrap.

### Mặc định hiện tại (MVP single-tenant, có thể override bằng GitHub vars)
- `AUTH_ENABLED=true`
- `DEFAULT_TENANT_ID=GOIUUDAI`
- `TENANCY_MODE=single`

## Mapping khuyến nghị GitHub
- Secrets:
  - `SETTINGS_ENCRYPTION_MASTER_KEY`
  - `JWT_SECRET`
  - `DATABASE_URL` (nếu không dùng mặc định)
  - `AI_OPENAI_COMPAT_API_KEY` (optional fallback)
  - `AI_GEMINI_API_KEY` (optional fallback cho OCR Gemini)
  - `ZALO_OA_WEBHOOK_SECRET` (optional fallback)
  - `ZALO_OA_ACCESS_TOKEN` (optional fallback)
  - `BHTOT_API_KEY` (optional fallback)
  - `MEILI_MASTER_KEY` (optional)
- Variables:
  - `AUTH_ENABLED` (mặc định workflow: `true`)
  - `DEV_AUTH_BYPASS_ENABLED` (mặc định workflow: `false`, chỉ cho môi trường non-production)
  - `NEXT_PUBLIC_AUTH_ENABLED` (mặc định workflow: `true`)
  - `NEXT_PUBLIC_DEV_AUTH_BYPASS_ENABLED` (mặc định workflow: `false`, phải đi cùng `DEV_AUTH_BYPASS_ENABLED=true`)
  - `DEFAULT_TENANT_ID` (mặc định workflow: `GOIUUDAI`)
  - `TENANCY_MODE` (mặc định workflow: `single`)
  - `PERMISSION_ENGINE_ENABLED` (mặc định workflow: `true`)
  - `IAM_V2_ENABLED` (optional; để trống nếu muốn lấy hoàn toàn từ `settings.access_security.iamV2.enabled`)
  - `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED` (mặc định workflow: `false`)
  - `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` (mặc định workflow: `sales,finance,crm`)
  - `PHASE4_RELEASE_GATE_ENABLED` (mặc định workflow: `true`; set `false` chỉ khi cần bypass có kiểm soát)
  - `AI_OPENAI_COMPAT_BASE_URL`
  - `AI_OPENAI_COMPAT_MODEL`
  - `AI_OPENAI_COMPAT_TIMEOUT_MS`
  - `AI_GEMINI_API_KEY` (optional)
  - `ZALO_OA_OUTBOUND_URL`
  - `ZALO_OA_API_BASE_URL`
  - `ZALO_OA_OUTBOUND_TIMEOUT_MS`
  - `SEARCH_ENGINE` (`meili_hybrid` mặc định, fallback về `sql` khi cần)
  - `MEILI_HOST` (ví dụ `http://meilisearch:7700`)
  - `MEILI_INDEX_PREFIX`
  - `MEILI_TIMEOUT_MS`
  - `MEILI_ENABLE_WRITE_SYNC` (mặc định Workflow/Docker: `true`)
  - `MEILI_PORT` (optional, mặc định `7700`)
  - `AUDIT_ARCHIVE_S3_ENDPOINT`
  - `AUDIT_ARCHIVE_S3_BUCKET`
  - `AUDIT_ARCHIVE_S3_REGION`
  - `AUDIT_ARCHIVE_S3_ACCESS_KEY`
  - `AUDIT_ARCHIVE_S3_SECRET_KEY`
  - `AUDIT_ARCHIVE_S3_FORCE_PATH_STYLE`
  - `AUDIT_ARCHIVE_S3_TLS_ENABLED`
  - `AUDIT_MAINTENANCE_SCHEDULER_ENABLED`
  - `AUDIT_MAINTENANCE_SCHEDULER_UTC_HOUR`
  - `AUDIT_COLD_QUERY_MAX_DAYS`
  - `MINIO_ROOT_USER`
  - `MINIO_ROOT_PASSWORD`
  - `MINIO_PORT`
  - `MINIO_CONSOLE_PORT`

Mẫu cấu hình Phase 2 UAT:
- `docs/deployment/PHASE2_UAT_GITHUB_VARIABLES_TEMPLATE.md`

## Script chính
- `scripts/deploy/deploy-from-runner.sh`
- `scripts/deploy/healthcheck.sh`
- `scripts/deploy/smoke-crm-conversations.sh`
- `scripts/deploy/smoke-assistant-access-boundary.sh`
- `scripts/deploy/iam-v2-rollout.sh`
- `scripts/deploy/smoke-auth-rbac-modules.sh`
- `scripts/deploy/smoke-production-readiness.sh`
- `scripts/quality/run-phase4-release-gate.sh`

## Phase 4 release gate (pre-deploy)
- Workflow `deploy-vm` chạy release gate trước bước deploy khi `PHASE4_RELEASE_GATE_ENABLED != false`.
- Gate hiện tại:
  1. Infra checks (docker postgres + db port),
  2. `prisma migrate status`,
  3. API lint/build + targeted tests checkout callback/override,
  4. Web lint/build,
  5. Phase 3 stabilization gate,
  6. production-readiness smoke.

## Migration gate (bắt buộc)
- Deploy script luôn chạy `prisma migrate deploy` trước khi khởi động `api/web` và trước healthcheck.
- Nếu migrate thất bại, deploy fail sớm và không tiếp tục rollout.

## Release checklist (DB schema)
- Trước release: chạy `npm run prisma:migrate:status --workspace @erp/api` trên môi trường target hoặc runner tương đương.
- Kỳ vọng: không còn migration pending.
- Sau deploy: xác nhận lại API health và smoke nghiệp vụ.

## Assistant schema rollout checklist
Áp dụng khi rollout migration `20260401170000_add_assistant_access_boundary_v1`.

1. Pre-check migration status:
```bash
DATABASE_URL=<target_db_url> npm run prisma:migrate:status --workspace @erp/api
```
2. Apply migration trên môi trường target (staging trước, rồi production):
```bash
DATABASE_URL=<target_db_url> npm run prisma:migrate:deploy --workspace @erp/api
```
3. Xác nhận migration đã hết pending:
```bash
DATABASE_URL=<target_db_url> npm run prisma:migrate:status --workspace @erp/api
```
4. Verify table assistant đã tồn tại:
```bash
docker exec erp-postgres psql -U erp -d erp_retail -Atc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Assistant%';"
```
5. Verify API access-boundary:
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_AUTH_ENABLED="${AUTH_ENABLED:-false}" \
SMOKE_JWT_SECRET="<jwt-secret-if-auth-enabled>" \
scripts/deploy/smoke-assistant-access-boundary.sh
```

## Healthcheck
- API: `http://127.0.0.1:3001/api/v1/health`
- Web: `http://127.0.0.1:3000`
- MinIO API: `http://127.0.0.1:9000/minio/health/live`
- MinIO Console: `http://127.0.0.1:9001`

## Lưu ý vận hành
- Không SSH tay để deploy thường lệ.
- Mọi release qua GitHub Actions workflow.
- Không hardcode key API hoặc session thật vào repo/log CI.
- Deploy script fail sớm nếu `AUTH_ENABLED=true` mà `JWT_SECRET` chưa được set đúng (không cho chạy với placeholder).
- Khi `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED=true`, deploy script sẽ tự chạy `scripts/deploy/smoke-auth-rbac-modules.sh` sau healthcheck.
- Audit cold-tier:
  - Job archive + prune + verify chạy tự động hằng ngày (scheduler trong API).
  - Chỉ prune hot sau khi upload archive thành công và verify object tồn tại.
  - Khi điều tra dữ liệu >12 tháng, UI/API yêu cầu query theo `from/to` cụ thể (không scan vô hạn).

## Runbook audit archive (MinIO)
1. Re-run maintenance thủ công theo ngày (khi cần):
```bash
curl -X POST "http://127.0.0.1:3001/api/v1/settings/data-governance/maintenance/run" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: GOIUUDAI" \
  -d '{"dryRun": false, "triggeredBy": "manual-ops"}'
```
2. Kiểm tra manifest:
```sql
SELECT "windowStart","windowEnd","status","rowCount","objectKey","checksumSha256","gzChecksumSha256","archivedAt","prunedAt"
FROM "audit_archive_manifests"
WHERE "tenant_Id"='GOIUUDAI'
ORDER BY "windowStart" DESC
LIMIT 50;
```
3. Verify object trên MinIO:
```bash
mc alias set erp-minio http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc stat "erp-minio/erp-audit-archive/<objectKey>"
```
4. Khôi phục chunk archive để điều tra:
```bash
mc cat "erp-minio/erp-audit-archive/<objectKey>" | gunzip > /tmp/audit-window.ndjson
```

## Post-deploy smoke (CRM Conversations)
Chạy sau khi workflow `deploy-vm` hoàn tất để verify nghiệp vụ mục tiêu:
- webhook signature path OA
- AI quality run (`conversation-quality`)
- OA outbound (khi có account/token thật)
- Search status + reindex:
  - `GET /api/v1/settings/search/status`
  - `POST /api/v1/settings/search/reindex` với payload `{"entity":"all"}`
- IAM v2 mismatch observability:
  - `GET /api/v1/settings/permissions/iam-v2/mismatch-report?limit=20`

Ví dụ:
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_WEBHOOK_SECRET="<zalo-oa-webhook-secret>" \
SMOKE_OA_ACCOUNT_ID="<existing-oa-account-id>" \
SMOKE_OA_EXTERNAL_THREAD_ID="<oa-user-id-or-thread-id>" \
scripts/deploy/smoke-crm-conversations.sh
```

Ghi chú:
- `smoke-crm-conversations.sh` mặc định đọc tenant từ `DEFAULT_TENANT_ID` (fallback `GOIUUDAI`).
- Auth mode của smoke mặc định đọc từ `AUTH_ENABLED` (fallback `false`).
- Có thể tạm bỏ qua kiểm tra AI khi chưa cấp key bằng `SMOKE_SKIP_AI_QUALITY=true`.
- Có thể tạm bỏ qua kiểm tra OA outbound bằng `SMOKE_SKIP_OA_OUTBOUND=true`.

## Post-deploy smoke (AI Assistant access boundary)
Smoke này xác nhận guard bảo mật end-to-end cho case report-dispatch scope mismatch:
- tạo channel có scope hẹp (`self`)
- tạo report run có `dispatchChat=true`
- verify chat artifact không tạo dispatch attempt nếu scope mismatch.

Ví dụ:
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_AUTH_ENABLED="${AUTH_ENABLED:-false}" \
SMOKE_JWT_SECRET="<jwt-secret-if-auth-enabled>" \
SMOKE_AUTH_ROLE="ADMIN" \
scripts/deploy/smoke-assistant-access-boundary.sh
```

## Rollout IAM/Permission đề xuất
1. `AUTH_ENABLED=true`, `NEXT_PUBLIC_AUTH_ENABLED=true`, `PERMISSION_ENGINE_ENABLED=true` (secure default).
2. Seed account nhân viên + vị trí + rule quyền trong Settings Center.
3. UAT với:
   - `AUTH_ENABLED=true`
   - `NEXT_PUBLIC_AUTH_ENABLED=true`
   - `PERMISSION_ENGINE_ENABLED=true`
4. Sau khi UAT pass toàn bộ phân hệ, bật prod theo cùng bộ flag.

## IAM v2 rollout/rollback (module-by-module)
- Runtime source of truth:
  - `settings.access_security.iamV2.enabled`
  - `settings.access_security.iamV2.mode` (`OFF|SHADOW|ENFORCE`)
  - `settings.access_security.iamV2.enforcementModules` (danh sách module hoặc `all/*`)
- Optional env override:
  - `IAM_V2_ENABLED=true|false` (chỉ override cờ enabled ở guard; mode/module vẫn lấy từ settings).
- Khuyến nghị rollout an toàn:
  1. Bắt đầu `mode=SHADOW`, `enforcementModules` theo từng module nhỏ (`crm`, `sales`, ...), theo dõi mismatch report.
  2. Khi mismatch ổn định, chuyển module mục tiêu sang `ENFORCE`.
  3. Mở rộng dần sang các module khác, không bật all-modules một bước.
- Rollback nhanh theo module:
  1. Đưa `mode` về `SHADOW` để ngừng deny cứng nhưng vẫn quan sát mismatch.
  2. Gỡ module khỏi `enforcementModules` nếu chỉ rollback cục bộ.
  3. Nếu sự cố rộng, đặt `mode=OFF` hoặc tạm `IAM_V2_ENABLED=false`.
  4. Verify lại bằng endpoint mismatch report + smoke permission/e2e trước khi rollout lại.

### Lệnh rollout nhanh (khuyến nghị cho UAT)
```bash
# Xem trạng thái IAM v2 hiện tại
scripts/deploy/iam-v2-rollout.sh status

# Bước 1: SHADOW module đầu tiên
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh shadow sales

# Bước 2: ENFORCE module đã ổn định
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh enforce sales

# Mở rộng dần theo thứ tự safe-baseline
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh shadow sales,finance,crm
```

### Rollback nhanh theo module
```bash
# Giảm mức cưỡng chế toàn bộ về SHADOW
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh rollback-shadow

# Gỡ riêng một module khỏi enforcement list
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh rollback-module sales
```

## Safe-baseline rollout order (checkout-first)
- Module rollout khuyến nghị sau khi checkout gate đã ổn định:
  1. `sales`
  2. `finance`
  3. `crm`
  4. `hr`
  5. `scm`
  6. `assets`
  7. `projects`
  8. `reports`
- Mỗi module đi theo chu trình:
  - `SHADOW` -> theo dõi mismatch + e2e mục tiêu -> `ENFORCE`.
  - Nếu lỗi, rollback module đó về `SHADOW` ngay, không rollback toàn hệ thống trừ khi sự cố diện rộng.

## Hypercare checklist (7-14 ngày sau go-live)
- Theo dõi bắt buộc:
  - Tỷ lệ callback payment fail/reject.
  - Số lần override thanh toán thủ công theo ngày.
  - Thời gian xử lý từ phát sinh payment exception -> resolved.
  - Mismatch IAM v2 theo module.
- Ngưỡng cảnh báo vận hành:
  - Callback fail tăng đột biến theo giờ.
  - Override thủ công vượt baseline vận hành đã thống nhất.
  - Mismatch IAM v2 không giảm sau 2 chu kỳ rollout liên tiếp.

## Post-deploy smoke cho Auth + RBAC (module đang enforce)
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_ENFORCED_MODULES="sales,finance,crm" \
scripts/deploy/smoke-auth-rbac-modules.sh
```

Smoke này kiểm tra:
- health API,
- auth boundary (`settings/center` không token bị chặn khi auth bật),
- mismatch report endpoint,
- probe read endpoint cho từng module đang enforce.
