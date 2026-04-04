# Settings Center Redesign V2 - Phase Plan

## Goal
Nang cap UX Settings Center theo huong de dung cho non-IT, van giu on dinh nghiep vu ERP va flow save/runtime hien tai.

## Phase 1 (Implemented in this batch)
- Grouped sidebar theo 4 category.
- Advanced Mode toggle (role-aware default: ADMIN ON, MANAGER/STAFF OFF).
- Tab hoa 3 domain trong diem:
  - `org_profile`: `Cau hinh chung` / `So do to chuc`
  - `hr_policies`: `Thiet lap nhan su` / `Phu luc hop dong` / `Tai khoan nhan vien`
  - `access_security`: `Chinh sach bao mat` / `Ma tran quyen han`
- Graceful degradation khi 1 nhom API loi: khong khoa toan trang.
- Unit test cho view-model + cap nhat e2e settings.

## Phase 2 (Planned)
- Tab hoa 9 domain con lai theo model domain-specific.
- Chuan hoa metadata-driven sau khi xac dinh tab map day du.
- Bo sung e2e regression cho toan bo domain tabs.

## Acceptance Criteria
- Khong thay doi business behavior ERP runtime.
- Save/validate/snapshot tiep tuc hoat dong domain-level nhu cu.
- User non-IT thao tac gon hon voi advanced field duoc an mac dinh.
- Bo test settings pass on dinh tren CI.
