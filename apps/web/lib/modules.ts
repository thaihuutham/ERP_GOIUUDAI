import { canAccessModule, type UserRole } from './rbac';

export type ModuleCard = {
  key: string;
  title: string;
  description: string;
  minRole: UserRole;
};

export const moduleCards: ModuleCard[] = [
  { key: 'crm', title: 'CRM', description: 'Khách hàng, tương tác, thanh toán.', minRole: 'USER' },
  { key: 'sales', title: 'Bán hàng', description: 'Điều hành đơn hàng và phê duyệt.', minRole: 'USER' },
  { key: 'catalog', title: 'Danh mục', description: 'Sản phẩm số và dịch vụ số.', minRole: 'USER' },
  { key: 'hr', title: 'Nhân sự', description: 'Nhân sự, công, phép, lương.', minRole: 'USER' },
  { key: 'finance', title: 'Tài chính', description: 'Hóa đơn, bút toán, ngân sách.', minRole: 'USER' },
  { key: 'scm', title: 'Chuỗi cung ứng', description: 'Nhà cung cấp, mua hàng, giao vận.', minRole: 'USER' },
  { key: 'assets', title: 'Tài sản', description: 'Quản lý và cấp phát tài sản.', minRole: 'USER' },
  { key: 'projects', title: 'Dự án', description: 'Dự án, công việc, nguồn lực.', minRole: 'USER' },
  { key: 'workflows', title: 'Quy trình', description: 'Điều phối và phê duyệt tác vụ.', minRole: 'USER' },
  { key: 'reports', title: 'Báo cáo', description: 'KPI và báo cáo điều hành.', minRole: 'USER' },
  { key: 'assistant', title: 'Trợ lý AI', description: 'AI hỗ trợ truy vấn theo phân quyền.', minRole: 'USER' },
  { key: 'audit', title: 'Nhật ký hệ thống', description: 'Lưu vết thao tác toàn hệ thống.', minRole: 'USER' },
  { key: 'settings', title: 'Cấu hình hệ thống', description: 'Thiết lập chính sách vận hành.', minRole: 'ADMIN' },
  { key: 'notifications', title: 'Thông báo', description: 'Thông báo nội bộ tập trung.', minRole: 'USER' },
  { key: 'elearning', title: 'Học trực tuyến', description: 'Khóa học, bài thi, chứng nhận nội bộ.', minRole: 'USER' }
];

export function getVisibleModuleCards(role: UserRole) {
  return moduleCards.filter((item) => canAccessModule(role, item.key));
}
