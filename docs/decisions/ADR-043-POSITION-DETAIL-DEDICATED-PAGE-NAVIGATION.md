# ADR-043: Position detail mở trang riêng thay vì cuộn trong Settings Center

- Status: Accepted
- Date: 2026-04-04
- Owners: ERP Settings Center team

## Bối cảnh
Trong tab `Ma trận quyền hạn` của Settings Center, khi click tên vị trí trước đây chỉ highlight row và render khối chi tiết ở bên dưới cùng màn hình.
Với danh sách dài, người dùng phải cuộn xuống để xem chi tiết quyền/nhân sự, gây gián đoạn thao tác.

## Quyết định
1. Đổi hành vi click tên vị trí: chuyển sang route chi tiết riêng
   - `/modules/settings/positions/[positionId]`
2. Trang chi tiết vị trí giữ 2 tab nghiệp vụ:
   - `Chi tiết quyền`
   - `Danh sách nhân viên`
3. Khối chi tiết inline trong Settings Center được bỏ, thay bằng hướng dẫn mở trang chi tiết.

## Hệ quả
### Tích cực
- Loại bỏ thao tác cuộn dài khi cần xem chi tiết vị trí.
- Dễ tập trung vào từng vị trí, nhất là khi chỉnh matrix quyền.
- Tách rõ ngữ cảnh list và ngữ cảnh detail, giảm rối màn hình Settings Center.

### Cần lưu ý
- Cần giữ contract API hiện có để trang detail hoạt động:
  - `GET /settings/positions`
  - `GET /settings/permissions/positions/:positionId`
  - `GET /settings/positions/:positionId/employees`
  - `PUT /settings/permissions/positions/:positionId`

## Triển khai
- New page route:
  - `apps/web/app/modules/settings/positions/[positionId]/page.tsx`
- New client component:
  - `apps/web/components/settings-position-detail-page.tsx`
- Update settings center list behavior:
  - `apps/web/components/settings-center.tsx`
- E2E bổ sung:
  - `apps/web/e2e/tests/settings-center-reports.spec.ts`
