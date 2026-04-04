# Runbook - Settings Center Redesign V2 Rollback

## Scope
Rollback chi ap dung cho lop UI Settings Center V2 (grouped sidebar + tabs + advanced mode).

## Trigger
- E2E regression nghiem trong tren `/modules/settings`.
- Save/validate/snapshot domain flow bi anh huong trong runtime.

## Steps
1. Checkout commit truoc khi ap dung redesign V2.
2. Deploy lai web app qua GitHub Actions (khong deploy tay tren VM).
3. Smoke test:
   - mo `/modules/settings`
   - save domain `org_profile`
   - save domain `access_security`
   - save domain `hr_policies`
4. Xac nhan API `/api/v1/settings/domains/*` van 200.

## Notes
- Pha 1 khong thay doi semantics contract save/runtime, nen rollback khong can migration data.
- Neu da merge cac thay doi pha 2 metadata-driven trong tuong lai, can bo sung checklist rollback rieng.
