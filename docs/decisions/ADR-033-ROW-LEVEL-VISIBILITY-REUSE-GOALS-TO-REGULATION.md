# ADR-033: Reuse Goals row-level visibility model for HR Regulation

## Status
Accepted

## Context
- Module Goals da co logic scope truy cap du lieu theo quyen (`self/team/department/company`).
- Module Regulation can bo sung cung muc bao ve du lieu de ngan xem va thao tac vuot quyen.
- Yeu cau UX moi:
  - neu scope chi la `self` => uu tien bieu do truc quan (chart-only)
  - neu scope rong hon `self` => hien thi chart + bang chi tiet.

## Decision
- Tai su dung mo hinh scope tu Goals cho Regulation o service layer:
  - xac dinh `viewerScope` tu auth context
  - apply scope vao tat ca read path (`appendix submissions`, `daily scores`, `pip cases`)
  - enforce write rule: non-admin chi duoc ghi cho chinh minh; admin duoc override `employeeId`.
- Contract API Regulation list/stat bo sung `viewerScope` de frontend render theo quyen.
- Contract tao/cap nhat Regulation cho phep `employeeId` optional:
  - backend tu khoa va ghi de theo user login khi non-admin.
- Frontend Goals va Regulation thong nhat quy tac hien thi analytics:
  - `scope=self`: chart-only
  - `scope!=self`: chart + table detail.

## Consequences
- Bao ve du lieu dong nhat giua Goals va Regulation, giam risk lo du lieu cheo nhan su.
- UX ro rang hon theo quyen truy cap, giam nham lan khi van hanh.
- Tang tinh nhat quan contract frontend-backend thong qua `viewerScope`.

## Out of Scope
- Khong mo rong scope model moi ngoai `self/team/department/company` trong phase nay.
- Khong thay doi workflow duyet nghiep vu hien huu cua Regulation.
