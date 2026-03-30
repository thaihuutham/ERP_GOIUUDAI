# MIGRATION MAPPING (Legacy -> SaaS-Ready Monorepo)

## Mục tiêu
- Giữ nguyên phạm vi tính năng ERP cũ.
- Chuyển sang `NestJS + Prisma + PostgreSQL + Next.js`.
- Multi-tenant shared schema: mọi model có `tenant_Id`.
- Tenant filter toàn cục bằng `nestjs-cls + Prisma Extension`.

## Legacy Route -> New Module/API

| Legacy | Legacy Data | New Module | New API |
|---|---|---|---|
| `/crm` | `customers` | `crm` | `GET/POST/PATCH /api/v1/crm/customers` |
| `/products` | `products` | `catalog` | `GET/POST/PATCH/DELETE /api/v1/catalog/products` |
| `/sales` | `orders`, `order_items`, `approvals` | `sales` | `GET/POST/PATCH /api/v1/sales/orders`, `GET /api/v1/sales/approvals`, `POST /api/v1/sales/approvals/:id/approve|reject` |
| `/approvals` | `approvals` | `sales/workflows` | `GET /api/v1/sales/approvals` |
| `/hr` | `employees`, `recruitment`, `training`, `performance`, `benefits` | `hr` | `GET/POST/PATCH /api/v1/hr/employees`, `GET/POST /api/v1/hr/recruitment|training|performance|benefits` |
| `/attendance` | `attendance` | `hr` | `GET /api/v1/hr/attendance`, `POST /api/v1/hr/attendance/check-in|check-out` |
| `/leave` | `leave_requests`, `notifications` | `hr` | `GET/POST /api/v1/hr/leave-requests`, `POST /api/v1/hr/leave-requests/:id/approve|reject` |
| `/payroll` | `payrolls` (+ derive from attendance/leave/employees) | `hr` | `GET /api/v1/hr/payrolls`, `POST /api/v1/hr/payrolls/generate`, `POST /api/v1/hr/payrolls/:id/pay` |
| `/finance` | `journal_entries`, `invoices`, `budget_plans`, `assets` | `finance` | `GET/POST/PATCH /api/v1/finance/journal-entries|invoices|budget-plans|accounts` |
| `/scm` | `vendors`, `purchase_orders`, `shipments`, `demand_forecasts`, `supply_chain_risks` | `scm` | `GET/POST/PATCH /api/v1/scm/*` |
| `/assets` | `assets`, `asset_allocations` | `assets` | `GET/POST/PATCH /api/v1/assets`, `POST /api/v1/assets/:id/allocate|return`, `GET /api/v1/assets/allocations` |
| `/projects` | `projects` | `projects` | `GET/POST/PATCH /api/v1/projects` |
| `/projects/:id` | `tasks`, `project_resources`, `project_budgets`, `time_entries` | `projects` | `GET/POST /api/v1/projects/tasks|resources|budgets|time-entries`, `POST /api/v1/projects/tasks/:id/status` |
| `/workflows` | `workflow_definitions`, `workflow_instances` | `workflows` | `GET/POST/PATCH /api/v1/workflows/definitions|instances`, `GET/POST/PATCH /api/v1/workflows/approvals` |
| `/reports` | aggregate from many collections | `reports` | `GET /api/v1/reports/overview`, `GET /api/v1/reports/module?name=` |
| `/settings` | `system/config`, `employees` | `settings` | `GET /api/v1/settings/config`, `PUT /api/v1/settings/config`, `GET/POST /api/v1/settings` |
| `notification bell` | `notifications` | `notifications` | `GET/POST /api/v1/notifications`, `POST /api/v1/notifications/:id/read` |

## Lưu ý chuyển đổi dữ liệu
- Legacy `companyId/branchId/...` được gom thành `tenant_Id` ở tầng schema.
- Các field hiển thị cũ như `name`, `price`, `date` được map về field chuẩn:
  - `Customer.fullName`, `Product.unitPrice`, `Attendance.workDate`.
- Luồng duyệt sửa đơn hàng chuyển sang bảng `Approval` với `contextJson`.

## Đảm bảo kiến trúc agent stateless
- Toàn bộ mapping nằm trong file này + ADRs.
- Agent mới vào chỉ cần đọc `docs/` để tiếp tục.
