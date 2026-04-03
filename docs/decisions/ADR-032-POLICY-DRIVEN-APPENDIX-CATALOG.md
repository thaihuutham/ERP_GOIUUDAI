# ADR-032: Policy-driven Appendix Catalog for HR Regulation

## Status
Accepted

## Context
- Truoc day danh muc Appendix (PL01/02/03/04/05/06/10) dang duoc hardcode trong UI va mot phan backend.
- Van hanh can bo sung ten phu luc, mo ta, va field map linh hoat theo quy che noi bo.
- Team van hanh muon quan tri cau hinh nay tu Settings Center, khong can deploy code cho moi thay doi nhe.
- Can fallback an toan de khong chan nghiep vu khi policy chua duoc cau hinh day du.

## Decision
- Mo rong domain policy `hr_policies` voi key moi: `appendixCatalog`.
- Moi item Appendix gom:
  - `code`
  - `name`
  - `description`
  - `fields` (field map de render dynamic form)
- Backend bo sung validation + normalization cho `appendixCatalog` trong `settings-policy.service`.
- Runtime settings bo sung normalize `appendixCatalog` va fallback vao catalog mac dinh an toan.
- Bo sung endpoint metadata `GET /api/v1/hr/regulation/metadata` tra ve:
  - `appendices` (catalog da normalize)
  - `viewerScope`
  - `canOverrideEmployeeId`
  - `requesterEmployeeId`
- Frontend Regulation dung metadata de:
  - hien thi dropdown dang `code - name`
  - render dynamic fields theo `fields`
  - reset cac truong phu thuoc khi doi Appendix

## Consequences
- Giam hardcode, tang kha nang quan tri quy che tu UI.
- Giam nguy co nhap sai phu luc do UI hien ro `code + name + description`.
- Van giu duoc tinh on dinh nho fallback catalog mac dinh khi policy khong hop le.

## Out of Scope
- Chua xay dung workflow duyet thay doi policy Appendix theo nhieu cap.
- Chua version hoa rieng Appendix catalog ngoai co che policy hien tai.
