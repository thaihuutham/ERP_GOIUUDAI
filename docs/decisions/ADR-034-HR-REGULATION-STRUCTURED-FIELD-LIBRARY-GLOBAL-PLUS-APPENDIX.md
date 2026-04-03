# ADR-034: HR Regulation Structured Field Library (Global + Per-Appendix)

## Status
Accepted

## Context
- HR can linh hoat cau hinh form theo tung phu luc (PL01/02/03/04/05/06/10) ma khong phu thuoc JSON ky thuat.
- Regulation can governance chat de tranh vo schema khi thay doi field tuy y.
- Analytics can co quy tac ro rang de chart/table chi tong hop dung field da duoc phe duyet KPI.
- He thong can giu kha nang doc lich su du lieu cu sau khi thay doi form/template.

## Decision
- Chon mo hinh `Structured Field Builder` thay vi free-form:
  - Quan tri qua Settings Center, HR/Admin sua field bang UI theo `label/description/type/validation`.
  - `key` ky thuat duoc slug hoa, khong bat buoc nguoi van hanh nho field map.
- Chon pham vi field `Global + Per-Appendix`:
  - `hr_policies.appendixFieldCatalog`: thu vien field dung chung toan he thong.
  - `hr_policies.appendixTemplates`: cau hinh fieldRefs theo tung PL, cho phep override local (`required`, `placeholder`, `defaultValue`, `helpText`, `visibility`, `kpiAlias`).
  - Field local appendix duoc phep khi namespace dung mau `PLxx_*`.
- Metadata contract cho Regulation:
  - `GET /api/v1/hr/regulation/metadata` tra `viewerScope`, `canOverrideEmployeeId`, `requesterEmployeeId`,
    `fieldCatalog`, `appendices` (resolved fields).
- Enforce analytics theo config field:
  - Chi field co `analyticsEnabled=true` va `aggregator != none` moi vao chart/table.
  - Quy tac scope giu thong nhat:
    - `scope=self`: chart-only.
    - `scope!=self`: chart + table.
- Bao toan lich su:
  - Submission payload luu snapshot `_schema.fieldVersions` theo field version tai thoi diem ghi.
  - Ho tro soft-delete/versioning o level cau hinh field/template de khong vo doc du lieu cu.
- Governance V1:
  - Admin-only cho thay doi global field catalog va appendix template.
  - Non-admin bi khoa `employeeId` theo user login; chi admin duoc override.

## Consequences
- Form Regulation tro nen de van hanh hon cho HR (khong can nhap JSON map ky thuat).
- Analytics co governance ro rang, giam sai so KPI do field "tu phat".
- Tang kha nang mo rong module khac tai su dung cung pattern field-library/template.
- Chi phi: logic normalize/validate runtime va test contract tang theo.

## Out of Scope
- Khong mo quyen tao/sua global field cho non-admin trong phase nay.
- Khong thay doi chart library; tiep tuc dung component noi bo hien tai.
- Khong thay doi workflow duyet/nghiep vu cot loi Regulation ngoai phan metadata/form analytics.
