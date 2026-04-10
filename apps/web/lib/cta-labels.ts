/**
 * CTA Label Standards — Chuẩn hóa nhãn nút tạo/lưu/xóa theo module.
 *
 * Quy tắc naming:
 * - Create CTA: "+ Thêm {entity name}"  (e.g. "+ Thêm khách hàng")
 * - Save CTA:   "Lưu {entity name}"     (e.g. "Lưu khách hàng")
 * - Delete CTA:  "Xóa"
 * - Cancel CTA:  "Hủy"
 * - Export CTA:  "Xuất dữ liệu"
 */

export type ModuleCtaConfig = {
  /** Display name for the entity, e.g. "Khách hàng" */
  entityName: string;
  /** Create button label, e.g. "+ Thêm khách hàng" */
  createLabel: string;
  /** Save button label, e.g. "Lưu khách hàng" */
  saveLabel: string;
  /** Dialog title when creating, e.g. "Thêm dữ liệu • Khách hàng" */
  dialogTitle: string;
};

function buildCta(entityName: string): ModuleCtaConfig {
  return {
    entityName,
    createLabel: `+ Thêm ${entityName.toLowerCase()}`,
    saveLabel: `Lưu ${entityName.toLowerCase()}`,
    dialogTitle: `Thêm dữ liệu • ${entityName}`,
  };
}

/**
 * CTA label config per module feature key.
 *
 * Key naming: `{moduleKey}.{featureKey}` matching the module-definitions structure.
 */
export const CTA_LABELS = {
  // ── CRM ────────────────────────────────────
  'crm.customers':       buildCta('Khách hàng'),
  'crm.interactions':    buildCta('Tương tác'),
  'crm.payments':        buildCta('Yêu cầu thanh toán'),
  'crm.vehicles':        buildCta('Xe khách hàng'),

  // ── Sales ──────────────────────────────────
  'sales.orders':        buildCta('Đơn hàng'),
  'sales.invoices':      buildCta('Hóa đơn'),
  'sales.quotations':    buildCta('Báo giá'),

  // ── HR ─────────────────────────────────────
  'hr.employees':        buildCta('Nhân viên'),
  'hr.leave':            buildCta('Phiếu nghỉ phép'),
  'hr.payroll':          buildCta('Bảng lương'),
  'hr.recruitment':      buildCta('Hồ sơ tuyển dụng'),
  'hr.contracts':        buildCta('Hợp đồng'),
  'hr.training':         buildCta('Khóa đào tạo'),
  'hr.regulations':      buildCta('Quy chế'),

  // ── Finance ────────────────────────────────
  'finance.transactions': buildCta('Giao dịch'),
  'finance.budgets':     buildCta('Ngân sách'),
  'finance.reports':     buildCta('Báo cáo tài chính'),

  // ── SCM ────────────────────────────────────
  'scm.purchaseOrders':  buildCta('Đơn mua hàng'),
  'scm.suppliers':       buildCta('Nhà cung cấp'),
  'scm.inventory':       buildCta('Phiếu kho'),

  // ── Catalog ────────────────────────────────
  'catalog.products':    buildCta('Sản phẩm'),
  'catalog.categories':  buildCta('Danh mục'),
  'catalog.brands':      buildCta('Thương hiệu'),

  // ── Assets ─────────────────────────────────
  'assets.items':        buildCta('Tài sản'),
  'assets.maintenance':  buildCta('Bảo trì'),

  // ── Projects ───────────────────────────────
  'projects.projects':   buildCta('Dự án'),
  'projects.tasks':      buildCta('Công việc'),

  // ── Workflows ──────────────────────────────
  'workflows.definitions': buildCta('Quy trình'),
  'workflows.instances':   buildCta('Phiên quy trình'),

  // ── Reports ────────────────────────────────
  'reports.definitions': buildCta('Báo cáo'),

  // ── Settings ───────────────────────────────
  'settings.config':     buildCta('Cấu hình'),
} as const;

export type CtaKey = keyof typeof CTA_LABELS;

/**
 * Lookup CTA config by module + feature key.
 * Falls back to a generic label if the key is not registered.
 */
export function getCtaLabels(moduleKey: string, featureKey: string): ModuleCtaConfig {
  const key = `${moduleKey}.${featureKey}` as CtaKey;
  if (key in CTA_LABELS) {
    return CTA_LABELS[key];
  }
  // Fallback: use featureKey as entity name
  return buildCta(featureKey);
}

/**
 * Common action button labels.
 */
export const ACTION_LABELS = {
  cancel: 'Hủy',
  delete: 'Xóa',
  export: 'Xuất dữ liệu',
  import: 'Nhập dữ liệu',
  refresh: 'Làm mới',
  search: 'Tìm kiếm',
  filter: 'Lọc',
  resetFilter: 'Bỏ lọc',
  approve: 'Duyệt',
  reject: 'Từ chối',
  duplicate: 'Nhân bản',
  archive: 'Lưu trữ',
} as const;
