# OPERATIONS RUNBOOK

## 1. Local startup
```bash
cp config/.env.example config/.env
npm install
npm run prisma:generate --workspace @erp/api
npm run dev:api
```

## 2. Env bắt buộc cho API auth
- `AUTH_ENABLED=true` cho staging/prod.
- `JWT_SECRET=<strong-secret>` để verify Bearer token HS256.
- `DEFAULT_TENANT_ID=<tenant-code>` cho tenant fallback.

## 3. Verify trước merge
```bash
npm run lint --workspace @erp/api
npm run build --workspace @erp/api
npm run test --workspace @erp/api
```

## 4. Xử lý lỗi 401/403
### 401 Unauthorized
- Nguyên nhân thường gặp:
  - Thiếu header `Authorization: Bearer <token>`.
  - Token sai chữ ký / hết hạn.
  - Thiếu `JWT_SECRET` khi `AUTH_ENABLED=true`.
- Hành động:
  - Dùng script phát token: `npm run token:dev --workspace @erp/api -- --role ADMIN --secret <JWT_SECRET>`.
  - Decode token, kiểm tra `role`, `tenantId`, `exp`.

### 403 Forbidden
- Nguyên nhân: token hợp lệ nhưng role không đủ quyền (`@Roles(...)`).
- Hành động:
  - Kiểm tra role trong token (`STAFF`, `MANAGER`, `ADMIN`).
  - So với policy endpoint:
    - `settings` mutate: `ADMIN`
    - `workflows` definition mutate: `ADMIN`
    - `finance` mutate: `MANAGER|ADMIN` (riêng close period: `ADMIN`)

## 5. Xử lý lỗi bằng requestId (trace)
- Mọi response lỗi chuẩn đều có:
  - Header: `x-request-id`
  - Body: `meta.requestId`
- Khi có incident:
  1. Lấy `requestId` từ response client.
  2. Tìm log JSON theo `requestId`.
  3. Đối chiếu `path`, `method`, `user`, `tenantId`, `error`.

## 6. Deploy production
1. Merge vào `main`.
2. Theo dõi workflow deploy.
3. Verify:
   - `GET /api/v1/health` trả `200`.
   - Route protected không token trả `401`.
   - Route admin với role thấp trả `403`.

## 7. Secrets/Variables cho GitHub Actions deploy-vm
### GitHub Secrets
- `SETTINGS_ENCRYPTION_MASTER_KEY` (AES-256-GCM, 32-byte key dạng base64 hoặc hex; dùng mã hóa key lưu DB)
- `JWT_SECRET`
- `DATABASE_URL` (nếu không dùng default nội bộ compose)
- `AI_OPENAI_COMPAT_API_KEY` (optional fallback nếu chưa nhập key tại Settings Center)
- `ZALO_OA_WEBHOOK_SECRET` (optional fallback nếu chưa nhập key tại Settings Center)
- `ZALO_OA_ACCESS_TOKEN` (optional fallback nếu bật OA outbound qua official API)
- `BHTOT_API_KEY` (optional fallback nếu chưa nhập key tại Settings Center)

### GitHub Variables
- `AUTH_ENABLED` (khuyến nghị `true` cho production)
- `NEXT_PUBLIC_AUTH_ENABLED` (bật login gate ở web; nên đồng bộ với `AUTH_ENABLED`)
- `PERMISSION_ENGINE_ENABLED` (bật Permission Guard runtime)
- `IAM_V2_ENABLED` (optional override cho `iamV2.enabled`; để trống nếu dùng hoàn toàn từ settings runtime)
- `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED` (bật smoke Auth/RBAC tự động sau deploy)
- `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` (CSV module enforce để smoke probe đúng phạm vi)
- `DEFAULT_TENANT_ID`
- `TENANCY_MODE` (`single` cho nội bộ, `multi` cho SaaS)
- `AI_OPENAI_COMPAT_BASE_URL`
- `AI_OPENAI_COMPAT_MODEL` (optional)
- `AI_OPENAI_COMPAT_TIMEOUT_MS` (optional)
- `ZALO_OA_OUTBOUND_URL` (optional)
- `ZALO_OA_API_BASE_URL` (optional)
- `ZALO_OA_OUTBOUND_TIMEOUT_MS` (optional)
- `NEXT_PUBLIC_API_BASE_URL` (optional khi đổi topology)

## 8. Ghi chú an toàn deploy
- Workflow `deploy-vm` tạo file runtime `/opt/erp-retail/.deploy.env` từ env của GitHub Actions.
- Không commit `.deploy.env` vào repo.
- Nếu `AUTH_ENABLED=true` mà `JWT_SECRET` thiếu/đang placeholder, script deploy sẽ fail sớm để chặn deploy không an toàn.

## 9. Post-deploy smoke cho CRM Conversations
Script:
- `scripts/deploy/smoke-crm-conversations.sh`

Mục tiêu verify:
- `ZALO_OA_WEBHOOK_SECRET`: webhook signature sai bị reject, chữ ký đúng đi qua bước verify.
- `AI_OPENAI_COMPAT_*`: tạo thread + message + quality job và `run-now` phải `SUCCESS`.
- OA outbound: gọi `POST /zalo/accounts/:id/oa/messages/send` khi có account/token thật.

Lệnh mẫu:
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_WEBHOOK_SECRET="<zalo-oa-webhook-secret>" \
SMOKE_OA_ACCOUNT_ID="<existing-oa-account-id>" \
SMOKE_OA_EXTERNAL_THREAD_ID="<oa-user-id-or-thread-id>" \
scripts/deploy/smoke-crm-conversations.sh
```

Tuỳ chọn:
- `SMOKE_SKIP_OA_OUTBOUND=true` nếu tạm thời chưa có OA token/account để verify outbound.
- `SMOKE_SKIP_AI_QUALITY=true` nếu tạm thời chưa cấp `AI_OPENAI_COMPAT_*` để verify scoring.

## 10. Chạy pipeline test + security theo 1 lệnh
```bash
npm run quality:security
```
- Hiện tại pipeline đã đạt `npm audit = 0 vulnerabilities`.
- Chế độ strict (phù hợp CI gate bảo mật):
```bash
AUDIT_STRICT=true npm run quality:security
```

## 11. Security override policy
- Root `package.json` dùng `npm overrides` để vá CVE transitive:
  - `path-to-regexp` -> `8.4.0`
  - `@prisma/config@6.19.2 > effect` -> `3.20.0`
- Tham chiếu quyết định: `docs/decisions/ADR-009-DEPENDENCY-SECURITY-OVERRIDES.md`.

## 12. HR Regulation Structured Field Builder settings
- Domain policy:
  - `hr_policies.appendixFieldCatalog` (Global Field Library)
  - `hr_policies.appendixTemplates` (Per-Appendix Template)
  - `hr_policies.appendixCatalog` (legacy-compat, tu dong sinh tu template khi normalize)
- `appendixFieldCatalog.<fieldKey>` khuyen nghi co:
  - `id`, `key`, `label`, `description`
  - `type` (`text|number|date|select|boolean`)
  - `options`, `validation`
  - `analyticsEnabled`, `aggregator`
  - `status`, `version`
- `appendixTemplates.PLxx` khuyen nghi co:
  - `name`, `description`
  - `fields[]` voi `fieldKey` + local overrides (`required`, `placeholder`, `defaultValue`, `helpText`, `visibility`, `kpiAlias`).
- Quy tac namespace field local appendix:
  - neu `fieldKey` khong ton tai trong `appendixFieldCatalog` thi bat buoc theo mau `PLxx_*`.
- Metadata runtime cho UI:
  - `GET /api/v1/hr/regulation/metadata` tra:
    - `viewerScope`, `canOverrideEmployeeId`, `requesterEmployeeId`
    - `fieldCatalog` (global fields)
    - `appendices` (resolved template fields + overrides)
- Rule analytics:
  - Chi field co `analyticsEnabled=true` va `aggregator != none` moi vao tong hop.
  - `viewerScope=self`: chart-only.
  - `viewerScope!=self`: chart + table.
- Safe fallback:
  - Khi policy chua day du, backend fallback ve appendix defaults de khong chan van hanh form.

## 13. Zalo operations metrics (P4 hardening)
- Endpoint: `GET /api/v1/zalo/operations/metrics`
- Mục tiêu:
  - theo dõi số account active,
  - theo dõi reconnect fail (runtime counter),
  - phát hiện assignment mismatch để support xử lý sớm.

### 13.1 Cách gọi nhanh
```bash
curl -sS "http://127.0.0.1:3001/api/v1/zalo/operations/metrics" \
  -H "Authorization: Bearer <jwt-admin-or-manager>" \
  -H "x-tenant-id: GOIUUDAI" | jq
```

### 13.2 Ý nghĩa chính của response
- `accountMetrics.activeAccounts`:
  - số account `status=CONNECTED` tại thời điểm snapshot.
- `accountMetrics.statusBreakdown`:
  - phân bố trạng thái account (`CONNECTED`, `DISCONNECTED`, `QR_PENDING`, `CONNECTING`, `ERROR`...).
- `reconnectMetrics.totalFailures`:
  - tổng số reconnect fail được ghi nhận từ lúc API process hiện tại khởi động.
- `reconnectMetrics.byAccount[]`:
  - top account có reconnect fail + thời điểm lỗi gần nhất.
- `assignmentMetrics.mismatchCount`:
  - tổng mismatch assignment active.
- `assignmentMetrics.mismatchByReason`:
  - `USER_ID_EMPTY`: assignment thiếu userId.
  - `USER_NOT_FOUND`: assignment trỏ tới user không tồn tại.
  - `USER_INACTIVE`: assignment trỏ tới user đã bị deactive.
  - `DUPLICATE_ACTIVE_ASSIGNMENT`: nhiều assignment active trùng cặp (`zaloAccountId`, `userId`).

### 13.3 Checklist support khi có cảnh báo
1. Nếu `activeAccounts` giảm bất thường:
   - kiểm tra `statusBreakdown` để xác định account đang `ERROR`/`DISCONNECTED`,
   - chạy reconnect theo account trên màn CRM Zalo Accounts.
2. Nếu `reconnectMetrics.totalFailures` tăng nhanh:
   - kiểm tra `byAccount` để khoanh vùng account lỗi,
   - xác minh session cũ còn hợp lệ, thử login QR lại account bị lỗi.
3. Nếu `assignmentMetrics.mismatchCount > 0`:
   - dùng `assignmentMetrics.samples` để xác định bản ghi lỗi,
   - cleanup assignment không hợp lệ hoặc gán lại đúng user còn active.

## 14. Sale Checkout operations (safe baseline)
- Nguyên tắc vận hành:
  - Activation line chỉ complete khi thanh toán đủ theo policy.
  - Override thanh toán thủ công chỉ cho `MANAGER|ADMIN`, bắt buộc `reason/reference`.
  - Không dùng prompt/JSON tay cho nghiệp vụ mark-paid user-facing.

### 14.1 Kiểm tra nhanh trạng thái checkout
```bash
curl -sS "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "x-tenant-id: GOIUUDAI" | jq
```

```bash
curl -sS "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>/payment-intent" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "x-tenant-id: GOIUUDAI" | jq
```

### 14.2 Manual override chuẩn
```bash
curl -sS -X POST "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>/payment-overrides" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: GOIUUDAI" \
  -d '{
    "reason":"Webhook timeout fallback",
    "reference":"OVR-<ticket-id>",
    "note":"manual reconciliation"
  }' | jq
```

### 14.3 Checklist khi activation bị chặn
1. Đọc `payment intent status` (`PAID` hay chưa).
2. Kiểm tra `transactions` có bản ghi `REJECTED/DUPLICATE` và `note`.
3. Nếu callback lỗi upstream:
   - reconcile chứng từ ngân hàng,
   - thực hiện override có audit,
   - re-run `invoice-actions/re-evaluate` nếu cần.

### 14.4 Callback fail playbook (payment webhook)
1. Kiểm tra nhanh trạng thái payment intent:
```bash
curl -sS "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>/payment-intent" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "x-tenant-id: GOIUUDAI" | jq
```
2. Nếu có giao dịch bị `REJECTED` vì policy hoặc mismatch payload:
   - đối soát giao dịch ngân hàng,
   - gọi manual override theo mục `14.2` (bắt buộc `reason/reference`).
3. Nếu cần bơm lại callback để tái xử lý sau khi fix upstream:
```bash
curl -sS -X POST "http://127.0.0.1:3001/api/v1/integrations/payments/bank-events" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: GOIUUDAI" \
  -H "x-signature: <signature>" \
  -H "x-timestamp: <unix-timestamp>" \
  -H "x-idempotency-key: <idempotency-key>" \
  -d '{
    "intentCode": "<intent-code>",
    "transactionRef": "<txn-ref>",
    "amount": 1000000,
    "currency": "VND",
    "bankTxnAt": "2026-04-09T08:00:00.000Z"
  }' | jq
```

### 14.5 Drift reconciliation playbook (payment/effective-date/invoice)
1. So khớp 3 nguồn trạng thái:
   - `payment-intent.status`,
   - `order.checkoutStatus` + `items[].activationStatus/effectiveFrom/effectiveTo`,
   - `invoices[]` (status, paidAmount).
2. Nếu payment đã `PAID` nhưng invoice chưa đồng bộ:
```bash
curl -sS -X POST "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>/invoice-actions/re-evaluate" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: GOIUUDAI" \
  -d '{
    "force": false,
    "reason": "phase3_drift_reconcile"
  }' | jq
```
3. Nếu activation đã xong nghiệp vụ nhưng `effectiveFrom/effectiveTo` chưa đúng:
```bash
curl -sS -X POST "http://127.0.0.1:3001/api/v1/sales/checkout/orders/<orderId>/activation-lines/<lineId>/complete" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: GOIUUDAI" \
  -d '{
    "activationRef": "ACT-<ticket-id>",
    "effectiveFrom": "2026-04-09T00:00:00.000Z",
    "effectiveTo": null
  }' | jq
```
4. Sau reconcile, bắt buộc verify lại `14.1` và ghi incident note với `orderId`, `intentCode`, `invoiceNo`, thao tác đã thực hiện.

## 15. Phase 2 rollout Auth + RBAC (UAT)
- Flag UAT bắt buộc bật cùng nhau:
  - `AUTH_ENABLED=true`
  - `NEXT_PUBLIC_AUTH_ENABLED=true`
  - `PERMISSION_ENGINE_ENABLED=true`
- IAM v2 rollout theo module:
  - `SHADOW` trước, `ENFORCE` sau khi mismatch ổn định.
  - thứ tự khuyến nghị: `sales -> finance -> crm -> hr -> scm -> assets -> projects -> reports`.
- Bộ biến đề xuất để cấu hình GitHub UAT:
  - `docs/deployment/PHASE2_UAT_GITHUB_VARIABLES_TEMPLATE.md`

### 15.1 Lệnh rollout IAM v2
```bash
# Xem trạng thái hiện tại
scripts/deploy/iam-v2-rollout.sh status

# SHADOW cho module đầu tiên
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh shadow sales

# ENFORCE cho module đã ổn định
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh enforce sales
```

### 15.2 Rollback nhanh
```bash
# Hạ toàn bộ rollout về SHADOW
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh rollback-shadow

# Gỡ module cụ thể khỏi enforcement list
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
scripts/deploy/iam-v2-rollout.sh rollback-module sales
```

### 15.3 Smoke Auth + RBAC theo module enforce
```bash
SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1" \
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_ENFORCED_MODULES="sales,finance,crm" \
scripts/deploy/smoke-auth-rbac-modules.sh
```

Checklist smoke:
1. API health `200`.
2. `settings/center` không token bị chặn khi auth bật.
3. `settings/center` có token truy cập được.
4. `settings/permissions/iam-v2/mismatch-report` trả dữ liệu.
5. Mỗi module enforce có read probe trả `200`.

Nếu muốn workflow `deploy-vm` tự chạy bước smoke này sau mỗi deploy:
- set `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED=true`
- set `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` theo module đang enforce (ví dụ `sales,finance,crm`).

## 16. Phase 3 stabilization gate (full-system)
- Mục tiêu:
  - regression theo module không làm lệch nghiệp vụ cũ,
  - chặn anti-pattern nhập liệu user-facing (`window.prompt`, `type: 'json'`),
  - giữ khả năng smoke auth/rbac full module sau rollout Phase 2.

### 16.1 Chạy gate theo từng bước
```bash
npm run phase3:form-guard
```

```bash
SMOKE_AUTH_ENABLED=true \
SMOKE_JWT_SECRET="<jwt-secret>" \
SMOKE_ENFORCED_MODULES="sales,finance,crm,hr,scm,assets,projects,reports" \
scripts/deploy/smoke-auth-rbac-modules.sh
```

```bash
npm run phase3:stabilization
```

### 16.2 Tùy chọn runtime cho script `phase3:stabilization`
- `PHASE3_SKIP_FORM_GUARD=true|false`
- `PHASE3_SKIP_API_SMOKE=true|false`
- `PHASE3_SKIP_E2E=true|false`
- `PHASE3_SMOKE_MODULES=<csv-modules>`
- `PHASE3_E2E_SPECS="<space-separated-spec-files>"`
- `PHASE3_E2E_WORKERS=<number>`
- Mặc định `phase3:stabilization` đã bao gồm `settings-center-reports.spec.ts` trong bộ regression.

## 17. Phase 4 production readiness + go-live hardening
- Lệnh tổng hợp release gate:
```bash
npm run phase4:release-gate
```

- Smoke production readiness độc lập:
```bash
npm run phase4:smoke:prod-readiness
```

### 17.1 Release gate checklist (script `run-phase4-release-gate.sh`)
1. Infra checks: `docker ps` có `erp-postgres`, DB port listening.
2. Prisma: `prisma migrate status`.
3. API quality: lint/build + targeted tests checkout callback/override.
4. Web quality: lint/build.
5. Re-run Phase 3 stabilization gate.
6. Production-readiness smoke.

Tùy chọn skip theo env:
- `PHASE4_SKIP_INFRA_CHECK`
- `PHASE4_SKIP_PRISMA_STATUS`
- `PHASE4_SKIP_API_QUALITY`
- `PHASE4_SKIP_WEB_QUALITY`
- `PHASE4_SKIP_PHASE3_GATE`
- `PHASE4_SKIP_PROD_SMOKE`
- `PHASE4_SKIP_API_TARGETED_TESTS`

### 17.2 Production smoke (script `smoke-production-readiness.sh`)
- Kiểm tra:
  - health API/Web,
  - auth boundary (public vs enforced),
  - permission boundary qua endpoint admin-only `GET /settings`,
  - payment callback boundary (signature invalid phải bị reject).
- Khi callback route chưa tồn tại ở runtime hiện tại:
  - mặc định script sẽ `skip` check callback (`SMOKE_PAYMENT_CALLBACK_REQUIRED=false`),
  - bật strict mode bằng `SMOKE_PAYMENT_CALLBACK_REQUIRED=true` để fail cứng khi route callback thiếu (`404`).
- Nhánh optional callback success:
  - cung cấp đủ:
    - `SMOKE_PAYMENT_CALLBACK_PAYLOAD`
    - `SMOKE_PAYMENT_CALLBACK_SIGNATURE`
    - `SMOKE_PAYMENT_CALLBACK_TIMESTAMP`
  - script sẽ verify theo `SMOKE_PAYMENT_CALLBACK_EXPECTED_STATUS` (default `200 201 202`).

## 18. Hypercare 7-14 ngày (checkout + IAM v2)
### 18.1 Callback fail rate
```sql
WITH base AS (
  SELECT
    COUNT(*)::numeric AS total_callbacks,
    COUNT(*) FILTER (WHERE "status" = 'REJECTED')::numeric AS rejected_callbacks
  FROM "PaymentTransaction"
  WHERE "tenant_Id" = 'GOIUUDAI'
    AND "createdAt" >= NOW() - INTERVAL '14 days'
)
SELECT
  total_callbacks,
  rejected_callbacks,
  CASE
    WHEN total_callbacks = 0 THEN 0
    ELSE ROUND((rejected_callbacks / total_callbacks) * 100, 2)
  END AS rejected_rate_percent
FROM base;
```

### 18.2 Manual override volume + xử lý override
```sql
WITH override_base AS (
  SELECT
    o."id",
    o."createdAt" AS override_at,
    i."createdAt" AS intent_created_at,
    EXTRACT(EPOCH FROM (o."createdAt" - i."createdAt")) / 60.0 AS minutes_to_override
  FROM "PaymentOverrideLog" o
  JOIN "PaymentIntent" i ON i."id" = o."intentId"
  WHERE o."tenant_Id" = 'GOIUUDAI'
    AND o."createdAt" >= NOW() - INTERVAL '14 days'
)
SELECT
  COUNT(*) AS override_count,
  ROUND(AVG(minutes_to_override)::numeric, 2) AS avg_minutes_to_override,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY minutes_to_override)::numeric, 2) AS p95_minutes_to_override
FROM override_base;
```

### 18.3 IAM v2 mismatch theo module
```bash
curl -sS "http://127.0.0.1:3001/api/v1/settings/permissions/iam-v2/mismatch-report?limit=100" \
  -H "Authorization: Bearer <jwt-manager-or-admin>" \
  -H "x-tenant-id: GOIUUDAI" | jq
```
