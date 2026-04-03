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

## Nguyên tắc UX nhập liệu ERP
- Không yêu cầu người dùng tự gõ các mã/giá trị bắt buộc phải chính xác tuyệt đối.
- Các trường bắt buộc dạng mã nghiệp vụ phải được chọn từ danh mục chuẩn hoá (dropdown/autocomplete/picker).
- Mục tiêu là giảm sai sót vận hành và đảm bảo dữ liệu vào luôn hợp lệ theo rule hệ thống.

## Kiến trúc công nghệ
- Modular Monolith (không microservices ở giai đoạn này).
- Backend: NestJS + Prisma + PostgreSQL.
- Frontend: Next.js.
- Multi-tenancy: Shared Schema với `tenant_Id` trên tất cả bảng.
- Audit retention strategy:
  - Hot tier: PostgreSQL (12 tháng gần nhất).
  - Cold tier: MinIO trên VM cho dữ liệu cũ hơn.
  - Retention tổng: 7 năm, UI tra cứu thống nhất hot+cold.

## Multi-tenant strategy (SaaS-ready)
- Truy vấn toàn cục tự động lọc theo tenant bằng `nestjs-cls` + Prisma extension.
- Chế độ runtime hiện tại cho MVP: **single-tenant** (`TENANCY_MODE=single`) với tenant cố định `DEFAULT_TENANT_ID=GOIUUDAI`.
- Chế độ auth hiện tại cho MVP: `AUTH_ENABLED=false` (không yêu cầu login/token ở giao diện nội bộ).
- Khi chuyển sang SaaS đa công ty, bật lại `AUTH_ENABLED=true` và `TENANCY_MODE=multi`.
- Giá trị tenant hiện lấy từ:
  1. Khi `TENANCY_MODE=single`: luôn dùng `DEFAULT_TENANT_ID` (bỏ qua tenant từ header/JWT).
  2. Khi `TENANCY_MODE=multi`: JWT claim đã verify chữ ký (`tenantId` hoặc `tenant_Id`) nếu có.
  3. Khi `TENANCY_MODE=multi` và không có JWT tenant: nhận header tenant (`TENANT_HEADER_KEY`, `x-tenant-id`, `tenant-id`).
  4. Fallback `DEFAULT_TENANT_ID`.
- Khi mở rộng đa công ty thật, chỉ cần thay logic tenant middleware/resolver.
