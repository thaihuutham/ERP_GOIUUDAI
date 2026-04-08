# PHASE 5 - FRONTEND NGHIỆP VỤ CHUYÊN SÂU EXECUTION CHECKLIST

Ngày bắt đầu: 2026-03-28  
Mục tiêu: thay skeleton generic bằng UI nghiệp vụ theo vai trò, có action gating và flow thao tác thật trên từng module trọng yếu.

## Trạng thái tổng quan

- [x] F5.1 Bổ sung session role ở frontend (STAFF/MANAGER/ADMIN)
- [x] F5.2 Role-based navigation cho menu/sidebar + module cards
- [x] F5.3 Role-based action gating ở workbench (ẩn action mutate theo vai trò)
- [x] F5.4 Tách trang `sales` thành màn hình nghiệp vụ chuyên sâu
- [x] F5.5 Flow `sales` có list/filter/pagination server-side + create/update + approval timeline
- [x] F5.6 Tách thêm `scm/hr/crm` khỏi skeleton generic (`finance` đã DONE)
- [x] F5.7 Hoàn thiện E2E UI flow cho toàn bộ module trọng yếu
- [x] F5.8 Chốt verify frontend (`lint`, `build`)

---

## Backlog thao tác (task-level)

| ID | Task | Output file/chạm code | Verify nhanh | Trạng thái |
|---|---|---|---|---|
| F5-001 | Thêm RBAC helper + role model cho UI | `apps/web/lib/rbac.ts` | `npm run lint --workspace @erp/web` | DONE |
| F5-002 | Thêm role context (persist localStorage) | `apps/web/components/user-role-context.tsx` | `npm run lint --workspace @erp/web` | DONE |
| F5-003 | Cập nhật root layout/app shell/home dashboard theo role | `apps/web/app/layout.tsx`, `apps/web/components/app-shell.tsx`, `apps/web/components/home-dashboard.tsx` | `npm run lint --workspace @erp/web` | DONE |
| F5-004 | Role gating ở module screen + module workbench | `apps/web/components/module-screen.tsx`, `apps/web/components/module-workbench.tsx` | `npm run lint --workspace @erp/web` | DONE |
| F5-005 | Tạo sales operations board chuyên sâu | `apps/web/components/sales-operations-board.tsx`, `apps/web/app/modules/sales/page.tsx` | `npm run build --workspace @erp/web` | DONE |
| F5-006 | Bổ sung style responsive cho role switcher + sales board | `apps/web/app/globals.css` | `npm run build --workspace @erp/web` | DONE |
| F5-007 | Mở rộng tương tự cho finance/scm/hr/crm | `apps/web/app/modules/*` | `npm run build --workspace @erp/web` | DONE |
| F5-008 | Chốt verify frontend phase 5 | `@erp/web` | `lint + build` | DONE |

---

## DoD (Phase 5)

1. Có role-based navigation và action gating trên UI. DONE  
2. Skeleton generic được thay bằng màn hình nghiệp vụ cho các module trọng yếu. DONE  
3. Có ít nhất 1 flow E2E hoàn chỉnh trên UI cho module trọng yếu. DONE  
4. Frontend build/lint pass sau refactor. DONE  
