# PHASE 1 - FINANCE EXECUTION CHECKLIST

Ngày bắt đầu: 2026-03-28  
Mục tiêu: đưa `finance` từ CRUD-centric sang domain service có rule nghiệp vụ cốt lõi.

## Trạng thái tổng quan

- [x] F1.1 Tách `FinanceService` (controller không gọi CRUD service trực tiếp)
- [x] F1.2 State machine vòng đời hóa đơn
- [x] F1.3 Aging report công nợ
- [x] F1.4 Period close lock (chặn chỉnh sửa kỳ đã khóa)
- [x] F1.5 Journal debit/credit lines lưu trữ chuẩn (schema-level)
- [x] F1.6 Payment allocation persistence (schema-level)
- [x] F1.7 Test nghiệp vụ finance theo scenario

---

## Backlog thao tác ngay (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| F1-001 | Tạo `FinanceService` | `apps/api/src/modules/finance/finance.service.ts` | `npm run build --workspace @erp/api` | DONE |
| F1-002 | Refactor `FinanceController` dùng service domain | `apps/api/src/modules/finance/finance.controller.ts` | `npm run lint --workspace @erp/api` | DONE |
| F1-003 | Endpoint transition invoice (`issue/approve/pay/void`) | `finance.controller.ts` + `finance.service.ts` | gọi API transition hợp lệ | DONE |
| F1-004 | Chặn transition sai trạng thái | `finance.service.ts` | response `400` khi invalid transition | DONE |
| F1-005 | Aging report (`GET /finance/invoices-aging`) | `finance.service.ts` | response có `buckets/partners` | DONE |
| F1-006 | Period lock setting + close period API | `finance.service.ts` + controller | `POST /finance/periods/:period/close` | DONE |
| F1-007 | Chặn update invoice/journal/budget ở kỳ khóa | `finance.service.ts` | response `400` khi period locked | DONE |
| F1-008 | DTO mở rộng cho finance phase 1 | `apps/api/src/modules/finance/dto/finance.dto.ts` | `npm run build --workspace @erp/api` | DONE |
| F1-009 | Thiết kế schema `journal_entry_lines` | `apps/api/prisma/schema.prisma` | Prisma generate/migrate | DONE |
| F1-010 | Thiết kế schema payment allocation | `apps/api/prisma/schema.prisma` | Prisma generate/migrate | DONE |
| F1-011 | Test transition + period lock + aging | `apps/api/test/*finance*.test.ts` | `npm run test --workspace @erp/api` | DONE |

---

## API mới (Phase 1 đã triển khai)

- `POST /api/v1/finance/invoices/:id/issue`
- `POST /api/v1/finance/invoices/:id/approve`
- `POST /api/v1/finance/invoices/:id/pay`
- `POST /api/v1/finance/invoices/:id/void`
- `GET /api/v1/finance/invoices-aging`
- `GET /api/v1/finance/invoices/:id/allocations`
- `POST /api/v1/finance/invoices/:id/allocations`
- `GET /api/v1/finance/periods/locks`
- `POST /api/v1/finance/periods/:period/close`

---

## DoD

1. Invoice lifecycle chạy end-to-end với state transition và validation đầy đủ. DONE
2. Journal có line items lưu trữ DB, đảm bảo debit = credit ở cấp persistence. DONE
3. Có payment allocation persistence + query công nợ theo đối tác. DONE
4. Có tests scenario chính cho finance service + smoke auth/error shape. DONE

## Kết luận

Phase 1 đã được chốt hoàn chỉnh (2026-03-28) và sẵn sàng chuyển trọng tâm sang Phase 2.
