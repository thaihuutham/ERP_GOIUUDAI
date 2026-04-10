const fs = require('fs');
const file = 'apps/web/components/crm-customers-board.tsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');

const imports = `import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
  CUSTOMER_ZALO_NICK_TYPE_OPTIONS,
  CUSTOMER_ZALO_NICK_TYPE_LABELS,
  CUSTOMER_ZALO_NICK_BADGE,
  CUSTOMER_COLUMN_SETTINGS_STORAGE_KEY,
  CUSTOMER_DEFAULT_VISIBLE_COLUMN_KEYS,
  CUSTOMER_TABLE_PAGE_SIZE,
  AUTH_ENABLED,
  CUSTOMER_FILTER_OPERATOR_LABELS,
  CONTRACT_PRODUCT_TYPE_OPTIONS,
  VEHICLE_KIND_OPTIONS,
  FALLBACK_FILTER_FIELD_CONFIG,
  type Customer,
  type CustomerCareStatus,
  type CustomerZaloNickType,
  type ContractProductType,
  type ContractSummary,
  type CrmCustomerVehicle,
  type CrmCustomerContract,
  type CustomerDetailPayload,
  type CustomerTaxonomyPayload,
  type CreateCustomerFormState,
  type DetailCustomerFormState,
  type VehicleFormState,
  type CustomerBulkTagMode,
  type CustomerBulkFormState,
  type CustomerFilterLogic,
  type CustomerFilterFieldKey,
  type CustomerFilterOperator,
  type CustomerFilterInputType,
  type CustomerFilterCondition,
  type CustomerFilterDraft,
  type CustomerSavedFilter,
  type CustomerSavedFiltersPayload,
  type CustomerFilterFieldConfig
} from './crm-customers/types';

import {
  toNumber,
  toCurrency,
  toDateTime,
  isRecord,
  formatTaxonomyLabel,
  customerStatusLabel,
  customerStatusBadge,
  customerZaloNickTypeLabel,
  customerZaloNickTypeBadge,
  formatContractProductLabel,
  formatContractProductList,
  formatContractReference,
  buildAuditObjectHref,
  buildDetailForm,
  normalizeVehicleKind,
  buildVehicleFormState,
  resolveCurrentActorIdentity,
  readSelectedTags,
  readBulkTags,
  createCustomerFilterConditionId,
  buildCustomerFilterFieldConfigs,
  createDefaultFilterCondition,
  toCustomerFilterDraft,
  toCustomerFilterQueryPayload
} from './crm-customers/utils';
`;

// Find where type CustomerCareStatus starts (approx line 41)
const startIdx = lines.findIndex(l => l.startsWith('type CustomerCareStatus ='));
// Find where CrmCustomersBoard starts (approx line 822)
const endIdx = lines.findIndex(l => l.startsWith('export function CrmCustomersBoard() {'));

if (startIdx !== -1 && endIdx !== -1) {
    const newLines = [
        ...lines.slice(0, startIdx),
        imports,
        ...lines.slice(endIdx)
    ];
    fs.writeFileSync(file, newLines.join('\n'), 'utf8');
    console.log('Patched board successfully.');
} else {
    console.log('Failed to find indices.', startIdx, endIdx);
}
