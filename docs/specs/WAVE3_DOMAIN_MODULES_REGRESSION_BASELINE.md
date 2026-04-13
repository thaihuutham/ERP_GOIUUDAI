# Wave 3 Regression Baseline - Domain Module Boards

Date: 2026-04-09  
Scope: `catalog`, `assets`, `projects`, `reports`, `notifications`  
Applies to: UI route-level domain boards based on `ModuleWorkbench`

## 1. Mục tiêu baseline
- Chốt checklist kiểm thử hồi quy cho 5 module đã migrate khỏi generic route.
- Chuẩn hóa điểm kiểm tra bắt buộc: toolbar/filter, action panel, bulk action, empty/loading/error banners.
- Đảm bảo trường mã nghiệp vụ bắt buộc dùng cơ chế chọn có kiểm soát (`select`/`autocomplete` + option source) khi đã có nguồn chuẩn.

## 2. Cross-module UX invariants (bắt buộc)
- Header feature hiển thị đủ: `title`, `description`, `Bản ghi`, `Bộ lọc đang bật`, nút `Refresh`.
- Toolbar trái có ô `Tìm kiếm nhanh...`; khi có filter đang áp dụng phải có nút `Xóa bộ lọc`.
- Banners thống nhất:
  - `banner-error` cho lỗi API/action.
  - `banner-success` cho thao tác thành công.
  - `banner-info` cho trạng thái nạp option source.
  - `banner-warning` cho cảnh báo quyền thao tác/option source degrade.
- Bảng dữ liệu:
  - loading copy: `Đang tải <feature>...`
  - empty copy: `feature.emptyMessage` hoặc fallback `Chưa có dữ liệu cho <feature>.`
- Side panel chi tiết:
  - nếu không có row action khả dụng theo quyền -> hiển thị `Bạn đang ở chế độ chỉ xem cho bản ghi này.`

## 3. Mapping regression theo module

### 3.1 Catalog (`/modules/catalog`)
- Feature: `product-catalog`
- Action buttons cần có:
  - `Tạo sản phẩm`
  - `Cập nhật sản phẩm`
  - `Xóa sản phẩm`
  - `Áp chính sách giá`
- Filter bắt buộc:
  - `status` (select)
  - `category` (text)
  - `includeArchived` (checkbox)
- Trường chọn có kiểm soát trọng yếu:
  - `productType` (select)
  - `pricePolicyCode` / `policyCode` (select)
  - `status` (select)
  - `reason` (select)
- Bulk baseline:
  - Có `Bulk Actions`.
  - Có action path-param cho archive/price policy.

### 3.2 Assets (`/modules/assets`)
- Features:
  - `asset-inventory`
  - `asset-allocations`
- Action buttons trọng yếu:
  - `Tạo tài sản`
  - `Cập nhật tài sản`
  - `Chuyển vòng đời`
  - `Cấp phát tài sản`
  - `Thu hồi tài sản`
  - `Ghi nhận khấu hao`
- Filter bắt buộc:
  - `status` (select)
  - `lifecycleStatus` (select)
  - `assetId` (select + option source `/assets` ở allocation history)
- Trường chọn có kiểm soát trọng yếu:
  - `lifecycleStatus`, `depreciationMethod`, `action`, `reason` (select)
  - `employeeId` (select + option source `/hr/employees`)
- Bulk baseline:
  - Có `Bulk Actions` cho lifecycle/allocate/return/depreciation path-param actions.

### 3.3 Projects (`/modules/projects`)
- Features:
  - `project-list`
  - `project-tasks`
  - `project-resources`
  - `project-budgets`
  - `time-entries`
- Action buttons trọng yếu:
  - `Tạo dự án`, `Cập nhật dự án`, `Cập nhật forecast`
  - `Tạo công việc`, `Đổi trạng thái công việc`
  - `Thêm nguồn lực`, `Thêm ngân sách`, `Tạo bản ghi công`
- Filter bắt buộc:
  - `status` (project list)
  - `projectId` (select + option source `/projects`) trên task/resource/budget/time
- Trường chọn có kiểm soát trọng yếu:
  - `projectId` (select + option source)
  - `assignedTo` / `employeeId` (select + option source `/hr/employees`)
  - `resourceType`, `budgetType`, `status`, `reason` (select)
- Bulk baseline:
  - Có action path-param trên `:id` cho update status/forecast.

### 3.4 Reports (`/modules/reports`)
- Features:
  - `overview` (read-only snapshot)
  - `module-snapshot`
  - `report-definitions`
- Action buttons trọng yếu:
  - `Tải dữ liệu phân hệ`
  - `Lưu mẫu báo cáo`
  - `Cập nhật mẫu báo cáo`
  - `Chạy báo cáo ngay`
- Filter bắt buộc:
  - `name` (module-snapshot, select)
  - `moduleName`, `status` (report-definitions, select)
- Trường chọn có kiểm soát trọng yếu:
  - `name` / `moduleName` (select)
  - `reportType`, `templateCode`, `outputFormat`, `scheduleRule`, `status`, `reason` (select)
- Bulk baseline:
  - Có action path-param `generate-report-now`.

### 3.5 Notifications (`/modules/notifications`)
- Feature: `notification-center`
- Action buttons trọng yếu:
  - `Tạo thông báo`
  - `Chạy dispatch đến hạn`
  - `Đánh dấu đã đọc`
- Filter bắt buộc:
  - `userId` (select + option source `/hr/employees`)
  - `unreadOnly` (checkbox)
- Trường chọn có kiểm soát trọng yếu:
  - `userId` trong filter + form create (select + option source)
  - `reason` khi dispatch thủ công (select)
- Bulk baseline:
  - Có action path-param `mark-read`.

## 4. Regression command baseline
- Target Wave 1/2/3 boards:
```bash
npm run test:e2e:web -- --grep "Wave 1 domain modules board"
```
- Full web E2E regression:
```bash
npm run test:e2e:web
```
- Frontend quality gate:
```bash
npm run lint --workspace @erp/web
npm run build --workspace @erp/web
npm run phase3:form-guard
```

## 5. Exit criteria cho các patch tiếp theo
- Không làm mất route-level domain board của 5 module trong scope.
- Không đổi contract endpoint/action đã chuẩn hóa ở Wave 1 trừ khi có ADR mới.
- Không chuyển ngược các trường mã bắt buộc về free-text khi đã có nguồn chọn chuẩn.
- Mọi thay đổi action/filter ảnh hưởng baseline phải cập nhật lại tài liệu này trong cùng commit.
