import React, { FormEvent } from 'react';
import { CreateEntityDialog } from '../ui/create-entity-dialog';
import { CreateCustomerFormState } from './types';
import { readSelectedTags, formatTaxonomyLabel } from './utils';

export type CrmCustomersCreatePanelProps = {
  open: boolean;
  onClose: () => void;
  createForm: CreateCustomerFormState;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateCustomerFormState>>;
  handleCreateCustomer: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  isCreating: boolean;
  createValidationErrors: string[];
  stageOptions: string[];
  sourceOptions: string[];
  customerTagSelectOptions: string[];
  resetCreateForm: () => void;
};

export function CrmCustomersCreatePanel({
  open,
  onClose,
  createForm,
  setCreateForm,
  handleCreateCustomer,
  isCreating,
  createValidationErrors,
  stageOptions,
  sourceOptions,
  customerTagSelectOptions,
  resetCreateForm,
}: CrmCustomersCreatePanelProps) {
  return (
    <CreateEntityDialog
      open={open}
      onClose={() => {
        if (isCreating) return;
        onClose();
        resetCreateForm();
      }}
      entityLabel="Khách hàng"
      helperText="Tạo nhanh hồ sơ khách hàng mới. Có thể lưu liên tục nhiều hồ sơ bằng nút “Lưu & thêm mới”."
      fieldCount={7}
    >
      <form id="crm-create-customer-form" onSubmit={handleCreateCustomer} style={{ display: 'grid', gap: '1rem' }}>
        {createValidationErrors.length > 0 && (
          <div className="validation-summary">
            <strong>Không thể lưu vì:</strong>
            <ul>
              {createValidationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="field">
          <label>Họ tên khách hàng *</label>
          <input
            required
            value={createForm.fullName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div className="field">
          <label>Số điện thoại</label>
          <input
            value={createForm.phone}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="09xxxxxxxx"
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="customer@example.com"
          />
        </div>
        <div className="field">
          <label>Giai đoạn</label>
          <select
            value={createForm.customerStage}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, customerStage: event.target.value }))}
          >
            {stageOptions.length === 0 ? (
              <option value="">Chưa cấu hình giai đoạn trong Settings Center</option>
            ) : null}
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {formatTaxonomyLabel(stage)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Nguồn</label>
          <select
            value={createForm.source}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, source: event.target.value }))}
          >
            {sourceOptions.length === 0 ? (
              <option value="">Chưa cấu hình nguồn trong Settings Center</option>
            ) : null}
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {formatTaxonomyLabel(source)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Phân khúc</label>
          <input
            value={createForm.segment}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, segment: event.target.value }))}
            placeholder="VIP / Retail / B2B..."
          />
        </div>
        <div className="field">
          <label>Tags</label>
          <select
            multiple
            value={createForm.tags}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
            size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
          >
            {customerTagSelectOptions.map((tag) => (
              <option key={`create-tag-${tag}`} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary" disabled={isCreating} style={{ flex: 1 }}>
            {isCreating ? 'Đang tạo...' : 'Lưu'}
          </button>
          <button
            type="submit"
            className="btn btn-secondary"
            data-action="save-add-another"
            disabled={isCreating}
            style={{ flex: 1 }}
          >
            {isCreating ? 'Đang tạo...' : 'Lưu & thêm mới'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => {
              if (isCreating) return;
              onClose();
              resetCreateForm();
            }}
          >
            Hủy
          </button>
        </div>
      </form>
    </CreateEntityDialog>
  );
}
