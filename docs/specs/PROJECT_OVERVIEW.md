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
- Chế độ auth mặc định: `AUTH_ENABLED=true` (bắt buộc login/token).
- Chỉ cho phép bypass auth trong môi trường non-production khi bật tường minh `DEV_AUTH_BYPASS_ENABLED=true`.
- Khi chuyển sang SaaS đa công ty, giữ `AUTH_ENABLED=true` và đổi `TENANCY_MODE=multi`.
- Giá trị tenant hiện lấy từ:
  1. Khi `TENANCY_MODE=single`: luôn dùng `DEFAULT_TENANT_ID` (bỏ qua tenant từ header/JWT).
  2. Khi `TENANCY_MODE=multi`: JWT claim đã verify chữ ký (`tenantId` hoặc `tenant_Id`) nếu có.
  3. Khi `TENANCY_MODE=multi` và không có JWT tenant: nhận header tenant (`TENANT_HEADER_KEY`, `x-tenant-id`, `tenant-id`).
  4. Fallback `DEFAULT_TENANT_ID`.
- Khi mở rộng đa công ty thật, chỉ cần thay logic tenant middleware/resolver.

## Trạng thái kiến trúc UI/API hiện tại (2026-04-09)

### Dashboard điều hành (truthful data only)
- Dashboard trang chủ dùng dữ liệu thật từ API `/reports/overview` theo range:
  - `YESTERDAY`, `THIS_WEEK`, `LAST_WEEK`, `LAST_MONTH`.
- Không dùng fallback số liệu giả hoặc trend giả.
- Khi chưa có dữ liệu sẽ hiển thị empty-state có hướng dẫn thao tác tiếp theo.
- KPI/charts hỗ trợ drill-through về module nguồn bằng query filter.

### Global Search toàn hệ thống
- Header có ô tìm kiếm global cố định trên toàn app + phím tắt `Cmd/Ctrl + K`.
- API `GET /search/global` trả kết quả nhóm theo entity:
  - customers, orders, invoices, products, employees, projects, purchaseOrders, workflowTasks, reports.
- Mỗi result có type label, icon, snippet và target link.
- Các module/list page tiếp tục có per-module search riêng cho tác vụ nghiệp vụ.

### Reporting Center (ERP-style)
- Module Reports dùng `Reporting Center` chuyên biệt thay vì board generic.
- Báo cáo được nhóm theo domain:
  - Executive
  - CRM / Sales
  - Finance
  - Inventory / SCM
  - HR
  - Projects
  - Workflow / Audit
- Mỗi definition hỗ trợ:
  - preview/drill-through,
  - chọn format export,
  - chạy report theo range,
  - theo dõi run status (`queued/running/succeeded/failed`),
  - tải file output khi run thành công.
- Hỗ trợ thao tác chạy lịch report đến hạn (`/reports/schedules/run-due`).

### Chuẩn hóa create-flow
- Pattern tạo mới thống nhất bằng `CreateEntityDialog` / `EntityFormModal`.
- Với form dài (`fieldCount >= 10`) tự chuyển sang fullscreen wizard-modal.
- Đã áp dụng cho:
  - `ModuleWorkbench` generic (mọi module domain board),
  - CRM Customers create flow,
  - CRM Vehicles create flow.
