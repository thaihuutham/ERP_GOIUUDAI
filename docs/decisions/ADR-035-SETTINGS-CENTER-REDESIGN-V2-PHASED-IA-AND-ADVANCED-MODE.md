# ADR-035: Settings Center Redesign V2 (Phased IA + Advanced Mode)

## Status
Accepted - 2026-04-03

## Context
- Settings Center hien tai da gom day du domain policy, nhung UI van con nang neu nhin theo user non-IT.
- Domain list dang phang, cac khu vuc lon (Org, IAM, Permission Matrix) hien thi lien mach trong 1 man hinh, kho dung va kho tri tri.
- He thong van hanh noi bo (~50 nhan su), can nang cap UX nhung khong duoc thay doi behavior nghiep vu ERP trong qua trinh tai cau truc.

## Decision
1. Triển khai Settings Center V2 theo lo trinh 2 pha:
   - Pha 1: khung kien truc + grouped sidebar + Advanced Mode + tab hoa 3 domain trong diem (`org_profile`, `hr_policies`, `access_security`).
   - Pha 2: mo rong tab domain-specific cho 9 domain con lai.
2. Advanced Mode role-aware:
   - `ADMIN`: mac dinh ON.
   - `MANAGER`/`STAFF`: mac dinh OFF.
3. Giu nguyen semantics save/validate/snapshot domain-level o pha 1.
4. Tuan thu refactor-safe:
   - khong thay doi business behavior ERP runtime.
   - khong doi nghia API settings hien huu trong pha 1.

## Consequences
### Positive
- Giam tai nhan thuc cho user van hanh.
- Chia nho kien truc UI, de test va mo rong.
- Co lo trinh ro rang de nang cap tiep ma khong bat buoc big-bang rewrite.

### Trade-offs
- Pha 1 chua metadata-driven hoan toan.
- Can duy tri compatibility layer trong qua trinh mo rong pha 2.

## Rollout Notes
- Pha 1 bat buoc pass lint/build + e2e settings regression truoc merge.
- Pha 2 tiep tuc dua tren tab map da chot, khong can thay doi endpoint save/runtime core.

## Rollback Notes
- Neu pha 1 gap regression nghiem trong, rollback ve commit truoc redesign UI (giu nguyen backend settings API).
- Vi save contract khong doi, rollback khong can migration data nghiep vu.
