export const dynamic = 'force-dynamic';

import { SettingsCenter } from '../../../../components/settings-center';

const SALES_POLICY_TAB_KEYS = [
  'sales-policy-order',
  'sales-policy-checkout',
  'sales-policy-discount-credit',
  'sales-policy-draft'
];

export default function SalesPoliciesPage() {
  return (
    <SettingsCenter
      presetDomain="sales_crm_policies"
      initialTab="sales-policy-order"
      tabFilter={SALES_POLICY_TAB_KEYS}
      hideSidebar
      pageTitle="Chính sách bán hàng"
      pageDescription="Thiết lập các quy tắc bán hàng, checkout, chiết khấu/tín dụng và vận hành đơn nháp."
    />
  );
}
