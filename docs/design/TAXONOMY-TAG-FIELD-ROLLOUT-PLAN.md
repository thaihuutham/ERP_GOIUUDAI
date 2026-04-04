# Taxonomy / Tag Field Rollout Plan

## Mục tiêu
Chuẩn hóa toàn bộ trường đang cho phép nhập nhiều giá trị tự do (tags/comma-list/free taxonomy) sang mô hình quản trị có kiểm soát, có thống kê usage, và có delete guard ở backend.

## Nguyên tắc rollout
- Không đổi business logic ERP ngoài phạm vi field đang chuẩn hóa.
- Ưu tiên backend guard trước, UI manager sau.
- Phase sau chỉ mở khi phase trước đã pass gate.
- Mọi field nhiều giá trị mới phát sinh phải vào inventory này trước khi release.

## Inventory toàn hệ thống (free tag / comma list)

### Nhóm A - CRM taxonomy chuẩn bắt buộc (đã bắt đầu)
- Domain settings:
  - `sales_crm_policies.customerTaxonomy.stages`
  - `sales_crm_policies.customerTaxonomy.sources`
- UI dùng taxonomy:
  - `apps/web/components/settings-center.tsx`
  - `apps/web/components/crm-customers-board.tsx`
  - `apps/web/components/crm-operations-board.tsx`
- API enforce:
  - `apps/api/src/modules/crm/crm.service.ts`
  - `apps/api/src/modules/settings/settings.service.ts`
  - `apps/api/src/modules/settings/settings-policy.service.ts`

### Nhóm B - Settings Center `type: 'tags'`
- Access/Security:
  - `access_security.superAdminIds`
  - `access_security.permissionPolicy.superAdminIds`
  - `access_security.permissionPolicy.superAdminEmails`
- Finance controls:
  - `finance_controls.postingPeriods.lockedPeriods`
- UI mapping:
  - `apps/web/components/settings-center.tsx`
- Parser hiện tại:
  - `parseTagsInput()` trong `apps/web/components/settings-center.tsx`

### Nhóm C - HR appendix lists trong Settings Center
- `hr_policies.appendixFieldCatalog.custom_1.options`
- `hr_policies.appendixFieldCatalog.custom_2.options`
- `hr_policies.appendixFieldCatalog.custom_3.options`
- `hr_policies.appendixTemplates.PL01.fields`
- `hr_policies.appendixTemplates.PL02.fields`
- `hr_policies.appendixTemplates.PL03.fields`
- `hr_policies.appendixTemplates.PL04.fields`
- `hr_policies.appendixTemplates.PL05.fields`
- `hr_policies.appendixTemplates.PL06.fields`
- `hr_policies.appendixTemplates.PL10.fields`
- UI mapping:
  - `apps/web/components/settings-center.tsx`

### Nhóm D - CRM free tags ngoài taxonomy stage/source
- Customer tags:
  - `apps/web/components/crm-customers-board.tsx` (create/update `tags`)
  - `apps/web/components/crm-operations-board.tsx` (create/update `tags`)
- Interaction tags:
  - `apps/web/components/crm-operations-board.tsx` (`interaction.tags`, `interaction.resultTag`)
- API parse/merge:
  - `apps/api/src/modules/crm/crm.service.ts` (`parseTags`, `mergeTags`, `resultTag` flow)

### Nhóm E - Custom fields options CSV
- UI:
  - `apps/web/components/settings-custom-fields-page.tsx` (`optionsText`, `parseCsvValues`)
- API:
  - `apps/api/src/modules/custom-fields/custom-fields.service.ts` (CSV -> list normalize)

## Lộ trình phase (đồng bộ toàn hệ thống)

### Phase 1 - CRM taxonomy manager nền tảng (ongoing)
- Quản trị `stages/sources` bằng bảng + modal + usage.
- CRUD taxonomy qua endpoint chuyên biệt.
- Guard xóa khi còn usage ở:
  - endpoint taxonomy,
  - và update domain trực tiếp.
- Đồng bộ form CRM chính sang controlled select.

### Phase 2 - Settings tags (Access/Security + Finance)
- Chuyển các field nhóm B từ raw tags sang list manager typed:
  - user-id list,
  - email list,
  - accounting period list (`YYYY-MM`).
- Backend validation/normalization theo type.
- Bổ sung guard phụ thuộc nghiệp vụ nếu có tham chiếu.

### Phase 3 - HR appendix option/template manager
- Chuyển nhóm C sang manager có liên kết chéo:
  - catalog option manager,
  - template field picker từ catalog,
  - usage theo template/submission.
- Guard delete khi còn tham chiếu.

### Phase 4 - CRM tag registry (customer/interactions) ✅ (2026-04-04)
- Chuẩn hóa nhóm D sang `tag registry`:
  - create/rename/deprecate tag,
  - suggestion/autocomplete thay input tự do,
  - usage metrics theo customer + interaction.
- Migration dữ liệu cũ và map alias khi rename.

### Phase 5 - Custom field options manager ✅ (2026-04-04)
- Chuẩn hóa nhóm E:
  - thay `optionsText` CSV bằng option rows có key/label/order,
  - remove parser phụ thuộc comma input.
- Giữ tương thích read cho dữ liệu cũ trong giai đoạn chuyển tiếp.

### Phase 6 - Hardening và đóng legacy
- Bật cờ chặn tạo mới dữ liệu từ parser raw tags ở các nhóm đã hoàn tất.
- Cleanup parser cũ sau khi migration và e2e pass.
- Chốt tài liệu vận hành + rollback runbook cho từng nhóm.

## Design contract chung
- Tuân thủ `docs/design/DESIGN_SYSTEM.md`:
  - bảng quản trị,
  - modal add/edit,
  - loading/error rõ ràng,
  - responsive desktop/tablet/mobile.
- Backend là lớp enforce cuối:
  - validate,
  - normalize,
  - dependency guard.
- Mọi đổi schema/logic có rủi ro dữ liệu phải có migration plan rõ ràng trước rollout.

## Definition of Done (áp dụng cho từng phase)
- Không còn nhập raw comma/tags tự do cho các field thuộc phase.
- Delete/rename có backend guard theo usage thực tế.
- UI nghiệp vụ dùng controlled input từ danh mục chuẩn.
- Có test service + UI/e2e cho add/edit/delete/guard đường chính.
- `planning/CURRENT_TASK.md`, `.agent/memory/CONTEXT_SNAPSHOT.md`, `.agent/sessions/*` được cập nhật cùng phase status.
