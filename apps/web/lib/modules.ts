import { canAccessModule, type UserRole } from './rbac';

export type ModuleCard = {
  key: string;
  title: string;
  description: string;
  minRole: UserRole;
};

export const moduleCards: ModuleCard[] = [
  { key: 'crm', title: 'CRM', description: 'Khách hàng 360, tương tác, thanh toán.', minRole: 'STAFF' },
  { key: 'sales', title: 'Bán hàng', description: 'Đơn hàng và vòng đời bán hàng.', minRole: 'STAFF' },
  { key: 'catalog', title: 'Danh mục', description: 'Sản phẩm số và dịch vụ.', minRole: 'STAFF' },
  { key: 'hr', title: 'Nhân sự', description: 'Nhân sự, chấm công, nghỉ phép, lương.', minRole: 'STAFF' },
  { key: 'finance', title: 'Tài chính', description: 'Hóa đơn, bút toán, ngân sách.', minRole: 'MANAGER' },
  { key: 'scm', title: 'Chuỗi cung ứng', description: 'Nhà cung cấp, mua hàng, vận chuyển.', minRole: 'STAFF' },
  { key: 'assets', title: 'Tài sản', description: 'Tài sản và cấp phát tài sản.', minRole: 'STAFF' },
  { key: 'projects', title: 'Dự án', description: 'Dự án, công việc, theo dõi giờ công.', minRole: 'STAFF' },
  { key: 'workflows', title: 'Quy trình', description: 'Luồng phê duyệt và thực thi.', minRole: 'MANAGER' },
  { key: 'reports', title: 'Báo cáo', description: 'Báo cáo tổng hợp.', minRole: 'STAFF' },
  { key: 'settings', title: 'Cài đặt', description: 'Cấu hình hệ thống theo tenant.', minRole: 'ADMIN' },
  { key: 'notifications', title: 'Thông báo', description: 'Thông báo nội bộ.', minRole: 'STAFF' }
];

export function getVisibleModuleCards(role: UserRole) {
  return moduleCards.filter((item) => canAccessModule(role, item.key));
}
