# PHASE 2 - SCM EXECUTION CHECKLIST

Ngày bắt đầu: 2026-03-28  
Mục tiêu: service hóa `SCM` với lifecycle chuẩn cho PO/shipment, receiving + 3-way match và scorecard vendor.

## Trạng thái tổng quan

- [x] F2.1 Tách `ScmService` (controller không gọi CRUD service trực tiếp)
- [x] F2.2 Purchase Order lifecycle state machine
- [x] F2.3 Receiving (GRN-like) + tổng nhận hàng
- [x] F2.4 Three-way match PO - Receipt - Invoice
- [x] F2.5 Shipment lifecycle + on-time delivery
- [x] F2.6 Vendor scorecard (lead time, defect rate, on-time rate)
- [x] F2.7 Liên thông Sales -> SCM qua `relatedSalesOrderNo`
- [x] F2.8 Integration tests/E2E cho API workflow SCM

---

## Backlog thao tác ngay (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| F2-001 | Tạo `ScmService` | `apps/api/src/modules/scm/scm.service.ts` | `npm run build --workspace @erp/api` | DONE |
| F2-002 | Refactor `ScmController` dùng service domain + RBAC | `apps/api/src/modules/scm/scm.controller.ts` | `npm run lint --workspace @erp/api` | DONE |
| F2-003 | Bổ sung schema cho lifecycle SCM | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F2-004 | PO transitions (`submit/approve/cancel/close`) | `scm.controller.ts` + `scm.service.ts` | gọi API transition | DONE |
| F2-005 | Receiving endpoint + auto update trạng thái PO | `POST /scm/purchase-orders/:id/receive` | unit test + manual call | DONE |
| F2-006 | Three-way match endpoint | `GET /scm/purchase-orders/:id/three-way-match` | response có `variance` | DONE |
| F2-007 | Shipment transitions (`ship/deliver`) + on-time flag | `POST /scm/shipments/:id/ship|deliver` | unit test deliver | DONE |
| F2-008 | Vendor scorecard endpoint | `GET /scm/vendor-scorecards` | response có metrics vendor | DONE |
| F2-009 | Service tests cho SCM | `apps/api/test/scm.service.test.ts` | `npm run test --workspace @erp/api` | DONE |
| F2-010 | API integration tests (PO->receive->close, shipment lifecycle) | `apps/api/test/scm.api-flow.test.ts` | `npm run test --workspace @erp/api` | DONE |

---

## API mới (Phase 2 đã triển khai)

- `POST /api/v1/scm/purchase-orders/:id/submit`
- `POST /api/v1/scm/purchase-orders/:id/approve`
- `POST /api/v1/scm/purchase-orders/:id/cancel`
- `POST /api/v1/scm/purchase-orders/:id/close`
- `GET /api/v1/scm/purchase-orders/:id/receipts`
- `POST /api/v1/scm/purchase-orders/:id/receive`
- `GET /api/v1/scm/purchase-orders/:id/three-way-match`
- `POST /api/v1/scm/shipments/:id/ship`
- `POST /api/v1/scm/shipments/:id/deliver`
- `GET /api/v1/scm/vendor-scorecards`

---

## DoD đề xuất để đóng trọn Phase 2

1. PO lifecycle chạy end-to-end với transitions hợp lệ và guard trạng thái sai.
2. Receiving cập nhật số nhận hàng và trạng thái `PARTIAL_RECEIVED/RECEIVED`.
3. 3-way match trả số liệu đối soát rõ ràng cho PO - Receipt - Invoice.
4. Shipment lifecycle có chỉ số on-time delivery.
5. Vendor scorecard phản ánh lead time, defect rate, on-time delivery rate.
6. Có integration tests cho luồng nghiệp vụ chính. DONE

## Kết luận

Phase 2 đã được chốt hoàn chỉnh (2026-03-28) sau khi bổ sung test tích hợp API cho luồng PO và shipment.
