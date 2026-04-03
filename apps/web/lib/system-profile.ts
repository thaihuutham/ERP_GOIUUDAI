export const SYSTEM_PROFILE = {
  systemName: 'Hệ thống Quản trị tập trung',
  companyName: 'GOIUUDAI',
  businessDomain: 'Sản phẩm số - Dịch vụ số',
  scale: '2.000.000 khách hàng • 50 nhân viên',
  operatingModel: 'Linh hoạt phân tán',
  governanceVision: 'Tự động hóa và AI, con người giám sát',
} as const;

export function getSystemSummaryLine() {
  return `${SYSTEM_PROFILE.companyName} • ${SYSTEM_PROFILE.businessDomain}`;
}
