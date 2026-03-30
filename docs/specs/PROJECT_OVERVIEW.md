# PROJECT OVERVIEW

## Mục tiêu
Rebuild ERP với codebase mới nhưng giữ feature-set cũ:
- CRM, Sales, Catalog
- HR (departments, positions, shifts, leave policies, employees, contracts, attendance, leave, payroll, payroll components, recruitment, training, performance, benefits, hr events)
- Finance (invoices, accounts, journal entries, budget plans)
- SCM (vendors, purchase orders, shipments, forecasts, risks)
- Assets
- Projects
- Workflows & approvals
- Reports, notifications, settings

## Bối cảnh vận hành
- Quy mô dữ liệu mục tiêu: 2M khách hàng.
- Người dùng nội bộ: ~50 nhân viên.
- Khách lẻ không đăng nhập hệ thống.

## Kiến trúc công nghệ
- Modular Monolith (không microservices ở giai đoạn này).
- Backend: NestJS + Prisma + PostgreSQL.
- Frontend: Next.js.
- Multi-tenancy: Shared Schema với `tenant_Id` trên tất cả bảng.

## Multi-tenant strategy (SaaS-ready)
- Truy vấn toàn cục tự động lọc theo tenant bằng `nestjs-cls` + Prisma extension.
- Giá trị tenant hiện lấy từ:
  1. Header (`x-tenant-id`) nếu có
  2. JWT claim (`tenantId` hoặc `tenant_Id`) nếu có
  3. Fallback `DEFAULT_TENANT_ID`
- Khi mở rộng đa công ty thật, chỉ cần thay logic tenant middleware/resolver.
