export const dynamic = 'force-dynamic';

import { SettingsCenter } from '../../../../components/settings-center';

const CRM_SETTINGS_TAB_KEYS = [
  'crm-settings-status',
  'crm-settings-renewal',
  'crm-settings-distribution'
];

export default function CrmSettingsPage() {
  return (
    <SettingsCenter
      presetDomain="sales_crm_policies"
      initialTab="crm-settings-status"
      tabFilter={CRM_SETTINGS_TAB_KEYS}
      hideSidebar
      pageTitle="Cài đặt CRM"
      pageDescription="Thiết lập trạng thái CRM, cấu hình nhắc gia hạn và chính sách chia khách tự động."
    />
  );
}
