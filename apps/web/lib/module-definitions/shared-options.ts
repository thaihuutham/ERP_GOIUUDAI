/* ═══════════════════════════════════════════════
   Module Definitions — Shared Option Constants
   Extracted from module-definitions.ts for modularity.
   ═══════════════════════════════════════════════ */

export const STATUS_OPTIONS = [
  { label: 'Đang hoạt động', value: 'ACTIVE' },
  { label: 'Ngừng hoạt động', value: 'INACTIVE' },
  { label: 'Nháp', value: 'DRAFT' },
  { label: 'Chờ xử lý', value: 'PENDING' },
  { label: 'Đã duyệt', value: 'APPROVED' },
  { label: 'Từ chối', value: 'REJECTED' },
  { label: 'Xóa', value: 'ARCHIVED' }
];

export const ATTENDANCE_METHOD_OPTIONS = [
  { label: 'Remote (check-in online)', value: 'REMOTE_TRACKED' },
  { label: 'Văn phòng (Excel cuối tháng)', value: 'OFFICE_EXCEL' },
  { label: 'Miễn chấm công', value: 'EXEMPT' }
];

export const PRODUCT_TYPE_OPTIONS = [
  { label: 'Hàng hóa', value: 'PRODUCT' },
  { label: 'Dịch vụ', value: 'SERVICE' }
];

export const ASSET_LIFECYCLE_OPTIONS = [
  { label: 'Mua sắm', value: 'PROCURE' },
  { label: 'Đang sử dụng', value: 'IN_USE' },
  { label: 'Bảo trì', value: 'MAINTENANCE' },
  { label: 'Ngừng sử dụng', value: 'RETIRED' }
];

export const ASSET_LIFECYCLE_ACTION_OPTIONS = [
  { label: 'Kích hoạt sử dụng', value: 'ACTIVATE' },
  { label: 'Chuyển bảo trì', value: 'SEND_MAINTENANCE' },
  { label: 'Kết thúc bảo trì', value: 'RETURN_MAINTENANCE' },
  { label: 'Ngừng sử dụng', value: 'RETIRE' }
];

export const ASSET_DEPRECIATION_METHOD_OPTIONS = [
  { label: 'Đường thẳng', value: 'STRAIGHT_LINE' },
  { label: 'Số dư giảm dần', value: 'DECLINING_BALANCE' }
];

export const PROJECT_RESOURCE_TYPE_OPTIONS = [
  { label: 'Nhân sự', value: 'NHAN_SU' },
  { label: 'Thiết bị', value: 'THIET_BI' },
  { label: 'Phần mềm', value: 'PHAN_MEM' },
  { label: 'Dịch vụ ngoài', value: 'DICH_VU_NGOAI' }
];

export const PROJECT_BUDGET_TYPE_OPTIONS = [
  { label: 'Kế hoạch', value: 'PLAN' },
  { label: 'Thực tế', value: 'ACTUAL' },
  { label: 'Dự phòng', value: 'RESERVE' }
];

export const PROJECT_TASK_STATUS_OPTIONS = [{ label: 'Tất cả', value: 'ALL' }, ...STATUS_OPTIONS];

export const REPORT_MODULE_OPTIONS = [
  { label: 'Bán hàng', value: 'sales' },
  { label: 'CRM', value: 'crm' },
  { label: 'Danh mục', value: 'catalog' },
  { label: 'Nhân sự', value: 'hr' },
  { label: 'Tài chính', value: 'finance' },
  { label: 'Chuỗi cung ứng', value: 'scm' },
  { label: 'Dự án', value: 'projects' },
  { label: 'Tài sản', value: 'assets' },
  { label: 'Quy trình', value: 'workflows' }
];

export const REPORT_OUTPUT_FORMAT_OPTIONS = [
  { label: 'JSON', value: 'JSON' },
  { label: 'CSV', value: 'CSV' },
  { label: 'Excel (XLSX)', value: 'XLSX' },
  { label: 'PDF', value: 'PDF' }
];

export const REPORT_SCHEDULE_RULE_OPTIONS = [
  { label: 'Theo giờ (1h)', value: 'HOURLY:1' },
  { label: 'Hàng ngày', value: 'DAILY:1' },
  { label: 'Hàng tuần', value: 'WEEKLY:1' }
];

export const REPORT_GROUP_BY_OPTIONS = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tuần', value: 'week' },
  { label: 'Tháng', value: 'month' }
];
