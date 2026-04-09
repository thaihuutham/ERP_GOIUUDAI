# ADR-062: Wave 1 domain boards and dynamic option source for module workbench

- Status: Accepted
- Date: 2026-04-09

## Context
- 5 module `catalog`, `assets`, `projects`, `reports`, `notifications` vẫn dùng route generic `ModuleScreen`.
- Yêu cầu Wave 1 cần:
  - thay bằng board chuyên sâu theo domain,
  - có list/filter/sort/pagination server-side + detail panel + create/update + bulk action,
  - field chuẩn hóa bắt buộc phải chọn từ danh mục thay vì nhập mã tự do.
- Không được thay đổi business logic ERP backend trong batch này.

## Decision
1. Tách route-level rendering từ `ModuleScreen` sang domain boards riêng cho 5 module:
   - `CatalogOperationsBoard`
   - `AssetsOperationsBoard`
   - `ProjectsOperationsBoard`
   - `ReportsOperationsBoard`
   - `NotificationsOperationsBoard`
   - dùng chung base `DomainModuleBoard` + `ModuleWorkbench` để tái sử dụng behavior chuẩn.
2. Mở rộng frontend schema contract:
   - thêm `optionSource` cho `FormField` và `FeatureFilter` trong `module-ui`.
   - `optionSource` khai báo endpoint + mapping (`valueField`, `labelField`, `query`, `limit`).
3. Nâng `ModuleWorkbench` để hydrate option động runtime:
   - fetch option từ API theo `optionSource`,
   - merge với option tĩnh và dedupe,
   - áp dụng cho cả form action và filter toolbar.
4. Chuẩn hóa module definitions cho 5 module:
   - align endpoint/action với API hiện hành,
   - thêm filter server-side theo query contract,
   - chuyển các field mã nghiệp vụ bắt buộc (projectId/employeeId/moduleName/reportType...) sang select/autocomplete.
5. Bổ sung E2E coverage trực tiếp cho 5 module trong `domain-modules-wave1.spec.ts`.

## Consequences
### Positive
- Hoàn tất migration khỏi generic route cho 5 module còn lại mà không đổi backend core.
- Giảm nhập sai mã nghiệp vụ nhờ option source động từ API.
- Tăng coverage regression cho các module trước đây chưa có spec trực tiếp.
- Giữ được consistency UI vì vẫn dùng chung `ModuleWorkbench`.

### Negative
- `ModuleWorkbench` phức tạp hơn do thêm lifecycle nạp option động.
- Option source phụ thuộc khả dụng endpoint list; khi endpoint lỗi thì UX chọn option sẽ degrade.
- Cần tiếp tục Wave 2 để đồng bộ copy/disabled reason/empty-state toàn hệ thống.

## Non-goals
- Không thay đổi business rules backend của các module.
- Không redesign toàn bộ visual identity.
- Không triển khai full Wave 2/3 trong cùng batch.

## Follow-up
- Wave 2: chuẩn hóa toolbar/banner/loading/error/disabled reason giữa mọi board.
- Wave 3: chốt checklist mapping nút/trường nghiệp vụ theo module làm regression baseline.
