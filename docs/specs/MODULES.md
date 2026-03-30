# MODULES (Current SaaS-Ready)

## API Modules (`apps/api/src/modules`)
- `crm`: khách hàng + phân trang cursor + validate/duplicate phone.
- `catalog`: sản phẩm/dịch vụ (CRUD).
- `sales`: đơn hàng, chi tiết đơn, luồng chỉnh sửa cần phê duyệt.
- `hr`: master data HR (phòng ban/chức danh/ca/chính sách nghỉ), nhân sự, hợp đồng, chấm công, nghỉ phép, payroll + payroll components, tuyển dụng, đào tạo, đánh giá, phúc lợi, HR events.
- `finance`: hóa đơn, tài khoản, bút toán, ngân sách.
- `scm`: nhà cung cấp, PO, vận chuyển, phân phối, forecast, rủi ro.
- `assets`: tài sản, cấp phát, thu hồi, lịch sử allocation.
- `projects`: dự án, task, resource, budget, time entry.
- `workflows`: định nghĩa và instance workflow + approval record.
- `reports`: báo cáo tổng quan và theo module.
- `settings`: cấu hình hệ thống + sync `order_settings`.
- `notifications`: danh sách thông báo + mark-read.

## Web Modules (`apps/web/app/modules`)
- `crm`, `catalog`, `sales`, `hr`, `finance`, `scm`, `assets`, `projects`, `workflows`, `reports`, `settings`, `notifications`.
- Hiện đang là skeleton page để nối dần UI nghiệp vụ theo API mới.

## Tenant/SaaS
- Shared schema với `tenant_Id` ở toàn bộ model.
- Tenant context được resolve ở middleware (header/JWT/default env).
- Prisma Extension tự áp filter tenant ở query toàn cục.
