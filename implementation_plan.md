# Đề xuất Thiết kế lại Giao diện Thiết lập Hệ thống (Settings Center)

Căn cứ vào yêu cầu tinh giản và cải thiện UX cho người dùng không thuộc mảng IT, bảng `SettingsCenter` hiện tại đang hiển thị một danh sách phẳng (12 domains) và tất cả thông tin, dù là cơ bản hay cấu hình sâu của server, đều phơi bày khiến giao diện trở nên nặng nề và phức tạp.

Mục tiêu là biến `SettingsCenter` thành một giao diện cài đặt chuẩn, thân thiện như các hệ thống SaaS/ERP hiện đại.

## User Review Required

> [!IMPORTANT]
> - Có cần giữ trực tiếp Sơ đồ tổ chức, Quản lý tài khoản (IAM) ở trong Settings không? Hay quy hoach ra trang riêng (ví dụ `/modules/org` và `/modules/iam`)? Kế hoạch hiện tại giữ ở Settings nhưng **đóng gói vào các Tabs riêng biệt** để giảm rác màn hình.
> - **Chế độ Advanced Mode (Dành cho IT)** sẽ được mặc định là TẮT với những người dùng bình thường, giúp ẩn đi khoảng 30% cấu hình kỹ thuật (Webhooks URL, API Keys, Retry Backoff... ) Bạn đồng ý với quy tắc này chứ?

## Proposed Changes

### Phân loại lại Nhóm Thiết Lập (Logical Grouping)
Chúng ta sẽ loại bỏ danh sách 12 domains phẳng ở sidebar và nhóm chúng lại theo 4 Category:

1. **Hệ thống chung**: 
   - Tổ chức, Nhận diện (`org_profile`)
   - Ngôn ngữ & Lịch (`locale_calendar`)
2. **Quy định Phân hệ**: 
   - Bán hàng & CRM (`sales_crm_policies`)
   - Mua hàng & SCM (`catalog_scm_policies`)
   - Nhân sự & Lương (`hr_policies`)
3. **Quản trị & Kiểm soát**: 
   - Bảo mật truy cập (`access_security`)
   - Ma trận phê duyệt (`approval_matrix`)
   - Kiểm soát tài chính (`finance_controls`)
   - Dữ liệu & Backup (`data_governance_backup`)
4. **Tích hợp & Khác (IT)**: 
   - Tích hợp hệ thống (`integrations`)
   - Thông báo (`notifications_templates`)
   - Tìm kiếm & Hiệu năng (`search_performance`)

---

### Màn hình `Settings Center`

#### [MODIFY] `settings-center.tsx`
**1. Thêm thuôc tính `isAdvanced?: boolean` cho `FieldConfig` và `SectionConfig**.**
- Sửa lại các field thuần kĩ thuật như `int-bhtot-base-url`, `search-timeout`, `data-audit-hot-retention-months`, `notify-retry` thành `isAdvanced: true`.

**2. Thêm Layout "Hiển thị cấu hình nâng cao" (Advanced Mode Toggle)**
- Góc trên cùng bên phải của giao diện Settings sẽ có một Switch Button: "Chế độ Chuyên gia / IT".
- Khi tắt (mặc định), tự động giấu các nhóm/Section có `isAdvanced`.

**3. Cải tiến Sidebar Layout**
- Render sidebar theo danh sách nhóm đã phân cấp (Headers -> Domains).
- Dùng các icon đơn giản (hoặc đánh dấu highlight) cho từng mục.

**4. Áp dụng Tabs để giấu các Layout phức tạp**
- Hiện tại trang `org_profile` chứa một khối Quản trị tổ chức dài ngoằng.
  -> Sẽ đổi thành 2 Tab con ở trên cùng Domain: `[ Cấu hình chung ]` `[ Sơ đồ tổ chức ]`.
- Trang `hr_policies` chứa danh sách quản trị Nhân viên IAM.
  -> Đổi thành Tabs: `[ Thiết lập Nhân sự ]` `[ Phụ lục Hợp đồng ]` `[ Tài khoản Nhân viên ]`.
- Trang `access_security` chứa cấu hình quyền Override matrix.
  -> Đổi thành Tabs: `[ Chính sách Bảo mật ]` `[ Ma trận Quyền hạn ]`.
Nhờ việc chia tab, người dùng sẽ không bị choáng ngợp bởi một thanh cuộn scroll khổng lồ khi vừa bấm vào.

## Open Questions

> [!WARNING]
> Mặc định logic truyền dữ liệu `submissionData` và lệnh Save Configuration lên Server (backend APi `/api/v1/settings/*`) KHÔNG đổi. Chúng ta chỉ tái cấu trúc mã (Refactoring) phía UI/Hiển thị. Bạn xác nhận phạm vi thay đổi chỉ nằm ở frontend?

## Verification Plan

### Manual Verification
- Các dữ liệu configuration (draft and preview) load lại chính xác.
- Khi tắt nút `Advanced View` thì các thông số kĩ thuật (Database timeout, Webhook URLs) ẩn đi, đem lại không gian thoáng đẹp cho người dùng thông thường.
- Phân đoạn Tab của Tổ Chức / Nhân Sự hoạt động tốt, không đè lấp lên form `SAVE` cấu hình của Domain.
- Responsive của Layout 2 cột mới.
