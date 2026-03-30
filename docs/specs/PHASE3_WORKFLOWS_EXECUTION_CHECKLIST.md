# PHASE 3 - WORKFLOWS ENGINE EXECUTION CHECKLIST

Ngày bắt đầu: 2026-03-28  
Mục tiêu: nâng `workflows` từ CRUD-centric thành workflow engine dùng chung với state machine, dynamic approver, SLA/escalation/delegation và audit timeline.

## Trạng thái tổng quan

- [x] F3.1 Tách `WorkflowsService` (controller không gọi CRUD service trực tiếp)
- [x] F3.2 Definition graph theo step/transition/condition (`definitionJson`)
- [x] F3.3 Dynamic approver theo user/role/department/value-rule
- [x] F3.4 API action chuẩn: submit/approve/reject/cancel/reassign/delegate/escalate
- [x] F3.5 SLA metadata trên approval (`dueAt`) + escalation/delegation fields
- [x] F3.6 Audit timeline đầy đủ cho workflow instance (`workflow_action_logs`)
- [x] F3.7 Bổ sung relation schema giữa definition-instance-approval-log
- [x] F3.8 Test nghiệp vụ workflows service + regression toàn API

---

## Backlog thao tác (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| F3-001 | Khôi phục + mở rộng DTO workflows cho phase 3 | `apps/api/src/modules/workflows/dto/workflows.dto.ts` | `npm run lint --workspace @erp/api` | DONE |
| F3-002 | Nâng Prisma schema cho engine workflows | `apps/api/prisma/schema.prisma` | `npm run prisma:generate --workspace @erp/api` | DONE |
| F3-003 | Tạo `WorkflowsService` với state machine action | `apps/api/src/modules/workflows/workflows.service.ts` | `npm run build --workspace @erp/api` | DONE |
| F3-004 | Refactor `WorkflowsController` dùng service domain | `apps/api/src/modules/workflows/workflows.controller.ts` | `npm run lint --workspace @erp/api` | DONE |
| F3-005 | Cập nhật `WorkflowsModule` providers | `apps/api/src/modules/workflows/workflows.module.ts` | `npm run build --workspace @erp/api` | DONE |
| F3-006 | Bổ sung test workflows service (submit/approve/cancel) | `apps/api/test/workflows.service.test.ts` | `npm run test --workspace @erp/api` | DONE |
| F3-007 | Chốt test tích hợp API SCM để đóng Phase 2 | `apps/api/test/scm.api-flow.test.ts` | `npm run test --workspace @erp/api` | DONE |

---

## API mới (Phase 3)

- `POST /api/v1/workflows/instances/submit`
- `POST /api/v1/workflows/instances/:id/approve`
- `POST /api/v1/workflows/instances/:id/reject`
- `POST /api/v1/workflows/instances/:id/cancel`
- `POST /api/v1/workflows/instances/:id/reassign`
- `POST /api/v1/workflows/instances/:id/delegate`
- `POST /api/v1/workflows/instances/:id/escalate`
- `GET /api/v1/workflows/instances/:id/approvals`
- `GET /api/v1/workflows/instances/:id/timeline`
- `GET /api/v1/workflows/instances/:id`

---

## DoD

1. Workflow definition biểu diễn được step/transition/condition qua JSON graph. DONE
2. Có cơ chế resolve dynamic approver theo nhiều rule. DONE
3. Có action API chuẩn cho toàn bộ vòng đời phê duyệt. DONE
4. Có timeline audit cho mỗi workflow instance. DONE
5. Có test tự động cho workflows service và toàn bộ test API pass. DONE

## Kết luận

Phase 3 đã được chốt hoàn chỉnh (2026-03-28) và sẵn sàng tái sử dụng engine workflows cho Finance/SCM/Sales/HR.
