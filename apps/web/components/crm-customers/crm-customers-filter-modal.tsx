import React from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/modal';
import {
  CUSTOMER_FILTER_OPERATOR_LABELS,
  FALLBACK_FILTER_FIELD_CONFIG,
  type CustomerSavedFilter,
  type CustomerFilterDraft,
  type CustomerFilterFieldConfig,
  type CustomerFilterFieldKey,
  type CustomerFilterOperator,
  type CustomerFilterCondition
} from './types';

export type CrmCustomersFilterModalProps = {
  isFilterModalOpen: boolean;
  setIsFilterModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingCustomerFilter: boolean;
  applyCurrentFilterDraft: () => void;
  saveCustomerFilterDraft: () => Promise<void>;
  filterErrorMessage: string | null;
  filterMessage: string | null;
  isLoadingCustomerFilters: boolean;
  selectedSavedFilterId: string;
  setSelectedSavedFilterId: React.Dispatch<React.SetStateAction<string>>;
  savedCustomerFilters: CustomerSavedFilter[];
  applySelectedSavedFilter: () => void;
  loadSelectedSavedFilterIntoDraft: () => void;
  deleteSelectedSavedFilter: () => Promise<void>;
  customerFilterDraft: CustomerFilterDraft;
  setCustomerFilterDraft: React.Dispatch<React.SetStateAction<CustomerFilterDraft>>;
  customerFilterFieldConfigs: CustomerFilterFieldConfig[];
  changeFilterConditionField: (id: string, field: CustomerFilterFieldKey) => void;
  changeFilterConditionOperator: (id: string, operator: CustomerFilterOperator) => void;
  upsertFilterDraftCondition: (id: string, updater: (c: CustomerFilterCondition) => CustomerFilterCondition) => void;
  removeFilterDraftCondition: (id: string) => void;
  addFilterDraftCondition: () => void;
  customerTagOptions: string[];
  defaultCustomerFilterId: string | null;
  clearAppliedCustomerFilter: () => void;
};

export function CrmCustomersFilterModal({
  isFilterModalOpen, setIsFilterModalOpen,
  isSavingCustomerFilter, applyCurrentFilterDraft, saveCustomerFilterDraft,
  filterErrorMessage, filterMessage, isLoadingCustomerFilters,
  selectedSavedFilterId, setSelectedSavedFilterId, savedCustomerFilters,
  applySelectedSavedFilter, loadSelectedSavedFilterIntoDraft, deleteSelectedSavedFilter,
  customerFilterDraft, setCustomerFilterDraft, customerFilterFieldConfigs,
  changeFilterConditionField, changeFilterConditionOperator, upsertFilterDraftCondition,
  removeFilterDraftCondition, addFilterDraftCondition, customerTagOptions,
  defaultCustomerFilterId, clearAppliedCustomerFilter
}: CrmCustomersFilterModalProps) {
  return (
<Modal
        open={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Bộ lọc khách hàng"
        maxWidth="880px"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsFilterModalOpen(false)}
              disabled={isSavingCustomerFilter}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={applyCurrentFilterDraft}
              disabled={isSavingCustomerFilter}
            >
              Áp dụng tạm
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveCustomerFilterDraft}
              disabled={isSavingCustomerFilter}
            >
              <Save size={14} />
              {isSavingCustomerFilter ? 'Đang lưu...' : 'Lưu bộ lọc'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: '0.95rem' }}>
          {filterErrorMessage ? (
            <div className="finance-alert finance-alert-danger" style={{ margin: 0 }}>
              {filterErrorMessage}
            </div>
          ) : null}
          {filterMessage ? (
            <div className="finance-alert finance-alert-success" style={{ margin: 0 }}>
              {filterMessage}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: '0.55rem', padding: '0.7rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <strong>Bộ lọc đã lưu</strong>
              {isLoadingCustomerFilters ? <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Đang tải...</span> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: '0.45rem' }}>
              <select
                value={selectedSavedFilterId}
                onChange={(event) => setSelectedSavedFilterId(event.target.value)}
              >
                <option value="">-- Chọn bộ lọc đã lưu --</option>
                {savedCustomerFilters.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {filter.name}{filter.isDefault ? ' (Mặc định)' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost" onClick={applySelectedSavedFilter} disabled={!selectedSavedFilterId}>
                Áp dụng
              </button>
              <button type="button" className="btn btn-ghost" onClick={loadSelectedSavedFilterIntoDraft} disabled={!selectedSavedFilterId}>
                Chỉnh sửa
              </button>
              <button type="button" className="btn btn-danger" onClick={deleteSelectedSavedFilter} disabled={!selectedSavedFilterId || isSavingCustomerFilter}>
                <Trash2 size={14} />
                Xóa
              </button>
            </div>
            {defaultCustomerFilterId ? (
              <small style={{ color: 'var(--muted)' }}>
                Mặc định hiện tại: {savedCustomerFilters.find((item) => item.id === defaultCustomerFilterId)?.name ?? 'Không xác định'}
              </small>
            ) : (
              <small style={{ color: 'var(--muted)' }}>Chưa có bộ lọc mặc định.</small>
            )}
            <div>
              <button type="button" className="btn btn-ghost" onClick={clearAppliedCustomerFilter}>
                Xóa bộ lọc đang áp dụng
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.6rem', padding: '0.7rem', border: '1px solid var(--line)', borderRadius: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.55rem' }}>
              <div className="field">
                <label>Tên bộ lọc</label>
                <input
                  value={customerFilterDraft.name}
                  onChange={(event) =>
                    setCustomerFilterDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Ví dụ: Khách có xe sắp hết bảo hiểm"
                />
              </div>
              <div className="field">
                <label>Logic điều kiện</label>
                <select
                  value={customerFilterDraft.logic}
                  onChange={(event) =>
                    setCustomerFilterDraft((prev) => ({
                      ...prev,
                      logic: event.target.value === 'OR' ? 'OR' : 'AND',
                    }))
                  }
                >
                  <option value="AND">AND (thỏa tất cả)</option>
                  <option value="OR">OR (thỏa một trong các điều kiện)</option>
                </select>
              </div>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input
                type="checkbox"
                checked={customerFilterDraft.isDefault}
                onChange={(event) =>
                  setCustomerFilterDraft((prev) => ({ ...prev, isDefault: event.target.checked }))
                }
              />
              <span>Đặt làm bộ lọc mặc định (tự áp dụng lần sau)</span>
            </label>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {customerFilterDraft.conditions.map((condition, index) => {
                const fieldConfig = customerFilterFieldConfigs.find((item) => item.value === condition.field)
                  ?? customerFilterFieldConfigs[0]
                  ?? FALLBACK_FILTER_FIELD_CONFIG;
                const operatorOptions = fieldConfig.operators;
                const showValueInput = !['is_empty', 'is_not_empty'].includes(condition.operator);
                const showValueTo = condition.operator === 'between';
                const enumOptions = fieldConfig.options ?? [];

                return (
                  <div
                    key={condition.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: showValueTo ? '1.2fr 1fr 1fr 1fr auto' : '1.25fr 1fr 1.25fr auto',
                      gap: '0.45rem',
                      alignItems: 'end',
                    }}
                  >
                    <div className="field">
                      <label>Field #{index + 1}</label>
                      <select
                        value={condition.field}
                        onChange={(event) => changeFilterConditionField(condition.id, event.target.value as CustomerFilterFieldKey)}
                      >
                        {Array.from(new Set(customerFilterFieldConfigs.map((item) => item.group))).map((groupName) => (
                          <optgroup key={groupName} label={groupName}>
                            {customerFilterFieldConfigs
                              .filter((item) => item.group === groupName)
                              .map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Toán tử</label>
                      <select
                        value={condition.operator}
                        onChange={(event) => changeFilterConditionOperator(condition.id, event.target.value as CustomerFilterOperator)}
                      >
                        {operatorOptions.map((operator) => (
                          <option key={`${condition.id}-${operator}`} value={operator}>
                            {CUSTOMER_FILTER_OPERATOR_LABELS[operator]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {showValueInput ? (
                      <div className="field">
                        <label>Giá trị</label>
                        {fieldConfig.inputType === 'enum' ? (
                          <select
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                          >
                            <option value="">-- Chọn --</option>
                            {enumOptions.map((option) => (
                              <option key={`${condition.id}-enum-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : fieldConfig.inputType === 'date' ? (
                          <input
                            type="date"
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                          />
                        ) : (
                          <input
                            list={fieldConfig.inputType === 'tag' ? 'crm-filter-tag-options' : undefined}
                            value={condition.value}
                            onChange={(event) =>
                              upsertFilterDraftCondition(condition.id, (current) => ({ ...current, value: event.target.value }))
                            }
                            placeholder="Nhập giá trị..."
                          />
                        )}
                      </div>
                    ) : null}

                    {showValueTo ? (
                      <div className="field">
                        <label>Đến ngày</label>
                        <input
                          type="date"
                          value={condition.valueTo}
                          onChange={(event) =>
                            upsertFilterDraftCondition(condition.id, (current) => ({ ...current, valueTo: event.target.value }))
                          }
                        />
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeFilterDraftCondition(condition.id)}
                      title="Xóa điều kiện"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <datalist id="crm-filter-tag-options">
                {customerTagOptions.map((tag) => (
                  <option key={`crm-filter-tag-${tag}`} value={tag} />
                ))}
              </datalist>
              <div>
                <button type="button" className="btn btn-ghost" onClick={addFilterDraftCondition}>
                  <Plus size={14} />
                  Thêm điều kiện
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
  );
}
