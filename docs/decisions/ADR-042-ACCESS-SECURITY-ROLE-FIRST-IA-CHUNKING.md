# ADR-042: Access Security IA theo vai trò + chia nhỏ section

- Status: Accepted
- Date: 2026-04-04
- Owners: ERP Settings Center team

## Bối cảnh
Trang `Bảo mật truy cập` trong Settings Center đang gom quá nhiều nhóm cấu hình trên cùng một tab, dẫn tới:
- khó thao tác,
- khó theo dõi trạng thái,
- tăng rủi ro chỉnh nhầm khi vận hành.

Yêu cầu nghiệp vụ: đơn giản hóa trải nghiệm theo vai trò `ADMIN / MANAGER / STAFF`, giảm mật độ thông tin trên một màn hình.

## Quyết định
1. Tách IA domain `access_security` thành các tab nhỏ theo nghiệp vụ:
   - `Đăng nhập & mật khẩu` (`security-session`, `security-password`)
   - `Phân quyền hệ thống` (`security-permission-engine`, `security-settings-editors`)
   - `Nhật ký & Trợ lý AI` (`security-audit-matrix`, `security-assistant-access`)
   - `Ma trận quyền hạn` (hub vị trí/quyền hiện có)
2. Áp dụng lọc tab theo vai trò để giảm overload:
   - `ADMIN`: thấy toàn bộ tab.
   - `MANAGER`: chỉ thấy tab cần theo dõi vận hành (`Đăng nhập & mật khẩu`, `Nhật ký & Trợ lý AI`).
   - `STAFF`: chỉ thấy tab `Đăng nhập & mật khẩu`.
3. Áp dụng section-card có khả năng `Thu gọn/Mở rộng`; mặc định domain `access_security` chỉ mở section đầu tiên để tập trung.
4. Bổ sung role playbook ngay đầu domain `access_security` để chuẩn hóa luồng thao tác nhanh theo từng vai trò.

## Hệ quả
### Tích cực
- Giảm chiều dài trang, tăng khả năng quét thông tin.
- Dễ onboarding cho manager/staff, không phải nhìn toàn bộ cấu hình nâng cao.
- Giữ nguyên hợp đồng API submit/save hiện tại, không đổi business rule backend.

### Cần lưu ý
- E2E cần cập nhật điều hướng tab mới cho các case thao tác quyền.
- Nếu cần cấp manager/staff thêm quyền trong tương lai, chỉ cần cập nhật allow-list tab ở view-model.

## Triển khai
- `apps/web/components/settings-center/view-model.ts`
- `apps/api/src/modules/settings/settings-layout.metadata.ts`
- `apps/web/components/settings-center.tsx`
- `apps/web/app/styles/modules/workbench.css`
- E2E/unit tests liên quan Settings Center
