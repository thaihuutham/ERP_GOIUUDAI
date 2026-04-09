# ERP Completion Roadmap (Checkout-first, Safe Baseline)

## Mục tiêu
- Hoàn tất luồng Sale Checkout end-to-end trước khi mở rộng hardening toàn hệ thống.
- Giữ nguyên role model runtime v1 (`ADMIN`, `MANAGER`, `STAFF`), không mở role mới trong đợt này.
- Rollout auth + RBAC theo pha, có khả năng rollback nhanh theo module.

## Phase 1 (đã triển khai trong đợt này)
- Activation completion gate:
  - endpoint `POST /api/v1/sales/checkout/orders/:id/activation-lines/:lineId/complete`
  - chặn complete activation nếu đơn chưa thanh toán đủ theo policy.
- Payment override roles baseline:
  - chuẩn hóa role override chỉ còn `ADMIN|MANAGER` ở normalization + runtime + Settings UI.
- CRM manual mark-paid:
  - thay `window.prompt` bằng form chuẩn với validation bắt buộc `reason/reference`.
- Checkout observability tối thiểu:
  - hiển thị payment intent status, callback transactions, override logs, reason reject/duplicate.

## Phase 2 (UAT auth + RBAC rollout)
- Status snapshot 2026-04-09: ✅ đã hoàn tất rollout module-by-module đến full scope (`sales,finance,crm,hr,scm,assets,projects,reports`) ở runtime UAT-like.
- Bật UAT flags:
  - `AUTH_ENABLED=true`
  - `NEXT_PUBLIC_AUTH_ENABLED=true`
  - `PERMISSION_ENGINE_ENABLED=true`
- IAM v2 rollout:
  1. `mode=SHADOW`, enforce từng module.
  2. Sau khi mismatch ổn định, chuyển module sang `ENFORCE`.
- Thứ tự module ưu tiên:
  1. `sales`
  2. `finance`
  3. `crm`
  4. `hr`
  5. `scm`
  6. `assets`
  7. `projects`
  8. `reports`

### Phase 2 baseline implementation (đã triển khai)
- Settings Center:
  - thêm section `IAM v2 rollout (Phase 2)` trong `access_security`:
    - `iamV2.enabled`
    - `iamV2.mode` (`OFF|SHADOW|ENFORCE`)
    - `iamV2.enforcementModules` (ordered theo rollout ưu tiên)
    - `iamV2.protectAdminCore`, `iamV2.denySelfElevation`
- Deploy/ops scripts:
  - `scripts/deploy/iam-v2-rollout.sh`
    - `status`
    - `shadow <modules>`
    - `enforce <modules>`
    - `rollback-shadow`
    - `rollback-module <module>`
    - `off`
  - `scripts/deploy/smoke-auth-rbac-modules.sh`
    - smoke health + auth boundary + mismatch report + module probes theo danh sách enforce.
- Deploy pipeline wiring:
  - `docker-compose.yml` + `deploy-vm` + `deploy-from-runner.sh` đã wire `IAM_V2_ENABLED`.
  - thêm post-deploy toggle:
    - `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED`
    - `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES`
  - cho phép bật smoke Auth+RBAC tự động ngay sau healthcheck để giảm rủi ro rollout module-by-module.

### Phase 2 rollout execution snapshot (2026-04-09)
- Đã chạy sequence rollout bằng `scripts/deploy/iam-v2-rollout.sh`:
  - `SHADOW sales` -> `ENFORCE sales`
  - `SHADOW sales,finance` -> `ENFORCE sales,finance`
  - `SHADOW sales,finance,crm` -> `ENFORCE sales,finance,crm`
- Đã hoàn tất phần còn lại theo cùng chu trình:
  - `SHADOW sales,finance,crm,hr` -> `ENFORCE ...`
  - `SHADOW sales,finance,crm,hr,scm` -> `ENFORCE ...`
  - `SHADOW sales,finance,crm,hr,scm,assets` -> `ENFORCE ...`
  - `SHADOW sales,finance,crm,hr,scm,assets,projects` -> `ENFORCE ...`
  - `SHADOW sales,finance,crm,hr,scm,assets,projects,reports` -> `ENFORCE ...`
- Trạng thái cuối:
  - `iamV2.enabled=true`
  - `iamV2.mode=ENFORCE`
  - `iamV2.enforcementModules=[sales,finance,crm,hr,scm,assets,projects,reports]`
- Smoke sau rollout:
  - `scripts/deploy/smoke-auth-rbac-modules.sh` pass ở cả mốc trung gian và mốc full-module.

## Phase 3 (full-system stabilization)
- Status snapshot 2026-04-09: ✅ đã hoàn tất gate stabilization mặc định (bao gồm lại `settings-center-reports.spec.ts` sau khi sửa flaky).
- Regression theo module, tập trung không làm lệch nghiệp vụ ERP cũ.
- Audit các form bắt buộc:
  - không cho nhập tự do các giá trị chuẩn hóa (module/role/status/policy/taxonomy).
- Runbook vận hành:
  - callback fail,
  - manual override,
  - drift giữa payment/effective-date/invoice.

### Phase 3 baseline implementation (đợt này)
- Quality scripts:
  - `scripts/quality/check-phase3-form-guards.sh`
    - fail nếu phát hiện `window.prompt` user-facing hoặc field schema `type: 'json'`.
  - `scripts/quality/run-phase3-stabilization.sh`
    - chạy theo gate tuần tự: form guard -> auth/rbac smoke module -> web e2e regression.
- Root scripts:
  - `npm run phase3:form-guard`
  - `npm run phase3:stabilization`
- Runbook:
  - bổ sung callback fail playbook,
  - bổ sung drift reconciliation playbook (`payment-intent` / `activation` / `invoice re-evaluate`),
  - bổ sung section Phase 3 stabilization gate.
- Flaky hardening:
  - `apps/web/e2e/tests/settings-center-reports.spec.ts`
    - chuẩn hóa role precondition theo test (`ADMIN` mặc định, override `MANAGER` cho case advanced-mode),
    - chuẩn hóa helper click/check có retry để tránh lỗi detach khi tab/domain re-render.
- Auth smoke hardening:
  - `scripts/deploy/smoke-auth-rbac-modules.sh`
    - tự detect auth boundary runtime (public vs enforced),
    - auto nạp `JWT_SECRET` từ `.env`/`config/.env` khi cần phát token smoke.

## Phase 4 (production readiness + go-live hardening)
- CI/CD release gate bắt buộc:
  - migrate status,
  - lint/build/test,
  - e2e mục tiêu,
  - smoke sau deploy.
- Smoke checklist production:
  - health API/Web,
  - payment callback flow,
  - auth boundary và permission boundary.
- Hypercare 7-14 ngày:
  - tỷ lệ callback fail,
  - số lần override thủ công,
  - thời gian xử lý override,
  - mismatch IAM v2 theo module.

### Phase 4 baseline implementation (đợt này)
- Release gate script:
  - `scripts/quality/run-phase4-release-gate.sh`
  - gate tuần tự:
    1. infra checks (`docker`, db port),
    2. prisma migrate status,
    3. api lint/build + targeted tests checkout callback/override,
    4. web lint/build,
    5. Phase 3 stabilization gate,
    6. production-readiness smoke.
- Production smoke script:
  - `scripts/deploy/smoke-production-readiness.sh`
  - verify:
    - health API/Web,
    - auth boundary detect runtime,
    - permission boundary qua endpoint admin-only (`GET /settings`),
    - payment callback boundary (signature invalid phải bị reject),
    - optional success path khi cung cấp payload/signature thật.
- Workflow wiring:
  - `.github/workflows/deploy-vm.yml`
    - thêm release gate pre-deploy (toggle `PHASE4_RELEASE_GATE_ENABLED`, default `true`),
    - cài dependencies + chạy gate trước khi bước deploy.
