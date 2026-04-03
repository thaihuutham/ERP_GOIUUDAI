import { canAccessModule, type UserRole } from './rbac';

export type ModuleCard = {
  key: string;
  title: string;
  description: string;
  minRole: UserRole;
};

export const moduleCards: ModuleCard[] = [
  { key: 'crm', title: 'CRM', description: 'Khách hàng, tương tác, thanh toán.', minRole: 'STAFF' },
  { key: 'sales', title: 'Bán hàng', description: 'Điều hành đơn hàng và phê duyệt.', minRole: 'STAFF' },
  { key: 'catalog', title: 'Danh mục', description: 'Sản phẩm số và dịch vụ số.', minRole: 'STAFF' },
  { key: 'hr', title: 'Nhân sự', description: 'Nhân sự, công, phép, lương.', minRole: 'STAFF' },
  { key: 'finance', title: 'Tài chính', description: 'Hóa đơn, bút toán, ngân sách.', minRole: 'MANAGER' },
  { key: 'scm', title: 'Chuỗi cung ứng', description: 'Nhà cung cấp, mua hàng, giao vận.', minRole: 'STAFF' },
  { key: 'assets', title: 'Tài sản', description: 'Quản lý và cấp phát tài sản.', minRole: 'STAFF' },
  { key: 'projects', title: 'Dự án', description: 'Dự án, công việc, nguồn lực.', minRole: 'STAFF' },
  { key: 'workflows', title: 'Quy trình', description: 'Điều phối và phê duyệt tác vụ.', minRole: 'MANAGER' },
  { key: 'reports', title: 'Báo cáo', description: 'KPI và báo cáo điều hành.', minRole: 'STAFF' },
  { key: 'assistant', title: 'Trợ lý AI', description: 'AI hỗ trợ truy vấn theo phân quyền.', minRole: 'STAFF' },
  { key: 'audit', title: 'Nhật ký hệ thống', description: 'Lưu vết thao tác toàn hệ thống.', minRole: 'MANAGER' },
  { key: 'settings', title: 'Cấu hình hệ thống', description: 'Thiết lập chính sách vận hành.', minRole: 'ADMIN' },
  { key: 'notifications', title: 'Thông báo', description: 'Thông báo nội bộ tập trung.', minRole: 'STAFF' }
];

export function getVisibleModuleCards(role: UserRole) {
  return moduleCards.filter((item) => canAccessModule(role, item.key));
}
