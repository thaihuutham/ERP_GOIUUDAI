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
