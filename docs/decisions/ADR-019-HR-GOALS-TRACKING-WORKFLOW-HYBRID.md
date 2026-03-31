# ADR-019: HR Goals Tracking Hub + Workflow Approval + Hybrid Auto Progress

## Status
Accepted

## Context
- Trang `HR -> Mục tiêu` trước đây mới dừng ở Goal CRUD cơ bản (`GET/POST/PATCH /hr/goals`, `PATCH /hr/goals/:id/progress`).
- Chưa có hub chuyên dụng theo chuẩn vận hành ERP cho các nhu cầu:
  - Nhân viên tự đăng ký mục tiêu và submit duyệt.
  - Quản lý/giám đốc theo dõi đa cấp (cá nhân/team/phòng/công ty).
  - Theo dõi realtime gần thời gian thực.
  - KPI hybrid (manual + auto) có audit đầy đủ.
- Hệ thống đã có Workflow Engine và domain dữ liệu HR + Sales có thể làm nguồn tính auto phase 1.

## Decision
- Nâng cấp domain `HrGoal` từ CRUD sang lifecycle + workflow + hybrid tracking:
  - Thêm `trackingMode` (`MANUAL|AUTO|HYBRID`).
  - Thêm trường giá trị hybrid: `autoCurrentValue`, `manualAdjustmentValue`.
  - Thêm liên kết workflow: `workflowDefinitionId`, `workflowInstanceId`.
  - Thêm mốc lifecycle: `submittedAt`, `approvedAt`, `rejectedAt`, `lastAutoSyncedAt`.
- Bổ sung entity mới:
  - `HrGoalMetricBinding`: cấu hình metric nguồn auto theo từng goal.
  - `HrGoalTimeline`: lưu audit event (`CREATED`, `UPDATED`, `SUBMITTED`, `APPROVED`, `REJECTED`, `PROGRESS_UPDATED`, `AUTO_SYNCED`, `REOPENED`).
- Chuẩn hóa lifecycle goal:
  - `DRAFT -> PENDING -> ACTIVE -> APPROVED`.
  - Cho phép `REJECTED`, `ARCHIVED` theo ngữ cảnh nghiệp vụ.
- Tích hợp workflow approval cho goal:
  - Submit tạo workflow instance `targetType=HR_GOAL`, `targetId=goalId`.
  - Đồng bộ trạng thái từ workflow instance:
    - workflow approved -> goal `ACTIVE`.
    - workflow rejected/inactive -> goal `REJECTED`.
- Chuẩn hybrid progress phase 1:
  - `effectiveCurrent = autoCurrentValue + manualAdjustmentValue`.
  - `progressPercent = clamp(effectiveCurrent / targetValue, 0..100)`.
  - Khi đạt 100%, tự chuyển `APPROVED` và set `completedAt`.
- Auto calculator phase 1:
  - `HR_ATTENDANCE`: `on_time_days`, `attendance_days`, `overtime_minutes`.
  - `HR_RECRUITMENT`: `hired_count`, `offer_approved_count`.
  - `HR_PERFORMANCE`: `avg_score`.
  - `SALES`: `order_count`, `order_amount_sum`.
- Realtime strategy:
  - Không dùng SSE/WebSocket ở phase này.
  - Dùng polling 10 giây ở frontend.
  - Backend recompute batch cho goal AUTO/HYBRID stale > 10 giây trước khi trả tracker/overview.
- API contract:
  - Giữ backward compatibility các endpoint cũ.
  - Thêm endpoint chuyên dụng:
    - `GET /api/v1/hr/goals/tracker`
    - `GET /api/v1/hr/goals/overview`
    - `GET /api/v1/hr/goals/:id/timeline`
    - `POST /api/v1/hr/goals/:id/submit-approval`
    - `POST /api/v1/hr/goals/:id/recompute-auto`
    - `POST /api/v1/hr/goals/recompute-auto`
- UI quyết định:
  - Route `/modules/hr/goals` dùng board chuyên dụng `HrGoalsTrackingBoard`.
  - Có scope switch `self|team|department|company`, filter toàn cục, board theo status, detail drawer timeline.
  - Có polling auto refresh 10 giây + pause/resume + manual refresh.

## Consequences
- HR có trang mục tiêu đúng luồng vận hành thực tế hơn: đăng ký, submit duyệt, theo dõi realtime, giám sát đa cấp.
- Dữ liệu mục tiêu có audit timeline, thuận lợi cho kiểm soát và truy vết.
- Auto KPI phase 1 tạo được baseline vận hành (HR + Sales) mà vẫn giữ quyền manual adjustment.
- Chi phí truy vấn tăng do recompute định kỳ theo request; đã giới hạn bằng stale window 10s và batch size.
- E2E cần môi trường dev port riêng khi local đã có app khác chạy trên cổng mặc định Playwright.
