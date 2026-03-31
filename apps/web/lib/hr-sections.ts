export type HrSectionKey =
  | 'payroll'
  | 'social-insurance'
  | 'recruitment'
  | 'employees'
  | 'attendance'
  | 'performance'
  | 'personal-income-tax'
  | 'goals'
  | 'employee-info';

export type HrSectionDefinition = {
  key: HrSectionKey;
  title: string;
  href: `/modules/hr/${HrSectionKey}`;
  featureKeys: string[];
  description: string;
  highlights: string[];
};

export const HR_SECTION_DEFINITIONS: HrSectionDefinition[] = [
  {
    key: 'payroll',
    title: 'Tiền lương',
    href: '/modules/hr/payroll',
    featureKeys: ['payroll'],
    description: 'Quản lý bảng lương theo kỳ, line items và trạng thái chi trả.',
    highlights: ['Sinh bảng lương theo tháng', 'Theo dõi line item', 'Khóa kỳ chi trả']
  },
  {
    key: 'social-insurance',
    title: 'Bảo hiểm xã hội',
    href: '/modules/hr/social-insurance',
    featureKeys: ['contracts', 'benefits'],
    description: 'Theo dõi hợp đồng và phúc lợi liên quan bảo hiểm xã hội nội bộ.',
    highlights: ['Hợp đồng lao động', 'Mức lương đóng bảo hiểm', 'Phúc lợi theo nhân viên']
  },
  {
    key: 'recruitment',
    title: 'Tuyển dụng',
    href: '/modules/hr/recruitment',
    featureKeys: ['recruitment'],
    description: 'Theo dõi pipeline tuyển dụng, ứng viên và trạng thái xử lý hồ sơ.',
    highlights: ['Pipeline tuyển dụng', 'Theo dõi ứng viên', 'Cập nhật trạng thái hồ sơ']
  },
  {
    key: 'employees',
    title: 'Nhân viên',
    href: '/modules/hr/employees',
    featureKeys: ['employees'],
    description: 'Danh sách nhân viên và thông tin vận hành nhân sự cốt lõi.',
    highlights: ['Hồ sơ nhân viên', 'Thông tin phòng ban', 'Tình trạng lao động']
  },
  {
    key: 'attendance',
    title: 'Chấm công',
    href: '/modules/hr/attendance',
    featureKeys: ['attendance'],
    description: 'Theo dõi chấm công, check-in/check-out và dữ liệu công hàng ngày.',
    highlights: ['Check-in/out', 'Lịch sử công', 'Đi muộn/tăng ca']
  },
  {
    key: 'performance',
    title: 'Đánh giá',
    href: '/modules/hr/performance',
    featureKeys: ['performance'],
    description: 'Đánh giá hiệu suất theo kỳ và ghi chú kết quả đánh giá nhân viên.',
    highlights: ['Kỳ đánh giá', 'Điểm hiệu suất', 'Theo dõi reviewer']
  },
  {
    key: 'personal-income-tax',
    title: 'Thuế TNCN',
    href: '/modules/hr/personal-income-tax',
    featureKeys: ['personal-income-tax'],
    description: 'Quản lý hồ sơ và bản ghi thuế TNCN theo tháng/năm, hỗ trợ generate theo kỳ.',
    highlights: ['Generate kỳ thuế', 'Sửa thủ công trước chốt', 'Theo dõi thu nhập tính thuế']
  },
  {
    key: 'goals',
    title: 'Mục tiêu',
    href: '/modules/hr/goals',
    featureKeys: ['goals'],
    description: 'Thiết lập và theo dõi mục tiêu theo nhân viên/kỳ với cập nhật tiến độ.',
    highlights: ['CRUD mục tiêu', 'Theo dõi tiến độ %', 'Xác định hoàn thành tự động']
  },
  {
    key: 'employee-info',
    title: 'Thông tin nhân sự',
    href: '/modules/hr/employee-info',
    featureKeys: ['employee-info'],
    description: 'Tra cứu hồ sơ nhân sự tổng hợp gồm cá nhân, công việc, hợp đồng và phúc lợi.',
    highlights: ['Danh sách tổng hợp', 'Xem chi tiết hồ sơ', 'Cập nhật thông tin nhân viên']
  }
];

export const HR_SECTION_MAP: Record<HrSectionKey, HrSectionDefinition> = HR_SECTION_DEFINITIONS.reduce(
  (acc, section) => {
    acc[section.key] = section;
    return acc;
  },
  {} as Record<HrSectionKey, HrSectionDefinition>
);

export function isHrSectionKey(value: string): value is HrSectionKey {
  return value in HR_SECTION_MAP;
}
