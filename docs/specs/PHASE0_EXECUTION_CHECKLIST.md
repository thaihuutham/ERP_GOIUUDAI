# PHASE 0 EXECUTION CHECKLIST

Ngày tạo: 2026-03-28  
Mục tiêu: hardening nền tảng trước khi phát triển sâu module nghiệp vụ.

## Trạng thái tổng quan

- [x] P0.1 Khởi tạo guard/filter/interceptor nền tảng
- [x] P0.2 Chuẩn hóa DTO/validation theo module ưu tiên
- [x] P0.3 Bật authn/authz ở môi trường staging/prod
- [x] P0.4 Thiết lập test smoke tự động
- [x] P0.5 Chuẩn hóa tài liệu API + runbook vận hành

---

## Backlog thao tác ngay (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| T-001 | Tạo guard JWT + decorators auth | `src/common/auth/*` | `npm run lint --workspace @erp/api` | DONE |
| T-003 | Wire global guard/interceptor/filter | `src/app.module.ts` | Gọi API có `x-request-id` | DONE |
| T-005 | Chuẩn hóa error JSON | `src/common/filters/api-exception.filter.ts` | Protected route trả `success=false` | DONE |
| T-006 | Structured request logging | `src/common/interceptors/request-logging.interceptor.ts` | Có log JSON mỗi request | DONE |
| T-010 | DTO finance (Create/Update/List) | `src/modules/finance/dto/finance.dto.ts` | `npm run build --workspace @erp/api` | DONE |
| T-011 | DTO SCM (Create/Update/List) | `src/modules/scm/dto/scm.dto.ts` | `npm run build --workspace @erp/api` | DONE |
| T-012 | DTO workflows (Create/Update/List) | `src/modules/workflows/dto/workflows.dto.ts` | `npm run build --workspace @erp/api` | DONE |
| T-013 | Thay `Record<string, unknown>` bằng DTO ở 3 module | `finance/scm/workflows.controller.ts` | `npm run lint --workspace @erp/api` | DONE |
| T-030 | Cấu hình smoke test runner | `apps/api/vitest.config.ts` + `package.json` | `npm run test --workspace @erp/api` | DONE |
| T-031/T-033 | Smoke test public + error-shape/requestId | `apps/api/test/smoke.test.ts` | `npm run test --workspace @erp/api` | DONE |
| T-020 | Bổ sung env docs cho auth/test | `config/.env.example` | Review file | DONE |
| T-022 | Gắn `@Roles(...)` cho route nhạy cảm | modules `settings/finance/workflows` | test 403 theo role | DONE |
| T-041/T-042 | Runbook 401/403 + error contract | `docs/` | review docs | DONE |

---

## P0.1 Nền tảng bảo vệ request (đã bắt đầu)

### Task

- [x] `T-001` Tạo `JwtAuthGuard` có verify chữ ký JWT bằng `JWT_SECRET`.
- [x] `T-002` Tạo decorators `@Public()` và `@Roles(...)`.
- [x] `T-003` Đăng ký global guard/interceptor/filter trong `AppModule`.
- [x] `T-004` Bổ sung request context key (`requestId`, `authUser`).
- [x] `T-005` Chuẩn hóa error response JSON qua global exception filter.
- [x] `T-006` Structured logging cho mỗi request (method, path, status, duration, tenantId, requestId, user).

### DoD

- Guard có thể bật/tắt qua `AUTH_ENABLED`.
- Mọi lỗi API trả về cùng format (`success=false`, `error`, `meta`).
- Response có header `x-request-id`.

---

## P0.2 DTO/Validation theo module (kế tiếp)

### Task

- [x] `T-010` Tạo DTO `Create/Update/ListQuery` cho `finance`.
- [x] `T-011` Tạo DTO `Create/Update/ListQuery` cho `scm`.
- [x] `T-012` Tạo DTO `Create/Update/ListQuery` cho `workflows`.
- [x] `T-013` Thay `Record<string, unknown>` trong controllers bằng DTO tương ứng.
- [x] `T-014` Chuẩn hóa enum/field validation (status/type/date/amount).
- [x] `T-015` Validation error dùng shape filter chuẩn hiện hành.

### DoD

- Không còn endpoint mới dùng payload `Record<string, unknown>` ở 3 module ưu tiên.
- Input sai schema trả 400 với message rõ ràng.

---

## P0.3 Authn/Authz rollout

### Task

- [x] `T-020` Thêm tài liệu env: `AUTH_ENABLED`, `JWT_SECRET`.
- [x] `T-021` Áp `@Public()` cho route public thật sự (health, nếu có docs public).
- [x] `T-022` Áp `@Roles(...)` cho route admin-sensitive (settings/config, workflow definition, finance critical actions).
- [x] `T-023` Viết script phát token dev/staging cho QA.

### DoD

- Ở staging: request không token vào protected endpoints phải bị 401.
- Route gắn role sai phải trả 403.

---

## P0.4 Test smoke tự động

### Task

- [x] `T-030` Chọn test runner cho API (`vitest`) và cấu hình script.
- [x] `T-031` Viết smoke test: `GET /api/v1/health` (public).
- [x] `T-032` Viết smoke test: protected endpoint trả 401 khi thiếu token (khi `AUTH_ENABLED=true`).
- [x] `T-033` Viết smoke test: error response phải có `requestId` và shape chuẩn.
- [x] `T-034` Gắn vào CI local command `npm run test --workspace @erp/api`.

### DoD

- Có ít nhất 3 smoke test pass ổn định.
- Team có thể chạy test bằng 1 lệnh.

---

## P0.5 Tài liệu hóa + vận hành

### Task

- [x] `T-040` Update README phần auth/env mới.
- [x] `T-041` Update runbook cho quy trình xử lý 401/403/error traceId.
- [x] `T-042` Tạo tài liệu contract response error thống nhất.
- [x] `T-043` Checklist verify trước merge (lint/build/test).

### DoD

- Dev mới vào project có thể chạy và hiểu flow auth/error trong 15 phút.

---

## Gợi ý phân sprint

- Sprint 1: `P0.1 + P0.4`
- Sprint 2: `P0.2 + P0.3`
- Sprint 3: `P0.5` + cleanup technical debt

## Kết luận

Phase 0 đã hoàn thành toàn bộ checklist kỹ thuật (tính đến 2026-03-28).
