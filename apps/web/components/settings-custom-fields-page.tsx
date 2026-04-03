'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useUserRole } from './user-role-context';

const ENTITY_OPTIONS = [
  { value: 'CUSTOMER', label: 'Khách hàng (CRM)' },
  { value: 'PRODUCT', label: 'Sản phẩm (Catalog)' },
  { value: 'EMPLOYEE', label: 'Nhân sự (HR)' },
  { value: 'SALES_ORDER', label: 'Đơn bán (Sales)' },
  { value: 'PURCHASE_ORDER', label: 'Đơn mua (SCM)' },
  { value: 'INVOICE', label: 'Hóa đơn (Finance)' },
  { value: 'PROJECT', label: 'Dự án (Projects)' },
  { value: 'HR_EVENT', label: 'Sự kiện nhân sự (HR Event)' },
  { value: 'WORKFLOW_DEFINITION', label: 'Quy trình (Workflow Definition)' }
] as const;

const FIELD_TYPE_OPTIONS = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'DATE',
  'DATETIME',
  'BOOLEAN',
  'SELECT',
  'MULTISELECT',
  'RELATION',
  'FORMULA'
] as const;

const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED'] as const;

type EntityType = (typeof ENTITY_OPTIONS)[number]['value'];
type FieldType = (typeof FIELD_TYPE_OPTIONS)[number];
type FieldStatus = (typeof STATUS_OPTIONS)[number];

type DraftFieldRow = {
  id: string;
  persisted: boolean;
  fieldKey: string;
  label: string;
  description: string;
  fieldType: FieldType;
  required: boolean;
  defaultValueText: string;
  optionsText: string;
  relationEntityType: EntityType | '';
  formulaExpression: string;
  filterable: boolean;
  searchable: boolean;
  reportable: boolean;
  status: FieldStatus;
};

type SchemaResponse = {
  entityType: EntityType;
  draft: Record<string, unknown>[];
  published: {
    version: number;
    publishedAt: string;
    publishedBy: string;
    status: string;
  } | null;
};

type HistoryResponse = {
  entityType: EntityType;
  items: Record<string, unknown>[];
};

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9]{1,20}__[a-z][a-z0-9_]{1,60}$/;

function toText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

function normalizeEntityType(value: unknown): EntityType | '' {
  const text = toText(value).trim().toUpperCase();
  return ENTITY_OPTIONS.some((item) => item.value === text as EntityType) ? (text as EntityType) : '';
}

function normalizeFieldType(value: unknown): FieldType {
  const text = toText(value).trim().toUpperCase();
  return FIELD_TYPE_OPTIONS.includes(text as FieldType) ? (text as FieldType) : 'TEXT';
}

function normalizeFieldStatus(value: unknown): FieldStatus {
  const text = toText(value).trim().toUpperCase();
  return STATUS_OPTIONS.includes(text as FieldStatus) ? (text as FieldStatus) : 'DRAFT';
}

function parseOptionsToText(value: unknown) {
  if (!Array.isArray(value)) return '';
  const options = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return toText(record.value ?? record.key ?? record.id).trim();
      }
      return '';
    })
    .filter(Boolean);
  return options.join(', ');
}

function parseDefaultValueToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => toText(item).trim()).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseCsvValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapApiRowToDraftField(row: Record<string, unknown>, index: number): DraftFieldRow {
  return {
    id: toText(row.id, `row_${index}`),
    persisted: Boolean(row.id),
    fieldKey: toText(row.fieldKey).trim(),
    label: toText(row.label).trim(),
    description: toText(row.description).trim(),
    fieldType: normalizeFieldType(row.fieldType),
    required: toBool(row.required, false),
    defaultValueText: parseDefaultValueToText(row.defaultValueJson),
    optionsText: parseOptionsToText(row.optionsJson),
    relationEntityType: normalizeEntityType(row.relationEntityType),
    formulaExpression: toText(row.formulaExpression).trim(),
    filterable: toBool(row.filterable, false),
    searchable: toBool(row.searchable, false),
    reportable: toBool(row.reportable, false),
    status: normalizeFieldStatus(row.status)
  };
}

function createEmptyRow(): DraftFieldRow {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    persisted: false,
    fieldKey: '',
    label: '',
    description: '',
    fieldType: 'TEXT',
    required: false,
    defaultValueText: '',
    optionsText: '',
    relationEntityType: '',
    formulaExpression: '',
    filterable: true,
    searchable: false,
    reportable: false,
    status: 'DRAFT'
  };
}

function buildDefaultValue(row: DraftFieldRow) {
  const raw = row.defaultValueText.trim();
  if (!raw) {
    return null;
  }

  if (row.fieldType === 'NUMBER' || row.fieldType === 'FORMULA') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }

  if (row.fieldType === 'BOOLEAN') {
    const normalized = raw.toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return raw;
  }

  if (row.fieldType === 'MULTISELECT') {
    return parseCsvValues(raw);
  }

  return raw;
}

function validateRow(row: DraftFieldRow): string | null {
  if (!row.fieldKey.trim()) {
    return 'fieldKey là bắt buộc.';
  }
  if (!FIELD_KEY_PATTERN.test(row.fieldKey.trim())) {
    return `fieldKey '${row.fieldKey}' không hợp lệ (mẫu: namespace__field_key).`;
  }
  if (!row.label.trim()) {
    return `Label của '${row.fieldKey}' là bắt buộc.`;
  }
  if ((row.fieldType === 'SELECT' || row.fieldType === 'MULTISELECT') && parseCsvValues(row.optionsText).length === 0) {
    return `Field '${row.fieldKey}' cần ít nhất 1 option.`;
  }
  if (row.fieldType === 'RELATION' && !row.relationEntityType) {
    return `Field '${row.fieldKey}' kiểu RELATION cần relationEntityType.`;
  }
  if (row.fieldType === 'FORMULA' && !row.formulaExpression.trim()) {
    return `Field '${row.fieldKey}' kiểu FORMULA cần công thức.`;
  }
  return null;
}

export function SettingsCustomFieldsPage() {
  const { role } = useUserRole();
  const isAdmin = role === 'ADMIN';

  const [entityType, setEntityType] = useState<EntityType>('CUSTOMER');
  const [rows, setRows] = useState<DraftFieldRow[]>([]);
  const [publishedInfo, setPublishedInfo] = useState<SchemaResponse['published']>(null);
  const [historyItems, setHistoryItems] = useState<Record<string, unknown>[]>([]);
  const [publishNote, setPublishNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEntityLabel = useMemo(
    () => ENTITY_OPTIONS.find((item) => item.value === entityType)?.label ?? entityType,
    [entityType]
  );

  const loadData = async (nextEntityType = entityType) => {
    setLoading(true);
    setError(null);
    try {
      const [schemaPayload, historyPayload] = await Promise.all([
        apiRequest<SchemaResponse>(`/custom-fields/entities/${nextEntityType}/schema`),
        apiRequest<HistoryResponse>(`/custom-fields/entities/${nextEntityType}/history`, {
          query: { limit: 20 }
        })
      ]);
      setRows((schemaPayload.draft ?? []).map((item, index) => mapApiRowToDraftField(item, index)));
      setPublishedInfo(schemaPayload.published ?? null);
      setHistoryItems(Array.isArray(historyPayload.items) ? historyPayload.items : []);
      setMessage(null);
    } catch (loadError) {
      const text = loadError instanceof Error ? loadError.message : 'Không tải được dữ liệu custom fields.';
      setError(text);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(entityType);
  }, [entityType]);

  const updateRow = (rowId: string, updater: (current: DraftFieldRow) => DraftFieldRow) => {
    setRows((current) => current.map((row) => (row.id === rowId ? updater(row) : row)));
  };

  const handleAddRow = () => {
    if (!isAdmin) return;
    setRows((current) => [...current, createEmptyRow()]);
  };

  const handleRemoveNewRow = (rowId: string) => {
    if (!isAdmin) return;
    setRows((current) => current.filter((row) => row.id !== rowId || row.persisted));
  };

  const handleSaveDraft = async () => {
    if (!isAdmin) {
      setError('Bạn không có quyền lưu draft custom fields.');
      return;
    }

    const rowError = rows.map(validateRow).find(Boolean);
    if (rowError) {
      setError(rowError);
      return;
    }

    const definitions = rows.map((row) => {
      const definition: Record<string, unknown> = {
        fieldKey: row.fieldKey.trim(),
        label: row.label.trim(),
        description: row.description.trim() || undefined,
        fieldType: row.fieldType,
        required: row.required,
        defaultValue: buildDefaultValue(row),
        filterable: row.filterable,
        searchable: row.searchable,
        reportable: row.reportable,
        status: row.status
      };

      if (row.fieldType === 'SELECT' || row.fieldType === 'MULTISELECT') {
        definition.options = parseCsvValues(row.optionsText);
      }

      if (row.fieldType === 'RELATION') {
        definition.relationEntityType = row.relationEntityType;
      }

      if (row.fieldType === 'FORMULA') {
        definition.formulaExpression = row.formulaExpression.trim();
      }

      return definition;
    });

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/custom-fields/entities/${entityType}/draft`, {
        method: 'PUT',
        body: {
          definitions
        }
      });
      setMessage(`Đã lưu draft cho ${selectedEntityLabel}.`);
      await loadData(entityType);
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : 'Lưu draft thất bại.';
      setError(text);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!isAdmin) {
      setError('Bạn không có quyền publish custom fields.');
      return;
    }

    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiRequest<Record<string, unknown>>(`/custom-fields/entities/${entityType}/publish`, {
        method: 'POST',
        body: {
          note: publishNote.trim() || undefined
        }
      });
      setPublishNote('');
      setMessage(`Publish thành công version ${toText(payload.version, '?')} cho ${selectedEntityLabel}.`);
      await loadData(entityType);
    } catch (publishError) {
      const text = publishError instanceof Error ? publishError.message : 'Publish thất bại.';
      setError(text);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <article className="module-workbench" style={{ background: 'transparent', display: 'grid', gap: '1rem' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Trường tùy chỉnh</h1>
            <p style={{ color: 'var(--muted)', marginTop: '0.35rem' }}>
              Tạo schema custom fields cho từng thực thể nghiệp vụ và publish version mới.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Link href="/modules/settings" className="btn btn-ghost">
              Quay lại Trung tâm cấu hình
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void loadData(entityType)} disabled={loading}>
              Làm mới
            </button>
          </div>
        </div>
      </header>

      {!isAdmin && (
        <p className="banner banner-warning">
          Bạn đang ở chế độ chỉ đọc. Chỉ `ADMIN` mới được lưu draft hoặc publish schema custom fields.
        </p>
      )}
      {error && <p className="banner banner-error">{error}</p>}
      {message && <p className="banner banner-success">{message}</p>}

      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'minmax(240px, 1fr) minmax(240px, 1fr) minmax(240px, 1fr)' }}>
          <div className="field">
            <label htmlFor="cf-entity-type">Thực thể</label>
            <select
              id="cf-entity-type"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value as EntityType)}
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Version đã publish gần nhất</label>
            <input
              value={publishedInfo ? `v${publishedInfo.version} · ${formatRuntimeDateTime(publishedInfo.publishedAt)}` : 'Chưa publish'}
              readOnly
            />
          </div>
          <div className="field">
            <label>Người publish gần nhất</label>
            <input value={publishedInfo ? toText(publishedInfo.publishedBy, '--') : '--'} readOnly />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={handleAddRow} disabled={!isAdmin || saving || publishing}>
            + Thêm trường
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSaveDraft} disabled={!isAdmin || saving || publishing}>
            {saving ? 'Đang lưu...' : 'Lưu draft'}
          </button>
        </div>
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Draft definitions ({rows.length})</h3>
        {loading ? (
          <p className="muted">Đang tải schema...</p>
        ) : rows.length === 0 ? (
          <p className="muted">Chưa có field nào. Bấm "Thêm trường" để bắt đầu.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {rows.map((row, index) => (
              <section key={row.id} style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    #{index + 1} · {row.fieldKey || '(field mới)'} {row.persisted ? '' : '· mới'}
                  </strong>
                  {!row.persisted && isAdmin && (
                    <button type="button" className="btn btn-ghost" onClick={() => handleRemoveNewRow(row.id)}>
                      Bỏ field mới
                    </button>
                  )}
                </div>

                <div className="form-grid" style={{ marginTop: '0.65rem', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))' }}>
                  <div className="field">
                    <label>fieldKey</label>
                    <input
                      value={row.fieldKey}
                      placeholder="sales__priority"
                      onChange={(event) =>
                        updateRow(row.id, (current) => ({ ...current, fieldKey: event.target.value.trim().toLowerCase() }))
                      }
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="field">
                    <label>Label</label>
                    <input
                      value={row.label}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, label: event.target.value }))}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="field">
                    <label>Field type</label>
                    <select
                      value={row.fieldType}
                      onChange={(event) =>
                        updateRow(row.id, (current) => ({
                          ...current,
                          fieldType: event.target.value as FieldType
                        }))
                      }
                      disabled={!isAdmin}
                    >
                      {FIELD_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Trạng thái</label>
                    <select
                      value={row.status}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, status: event.target.value as FieldStatus }))}
                      disabled={!isAdmin}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>Mô tả</label>
                    <input
                      value={row.description}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, description: event.target.value }))}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="field">
                    <label>Default value</label>
                    <input
                      value={row.defaultValueText}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, defaultValueText: event.target.value }))}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="field">
                    <label>Options (csv)</label>
                    <input
                      value={row.optionsText}
                      placeholder="gold, silver, bronze"
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, optionsText: event.target.value }))}
                      disabled={!isAdmin || (row.fieldType !== 'SELECT' && row.fieldType !== 'MULTISELECT')}
                    />
                  </div>

                  <div className="field">
                    <label>relationEntityType</label>
                    <select
                      value={row.relationEntityType}
                      onChange={(event) =>
                        updateRow(row.id, (current) => ({ ...current, relationEntityType: event.target.value as EntityType | '' }))
                      }
                      disabled={!isAdmin || row.fieldType !== 'RELATION'}
                    >
                      <option value="">-- Chọn thực thể --</option>
                      {ENTITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: 'span 3' }}>
                    <label>formulaExpression</label>
                    <input
                      value={row.formulaExpression}
                      placeholder="quantity * unitPrice"
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, formulaExpression: event.target.value }))}
                      disabled={!isAdmin || row.fieldType !== 'FORMULA'}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, required: event.target.checked }))}
                      disabled={!isAdmin}
                    />
                    <span>required</span>
                  </label>
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={row.filterable}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, filterable: event.target.checked }))}
                      disabled={!isAdmin}
                    />
                    <span>filterable</span>
                  </label>
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={row.searchable}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, searchable: event.target.checked }))}
                      disabled={!isAdmin}
                    />
                    <span>searchable</span>
                  </label>
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={row.reportable}
                      onChange={(event) => updateRow(row.id, (current) => ({ ...current, reportable: event.target.checked }))}
                      disabled={!isAdmin}
                    />
                    <span>reportable</span>
                  </label>
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Publish schema</h3>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr auto' }}>
          <div className="field">
            <label htmlFor="cf-publish-note">Ghi chú publish</label>
            <input
              id="cf-publish-note"
              value={publishNote}
              onChange={(event) => setPublishNote(event.target.value)}
              placeholder="Ví dụ: bổ sung field đánh giá ưu tiên đơn hàng"
              disabled={!isAdmin || publishing}
            />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={handlePublish} disabled={!isAdmin || publishing || saving}>
              {publishing ? 'Đang publish...' : 'Publish version mới'}
            </button>
          </div>
        </div>
      </section>

      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Lịch sử publish</h3>
        {historyItems.length === 0 ? (
          <p className="muted">Chưa có bản publish nào.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Thời điểm</th>
                  <th>Người publish</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => (
                  <tr key={toText(item.id, `${toText(item.version)}_${toText(item.publishedAt)}`)}>
                    <td>{toText(item.version, '--')}</td>
                    <td>{formatRuntimeDateTime(toText(item.publishedAt, ''))}</td>
                    <td>{toText(item.publishedBy, '--')}</td>
                    <td>{toText(item.status, '--')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  );
}
