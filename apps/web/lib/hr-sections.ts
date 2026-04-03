export type HrSectionKey =
  | 'payroll'
  | 'social-insurance'
  | 'recruitment'
  | 'employees'
  | 'attendance'
  | 'regulation'
  | 'performance'
  | 'personal-income-tax'
  | 'goals';

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
    description: 'Quản lý bảng lương theo kỳ và trạng thái chi trả.',
    highlights: ['Tạo bảng lương định kỳ', 'Theo dõi chi tiết khoản lương', 'Khóa kỳ chi trả']
  },
  {
    key: 'social-insurance',
    title: 'Bảo hiểm xã hội',
    href: '/modules/hr/social-insurance',
    featureKeys: ['contracts', 'benefits'],
    description: 'Theo dõi hợp đồng và quyền lợi bảo hiểm xã hội.',
    highlights: ['Hợp đồng lao động', 'Mức lương đóng bảo hiểm', 'Phúc lợi theo nhân viên']
  },
  {
    key: 'recruitment',
    title: 'Tuyển dụng',
    href: '/modules/hr/recruitment',
    featureKeys: ['recruitment'],
    description: 'Theo dõi pipeline tuyển dụng và trạng thái hồ sơ.',
    highlights: ['Pipeline tuyển dụng', 'Theo dõi ứng viên', 'Cập nhật trạng thái hồ sơ']
  },
  {
    key: 'employees',
    title: 'Nhân viên',
    href: '/modules/hr/employees',
    featureKeys: ['employees'],
    description: 'Danh sách nhân viên và thông tin nhân sự cốt lõi.',
    highlights: ['Hồ sơ nhân viên', 'Thông tin phòng ban', 'Tình trạng lao động']
  },
  {
    key: 'attendance',
    title: 'Chấm công',
    href: '/modules/hr/attendance',
    featureKeys: ['attendance'],
    description: 'Theo dõi chấm công và dữ liệu công hằng ngày.',
    highlights: ['Check-in/out', 'Lịch sử công', 'Đi muộn và tăng ca']
  },
  {
    key: 'regulation',
    title: 'Quy chế 2026',
    href: '/modules/hr/regulation',
    featureKeys: ['performance'],
    description: 'Số hóa phụ lục PL01/02/03/04/05/06/10, điểm ngày và PIP.',
    highlights: ['Biểu mẫu phụ lục', 'Điểm ngày tự động', 'Tạo draft PIP']
  },
  {
    key: 'performance',
    title: 'Đánh giá',
    href: '/modules/hr/performance',
    featureKeys: ['performance'],
    description: 'Đánh giá hiệu suất theo kỳ và lưu kết quả.',
    highlights: ['Kỳ đánh giá', 'Điểm hiệu suất', 'Theo dõi reviewer']
  },
  {
    key: 'personal-income-tax',
    title: 'Thuế TNCN',
    href: '/modules/hr/personal-income-tax',
    featureKeys: ['personal-income-tax'],
    description: 'Quản lý hồ sơ và bản ghi thuế TNCN theo kỳ.',
    highlights: ['Generate kỳ thuế', 'Sửa thủ công trước chốt', 'Theo dõi thu nhập tính thuế']
  },
  {
    key: 'goals',
    title: 'Mục tiêu',
    href: '/modules/hr/goals',
    featureKeys: ['goals'],
    description: 'Thiết lập mục tiêu theo nhân viên và theo dõi tiến độ.',
    highlights: ['Tạo và cập nhật mục tiêu', 'Theo dõi tiến độ %', 'Xác định hoàn thành tự động']
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
