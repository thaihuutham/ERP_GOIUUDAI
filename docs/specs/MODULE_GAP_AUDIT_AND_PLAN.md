# MODULE GAP AUDIT & DEVELOPMENT PLAN (2026-03-28)

## 1) Kết luận nhanh

Dự án hiện có đầy đủ khung module ERP ở mức cấu trúc (schema + route + màn hình), nhưng mức độ hoàn thiện nghiệp vụ không đồng đều:

- **Khá hoàn thiện backend**: `hr`, `crm`, `sales`, `settings`.
- **Mức trung bình**: `assets`, `projects`, `notifications`.
- **Chưa hoàn thiện nghiệp vụ (đang CRUD-centric)**: `finance`, `scm`, `workflows`, `catalog`, `reports`.
- **Frontend toàn hệ thống**: vẫn ở dạng **module generic workbench/skeleton**, chưa có UI nghiệp vụ chuyên biệt theo vai trò.

---

## 2) Bằng chứng kỹ thuật chính

### 2.1 Module còn CRUD-centric

- `finance` controller gọi trực tiếp `PrismaCrudService` cho toàn bộ nghiệp vụ (invoice/account/journal/budget):
  - `apps/api/src/modules/finance/finance.controller.ts`
- `scm` controller gọi trực tiếp `PrismaCrudService` cho vendor/PO/shipment/...:
  - `apps/api/src/modules/scm/scm.controller.ts`
- `workflows` controller gọi trực tiếp `PrismaCrudService` cho definition/instance/approval:
  - `apps/api/src/modules/workflows/workflows.controller.ts`
- `catalog` hiện ở CRUD thuần sản phẩm:
  - `apps/api/src/modules/catalog/catalog.controller.ts`
- `PrismaCrudService` chỉ cung cấp thao tác generic list/detail/create/update/remove, không có rule nghiệp vụ domain-specific:
  - `apps/api/src/common/prisma-crud.service.ts`

### 2.2 Frontend chưa có UI nghiệp vụ chuyên sâu

- Toàn bộ trang module chỉ render `ModuleScreen` generic:
  - `apps/web/app/modules/*/page.tsx`
- `ModuleScreen` -> `ModuleWorkbench` generic theo metadata:
  - `apps/web/components/module-screen.tsx`
- Tài liệu cũng ghi rõ web đang skeleton:
  - `docs/specs/MODULES.md`
  - `README.md`

### 2.3 Validation nghiệp vụ còn mỏng

- API chỉ thấy DTO phân trang dùng chung:
  - `apps/api/src/common/dto/pagination-query.dto.ts`
- Chưa có bộ DTO Create/Update riêng theo từng domain (`finance`, `scm`, `workflows`, `projects`, ...).

### 2.4 Khoảng trống integrity ở schema (nhiều khóa ngoại đang là String thuần)

Một số model quan trọng chưa khai báo relation rõ ràng (chỉ lưu id string):

- `PurchaseOrder.vendorId` không có quan hệ `Vendor`:
  - `apps/api/prisma/schema.prisma`
- `AssetAllocation.assetId/employeeId` chưa khai báo relation:
  - `apps/api/prisma/schema.prisma`
- `PayrollLineItem.payrollId/employeeId` chưa khai báo relation:
  - `apps/api/prisma/schema.prisma`
- `WorkflowInstance.definitionId` chưa relation tới `WorkflowDefinition`:
  - `apps/api/prisma/schema.prisma`

### 2.5 Chưa có test tự động

- Không tìm thấy `*.spec.ts/*.test.ts/*.e2e.ts` trong workspace.

---

## 3) Đánh giá mức hoàn thiện theo module

| Module | Mức hiện tại | Nhận định |
|---|---|---|
| HR | Cao | Có service nghiệp vụ sâu (attendance, leave balance, payroll line items, event). Cần tăng test + UI chuyên sâu. |
| CRM | Cao | Có dedup/merge, interaction, payment follow-up. Cần bổ sung KPI pipeline/automation sâu hơn. |
| Sales | Khá | Có luồng approval sửa đơn. Còn thiếu vòng đời đơn hàng đầy đủ và liên thông kho/tài chính. |
| Settings | Khá | Có cấu hình hệ thống + sync BHTOT tương đối sâu. Cần harden bảo mật/audit. |
| Projects | Trung bình | CRUD + task/resource/budget/time entry; thiếu rule tiến độ, baseline, forecast. |
| Assets | Trung bình | Có cấp phát/thu hồi; thiếu khấu hao, bảo trì, lifecycle sâu. |
| Notifications | Trung bình | Cơ bản đủ gửi + mark-read; thiếu preference/channel/retry. |
| Catalog | Thấp-trung bình | CRUD sản phẩm; thiếu danh mục, variant, giá nhiều cấp, lifecycle. |
| Finance | Thấp | Chủ yếu CRUD, chưa có posting/ledger/AR-AP lifecycle chuẩn ERP. |
| SCM | Thấp | CRUD cho nhiều thực thể, thiếu trạng thái nghiệp vụ và liên thông kho/mua hàng. |
| Workflows | Thấp | Có model definition/instance/approval nhưng chưa là workflow engine thực thụ. |
| Reports | Thấp-trung bình | Có overview/snapshot; chưa có bộ KPI nghiệp vụ + export/schedule đầy đủ. |
| Web UI | Thấp | Skeleton generic, chưa có UX role-based/module-specific. |

---

## 4) Kế hoạch phát triển bộ tính năng còn thiếu

## Phase 0 (2 tuần) - Nền tảng bắt buộc trước khi mở rộng

### Mục tiêu
Tăng độ an toàn và khả năng triển khai cho toàn hệ thống.

### Hạng mục
- Thiết kế chuẩn API input/output cho mọi module (DTO + validator + error shape thống nhất).
- Bổ sung authn/authz tối thiểu (JWT, role/permission check ở endpoint quan trọng).
- Thiết lập test framework:
  - Unit test service core.
  - Integration test cho route critical.
- Chuẩn logging + audit trail action (who/when/what).

### DoD
- Mỗi module có DTO create/update/list filter cơ bản.
- Có test pipeline chạy CI cho API.
- Endpoint quan trọng không còn mở hoàn toàn.

---

## Phase 1 (3-4 tuần) - Hoàn thiện `Finance` (ưu tiên cao nhất)

### Tính năng cần bổ sung
- Vòng đời hóa đơn chuẩn: draft -> issued -> approved -> paid/void.
- Journal Entry 2 chiều (debit/credit lines), cân bằng bút toán.
- AR/AP aging, công nợ theo đối tác.
- Payment allocation (1 thanh toán cho nhiều invoice hoặc ngược lại).
- Khóa kỳ (period close) và chống sửa dữ liệu kỳ đã khóa.

### Kết quả kỳ vọng
- `finance` không còn phụ thuộc controller CRUD generic.
- Có `FinanceService` + rules nghiệp vụ + transaction rõ ràng.

---

## Phase 2 (3-4 tuần) - Hoàn thiện `SCM` + liên thông `Sales`

### Tính năng cần bổ sung
- Vòng đời PO: draft/approved/partial/received/closed/cancelled.
- Nhập hàng (GRN) và đối soát PO-GRN-Invoice.
- Shipment/distribution có state machine rõ ràng + SLA.
- Vendor scorecard (lead time, defect rate, on-time delivery).
- Liên thông Sales <-> SCM cho nhu cầu cung ứng.

### Kết quả kỳ vọng
- `scm` có service domain và workflow chuẩn, không chỉ CRUD.

---

## Phase 3 (2-3 tuần) - Hoàn thiện `Workflows` thành engine dùng chung

### Tính năng cần bổ sung
- Definition theo step/transition/condition.
- Dynamic approver (theo role, theo phòng ban, theo giá trị đơn).
- SLA + escalation + delegation.
- API action rõ: submit/approve/reject/cancel/reassign.
- Audit timeline đầy đủ cho mỗi instance.

### Kết quả kỳ vọng
- `workflows` thành engine trung tâm để tái dùng cho Sales/Finance/SCM/HR.

---

## Phase 4 (3 tuần) - Nâng cấp `Catalog`, `Assets`, `Projects`, `Reports`

### Catalog
- Danh mục đa cấp, thuộc tính, variant, policy giá, soft-delete/archive.

### Assets
- Lifecycle tài sản (procure -> in-use -> maintenance -> retire).
- Khấu hao tài sản + lịch bảo trì.

### Projects
- Progress theo task weighted, baseline vs actual, cost burnup.

### Reports
- KPI dashboard theo module.
- Report definition có template + export CSV/XLSX/PDF.
- Schedule report + notification.

---

## Phase 5 (4-6 tuần, song song theo module) - Frontend nghiệp vụ chuyên sâu

### Mục tiêu
Thay skeleton generic bằng UI domain-specific theo vai trò.

### Hạng mục
- Tách module page thành màn hình nghiệp vụ thật (list/detail/form/workflow timeline).
- Tạo component theo domain: order editor, payroll calculator view, journal posting form, PO receiving form...
- Role-based navigation + action gating trên UI.
- Trải nghiệm dữ liệu lớn: server-side filtering/pagination/sort.

### DoD
- Các module trọng yếu (`finance`, `scm`, `sales`, `hr`, `crm`) có ít nhất 1 flow E2E hoàn chỉnh trên UI.

---

## 5) Backlog ưu tiên (đề xuất)

### P0 (Làm ngay)
1. DTO/validation theo module.
2. Test framework + smoke test critical routes.
3. Auth/RBAC tối thiểu cho API.
4. Finance service hóa đơn + journal chuẩn.

### P1
1. SCM state machine + receiving/3-way match.
2. Workflow engine chuẩn hóa.
3. Reports KPI chuẩn theo từng module.

### P2
1. Catalog nâng cấp variant/pricing.
2. Assets khấu hao + bảo trì.
3. Projects baseline/forecast.
4. UI chuyên sâu thay thế workbench generic.

---

## 6) Rủi ro và cách giảm rủi ro

- **Rủi ro data integrity** do thiếu relation/FK rõ: ưu tiên migration schema có khóa ngoại cho thực thể chính.
- **Rủi ro regression** do chưa có test: bắt buộc hoàn thành Phase 0 trước khi mở rộng sâu.
- **Rủi ro scope creep**: cố định DoD theo phase, chỉ mở phase kế tiếp khi phase hiện tại pass tiêu chí.

---

## 7) Đề xuất thực thi thực tế (theo sprint)

- Sprint 1-2: Phase 0 + khởi động Finance.
- Sprint 3-4: Hoàn thiện Finance + bắt đầu SCM.
- Sprint 5-6: Hoàn thiện SCM + Workflow engine.
- Sprint 7-8: Catalog/Assets/Projects/Reports.
- Sprint 9+: Frontend chuyên sâu + tối ưu vận hành.

