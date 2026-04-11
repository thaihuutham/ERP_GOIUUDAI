'use client';

import type { FieldConfig, SalesTaxonomyType, CrmTagRegistryType, SalesTaxonomyPayload, CrmTagRegistryPayload, TaxonomyManagerType } from '../settings-center/domain-config';
import { toStringArray, toManagedListItems } from '../settings-center/domain-config';
import { TaxonomyManagerField, type SalesTaxonomyItem } from '../settings-center/taxonomy-manager-field';
import { SettingsListManagerField, type ManagedListPickerOption } from '../settings-center/settings-list-manager-field';
import { SettingsKeyPoolField } from '../settings-center/settings-key-pool-field';

type SettingsFieldRendererProps = {
  advancedMode?: boolean;
  fields: FieldConfig[];
  getFieldValue: (field: FieldConfig) => unknown;
  updateField: (field: FieldConfig, input: unknown) => void;
  fieldErrorMap: Record<string, string[]>;
  // Taxonomy
  salesTaxonomy: SalesTaxonomyPayload;
  crmTagRegistry: { customerTags: SalesTaxonomyItem[]; interactionTags: SalesTaxonomyItem[]; interactionResultTags: SalesTaxonomyItem[] };
  busy: boolean;
  salesTaxonomyBusy: boolean;
  crmTagRegistryBusy: boolean;
  hrAppendixFieldPickerOptions: ManagedListPickerOption[] | undefined;
  isSalesTaxonomyType: (type: TaxonomyManagerType) => type is SalesTaxonomyType;
  isCrmTagRegistryType: (type: TaxonomyManagerType) => type is CrmTagRegistryType;
  handleCreateSalesTaxonomy: (type: SalesTaxonomyType, value: string) => Promise<void>;
  handleRenameSalesTaxonomy: (type: SalesTaxonomyType, currentValue: string, nextValue: string) => Promise<void>;
  handleDeleteSalesTaxonomy: (type: SalesTaxonomyType, value: string) => Promise<void>;
  handleCreateCrmTagRegistry: (type: CrmTagRegistryType, value: string) => Promise<void>;
  handleRenameCrmTagRegistry: (type: CrmTagRegistryType, currentValue: string, nextValue: string) => Promise<void>;
  handleDeleteCrmTagRegistry: (type: CrmTagRegistryType, value: string) => Promise<void>;
};

export function SettingsFieldRenderer({
  advancedMode,
  fields,
  getFieldValue,
  updateField,
  fieldErrorMap,
  salesTaxonomy,
  crmTagRegistry,
  busy,
  salesTaxonomyBusy,
  crmTagRegistryBusy,
  hrAppendixFieldPickerOptions,
  isSalesTaxonomyType,
  isCrmTagRegistryType,
  handleCreateSalesTaxonomy,
  handleRenameSalesTaxonomy,
  handleDeleteSalesTaxonomy,
  handleCreateCrmTagRegistry,
  handleRenameCrmTagRegistry,
  handleDeleteCrmTagRegistry,
}: SettingsFieldRendererProps) {
  const visibleFields = fields.filter((field) => !field.isAdvanced || advancedMode);

  return (
    <>
      {visibleFields.map((field) => {
        const value = getFieldValue(field);
        const errors = fieldErrorMap[field.id] ?? [];

        if (field.type === 'switch') {
          return (
            <div className="field" key={field.id}>
              <label className="checkbox-wrap">
                <input type="checkbox" checked={value === true} onChange={(event) => updateField(field, event.target.checked)} />
                <span>{field.label}</span>
              </label>
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'select') {
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <select id={field.id} value={String(value)} onChange={(event) => updateField(field, event.target.value)}>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'multiSelect') {
          const selected = toStringArray(value);
          const hasPreview = field.options?.some(opt => opt.previewImage);
          
          if (hasPreview) {
            return (
              <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                <label>{field.label}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem', marginTop: '0.4rem' }}>
                  {(field.options ?? []).map((option) => {
                    const isChecked = selected.includes(option.value);
                    return (
                      <label key={`${field.id}-${option.value}`} style={{ cursor: 'pointer', position: 'relative' }}>
                        <input
                          type="checkbox"
                          className="visually-hidden"
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                          checked={isChecked}
                          onChange={(event) => {
                            const next = event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value);
                            updateField(field, next);
                          }}
                        />
                        <div style={{
                          border: isChecked ? '2px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: isChecked ? 'var(--primary-soft)' : '#fff',
                          transition: 'all 0.2s',
                          boxShadow: isChecked ? '0 0 0 1px var(--primary)' : 'none'
                        }}>
                          <div style={{ height: '90px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
                            {option.previewImage ? (
                              <img src={option.previewImage} alt={option.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '10px', color: '#999' }}>Chưa có hình</span>
                            )}
                          </div>
                          <div style={{ padding: '0.6rem', fontSize: '0.8rem', fontWeight: 500, textAlign: 'center', color: isChecked ? 'var(--primary)' : 'var(--text-main)', borderTop: '1px solid var(--border)' }}>
                            {option.label}
                          </div>
                        </div>
                        {isChecked && (
                          <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                            ✓
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
                {field.helper && <small style={{ marginTop: '0.6rem', display: 'block' }}>{field.helper}</small>}
                {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
              </div>
            );
          }

          return (
            <div className="field" key={field.id}>
              <label>{field.label}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.35rem' }}>
                {(field.options ?? []).map((option) => (
                  <label key={`${field.id}-${option.value}`} className="checkbox-wrap" style={{ border: '1px solid #dbeadf', borderRadius: '8px', padding: '0.35rem 0.45rem' }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option.value)}
                      onChange={(event) => {
                        const next = event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value);
                        updateField(field, next);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'textarea' || field.type === 'userDomainMap') {
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <textarea id={field.id} value={String(value)} placeholder={field.placeholder} onChange={(event) => updateField(field, event.target.value)} />
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'number') {
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <div style={{ display: 'grid', gridTemplateColumns: field.unit ? '1fr auto' : '1fr', gap: '0.4rem', alignItems: 'center' }}>
                <input id={field.id} type="number" value={String(value)} min={field.min} max={field.max} step={field.step ?? 1} onChange={(event) => updateField(field, event.target.value)} />
                {field.unit && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{field.unit}</span>}
              </div>
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'secret') {
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <input id={field.id} type="password" value={String(value)} placeholder={field.placeholder} autoComplete="off" onChange={(event) => updateField(field, event.target.value)} />
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'keyPool') {
          const poolKeys = Array.isArray(value) ? (value as string[]) : [];
          return (
            <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
              <label>{field.label}</label>
              <SettingsKeyPoolField
                value={poolKeys}
                onChange={(next) => updateField(field, next)}
                disabled={busy}
                helper={field.helper}
              />
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'managedList') {
          const managedListType = field.managedListType;
          if (!managedListType) {
            return (<div className="field" key={field.id}><label>{field.label}</label><small style={{ color: '#b91c1c' }}>Thiếu cấu hình managedListType cho field này.</small></div>);
          }
          const pickerOptions = managedListType === 'fieldKey' ? hrAppendixFieldPickerOptions : undefined;
          return (
            <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
              <SettingsListManagerField title={field.label} description={field.helper} listType={managedListType} items={toManagedListItems(field, value)} pickerOptions={pickerOptions} busy={busy} testId={field.id} onChange={(nextValues) => updateField(field, nextValues)} />
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'tags') {
          const text = toStringArray(value).join(', ');
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <input id={field.id} type="text" value={text} placeholder={field.placeholder ?? 'A, B, C'} onChange={(event) => updateField(field, event.target.value)} />
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'taxonomyManager') {
          const managerType = field.taxonomyType;
          if (!managerType) {
            return (<div className="field" key={field.id}><label>{field.label}</label><small style={{ color: '#b91c1c' }}>Thiếu cấu hình taxonomyType cho field này.</small></div>);
          }
          if (isSalesTaxonomyType(managerType)) {
            return (
              <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
                <TaxonomyManagerField type={managerType} title={field.label} description={field.helper} items={salesTaxonomy[managerType]} busy={busy || salesTaxonomyBusy} normalization="none" valueLabel="Gia tri taxonomy" searchPlaceholder="Tim kiem taxonomy..." inputPlaceholder="Vi du: DANG_TU_VAN" inputHelper="Gia tri taxonomy duoc giu nguyen theo cach nhap." onCreate={handleCreateSalesTaxonomy} onRename={handleRenameSalesTaxonomy} onDelete={handleDeleteSalesTaxonomy} />
                {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
              </div>
            );
          }
          if (!isCrmTagRegistryType(managerType)) {
            return (<div className="field" key={field.id}><label>{field.label}</label><small style={{ color: '#b91c1c' }}>taxonomyType không hợp lệ cho field này.</small></div>);
          }
          return (
            <div className="field" key={field.id} style={{ gridColumn: '1 / -1' }}>
              <TaxonomyManagerField type={managerType} title={field.label} description={field.helper} items={crmTagRegistry[managerType]} busy={busy || crmTagRegistryBusy} normalization="lower" valueLabel="Gia tri tag" searchPlaceholder="Tim kiem CRM tag..." inputPlaceholder="Vi du: vip" inputHelper="Gia tri se duoc chuan hoa lowercase de dong nhat CRM tag registry." onCreate={handleCreateCrmTagRegistry} onRename={handleRenameCrmTagRegistry} onDelete={handleDeleteCrmTagRegistry} />
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        if (field.type === 'color') {
          return (
            <div className="field" key={field.id}>
              <label htmlFor={field.id}>{field.label}</label>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input id={`${field.id}-picker`} type="color" value={String(value) || field.placeholder || '#0a5f38'}
                  onChange={(event) => { updateField(field, event.target.value); if (field.path === 'branding.primaryColor' && typeof document !== 'undefined') { document.documentElement.style.setProperty('--primary', event.target.value); } }}
                  style={{ width: '38px', height: '38px', padding: '0', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 'var(--radius)' }}
                />
                <input id={field.id} type="text" value={String(value)} placeholder={field.placeholder}
                  onChange={(event) => { updateField(field, event.target.value); if (field.path === 'branding.primaryColor' && typeof document !== 'undefined') { const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/; if (hexRegex.test(event.target.value)) { document.documentElement.style.setProperty('--primary', event.target.value); } } }}
                  style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}
                />
              </div>
              {field.helper && <small>{field.helper}</small>}
              {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
            </div>
          );
        }

        // Default: text input
        return (
          <div className="field" key={field.id}>
            <label htmlFor={field.id}>{field.label}</label>
            <input id={field.id} type="text" value={String(value)} placeholder={field.placeholder} onChange={(event) => updateField(field, event.target.value)} />
            {field.helper && <small>{field.helper}</small>}
            {errors.length > 0 && <small style={{ color: '#b91c1c' }}>{errors[0]}</small>}
          </div>
        );
      })}
    </>
  );
}
