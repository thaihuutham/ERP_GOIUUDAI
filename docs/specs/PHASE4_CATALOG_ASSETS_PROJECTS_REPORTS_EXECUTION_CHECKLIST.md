# PHASE 4 - CATALOG / ASSETS / PROJECTS / REPORTS EXECUTION CHECKLIST

Ngày bắt đầu: 2026-03-28  
Mục tiêu: nâng cấp 4 module `catalog`, `assets`, `projects`, `reports` theo domain service + typed DTO + workflow nghiệp vụ + test regression.

## Trạng thái tổng quan

- [x] F4.1 Mở rộng schema cho Product variant/pricing/archive
- [x] F4.2 Mở rộng schema cho Asset lifecycle/depreciation/maintenance
- [x] F4.3 Mở rộng schema cho Project baseline/budget/forecast/task-weight
- [x] F4.4 Mở rộng schema cho Report definition/run/schedule
- [x] F4.5 Refactor `catalog` sang service domain + DTO typed + RBAC
- [x] F4.6 Refactor `assets` lifecycle + allocation + maintenance + depreciation
- [x] F4.7 Refactor `projects` weighted progress + metrics + forecast API
- [x] F4.8 Refactor `reports` KPI + definition template/output/schedule + run + notification
- [x] F4.9 Test tự động cho các service Phase 4
- [x] F4.10 Chạy full verify (`prisma generate`, `lint`, `build`, `test`)

---

## Backlog thao tác (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| F4-001 | Cập nhật schema Product cho variant/policy/archive | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F4-002 | Cập nhật schema Asset cho lifecycle/depreciation/maintenance | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F4-003 | Cập nhật schema Project/Task/Budget/TimeEntry baseline + forecast | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F4-004 | Cập nhật schema Report/ReportRun cho template/output/schedule | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F4-005 | Refactor module `catalog` (controller/service/dto/module) | `apps/api/src/modules/catalog/*` | `npm run lint --workspace @erp/api` | DONE |
| F4-006 | Refactor module `assets` (controller/service/dto/module) | `apps/api/src/modules/assets/*` | `npm run lint --workspace @erp/api` | DONE |
| F4-007 | Refactor module `projects` (controller/service/dto/module) | `apps/api/src/modules/projects/*` | `npm run lint --workspace @erp/api` | DONE |
| F4-008 | Refactor module `reports` (controller/service/dto/module) | `apps/api/src/modules/reports/*` | `npm run lint --workspace @erp/api` | DONE |
| F4-009 | Bổ sung test unit Phase 4 cho catalog/assets/projects/reports | `apps/api/test/*.service.test.ts` | `npm run test --workspace @erp/api` | DONE |
| F4-010 | Chạy full verify phase 4 | `@erp/api` | `prisma:generate + lint + build + test` | DONE |

---

## API/Capability mới chính (Phase 4)

- `Catalog`: filter nâng cao theo category/variant/archive, quản lý price policy, archive mềm.
- `Assets`: lifecycle transition, maintenance schedule, depreciation preview/posting.
- `Projects`: weighted progress, baseline vs actual variance, forecast & burnup metrics.
- `Reports`: KPI overview, report definition typed, generate run theo output format, schedule run due + tạo notification.

---

## DoD

1. `catalog/assets/projects/reports` không còn phụ thuộc thuần CRUD route, có domain service rõ. DONE  
2. Có đủ DTO validation cho API chính của Phase 4. DONE  
3. Có test unit cho các luồng nghiệp vụ lõi của 4 module. DONE  
4. Full verify của `@erp/api` pass toàn bộ. DONE  

## Kết luận

Phase 4 đã được hoàn thiện và chốt kiểm chứng (2026-03-28), sẵn sàng chuyển tiếp Phase 5.
