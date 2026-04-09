# ADR-064: Secure Defaults + Reporting Center + Global Search + Create Modal Standard

- Status: Accepted
- Date: 2026-04-09
- Owner: Codex session

## Context

Project cần nâng chuẩn production-readiness và khả năng vận hành ERP theo yêu cầu:

1. Auth/security phải an toàn theo mặc định.
2. Dashboard/Reports không được dùng số liệu giả.
3. Search phải là global search đa entity, không redirect cứng về một module.
4. Luồng tạo dữ liệu mới đang phân mảnh (sidepanel/modal/trang riêng), gây khó dùng cho user non-IT.
5. Runtime theming cần mở rộng beyond `logoUrl + primaryColor`.

## Decision

### 1) Secure-by-default auth posture
- Mặc định runtime/docker/web build bật auth:
  - `AUTH_ENABLED=true`
  - `PERMISSION_ENGINE_ENABLED=true`
  - `NEXT_PUBLIC_AUTH_ENABLED=true`
- Dev bypass chỉ hợp lệ khi bật tường minh:
  - `DEV_AUTH_BYPASS_ENABLED=true`
  - chỉ cho môi trường non-production.
- Env validation bắt buộc reject config không an toàn ở production.

### 2) Reporting Center chuyên dụng cho ERP
- Module Reports dùng board chuyên biệt thay vì generic workbench.
- Group báo cáo theo domain:
  - Executive
  - CRM / Sales
  - Finance
  - Inventory / SCM
  - HR
  - Projects
  - Workflow / Audit
- Mỗi report definition hỗ trợ:
  - preview + drill-through
  - export format selection
  - run-now theo date range
  - run tracking (`queued/running/succeeded/failed`)
  - download output khi run thành công
  - run due schedules.

### 3) Global search toàn hệ thống
- API federated search trả grouped results cho entity chính ERP:
  - customers, orders, invoices, products, employees, projects, purchase orders, workflow/tasks, reports.
- Topbar global search cố định + shortcut `Cmd/Ctrl+K`.

### 4) Unified create-flow
- Chuẩn hóa family:
  - `CreateEntityDialog`
  - `EntityFormModal`
- CTA chuẩn toàn hệ thống: `Thêm dữ liệu`.
- Form dài tự chuyển fullscreen modal.
- Bổ sung `Lưu & thêm mới` cho luồng nhập liệu liên tục.

### 5) Runtime appearance token expansion
- Mở rộng token runtime ở settings:
  - color semantic/chart, shell/surface, radius/shadow, density, fontScale.
- Giữ preset xanh hiện tại làm default brand tone.

## Consequences

### Positive
- Giảm rủi ro security misconfiguration khi deploy.
- Dashboard/reports phản ánh dữ liệu thật, tăng độ tin cậy điều hành.
- Tăng tốc thao tác nhập liệu ERP nhờ create-flow nhất quán.
- Admin có thể tinh chỉnh giao diện sâu hơn mà không cần rebuild.
- Search toàn cục giúp giảm thời gian truy cập dữ liệu chéo module.

### Trade-offs
- Frontend logic tăng độ phức tạp (report center + command palette + runtime token apply).
- Cần thêm regression tests E2E cho reporting/search/create modal để chống vỡ UX.

## Follow-up

1. Bổ sung E2E chuyên sâu cho:
   - global search command palette,
   - reporting center run/download flows,
   - create modal standard trên các board custom còn lại.
2. Hoàn thiện settings IA theo route-level subpages nếu cần tách sâu hơn ở phase tiếp theo.
