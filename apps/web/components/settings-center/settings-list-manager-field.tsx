'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Modal } from '../ui/modal';
import { StandardDataTable, type ColumnDefinition } from '../ui/standard-data-table';

export type ManagedListType = 'userId' | 'email' | 'period' | 'freeText' | 'fieldKey';

export type ManagedListPickerOption = {
  value: string;
  label: string;
  description?: string;
};

type ManagedListRow = {
  id: string;
  value: string;
};

type SettingsListManagerFieldProps = {
  title: string;
  description?: string;
  listType: ManagedListType;
  items: string[];
  pickerOptions?: ManagedListPickerOption[];
  busy?: boolean;
  testId?: string;
  onChange: (nextValues: string[]) => void;
};

type DialogMode = 'create' | 'edit';

const USER_ID_REGEX = /^[A-Za-z0-9._-]{2,80}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function comparatorKey(listType: ManagedListType, value: string) {
  if (listType === 'period') {
    return value;
  }
  return value.toLowerCase();
}

function normalizeInput(
  listType: ManagedListType,
  raw: string,
  pickerOptionMap: Map<string, ManagedListPickerOption>
): { value: string; error: string | null } {
  const base = String(raw ?? '').trim();
  if (!base) {
    return { value: '', error: 'Giá trị không được để trống.' };
  }

  if (listType === 'fieldKey') {
    const matched = pickerOptionMap.get(comparatorKey(listType, base));
    if (!matched) {
      return { value: '', error: 'Field không hợp lệ. Vui lòng chọn từ danh sách Field library.' };
    }
    return { value: matched.value, error: null };
  }

  if (listType === 'freeText') {
    return { value: base.replace(/\s+/g, ' '), error: null };
  }

  if (listType === 'period') {
    const normalized = base.replace('/', '-');
    if (!PERIOD_REGEX.test(normalized)) {
      return { value: '', error: 'Kỳ không hợp lệ. Định dạng đúng: YYYY-MM.' };
    }
    return { value: normalized, error: null };
  }

  if (listType === 'email') {
    const normalized = base.toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      return { value: '', error: 'Email không hợp lệ.' };
    }
    return { value: normalized, error: null };
  }

  if (!USER_ID_REGEX.test(base)) {
    return {
      value: '',
      error: 'User ID chỉ gồm chữ, số, ".", "_" hoặc "-", dài 2-80 ký tự.'
    };
  }

  return { value: base, error: null };
}

function normalizeList(listType: ManagedListType, values: string[]) {
  const dedupMap = new Map<string, string>();

  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value) {
      continue;
    }
    const key = comparatorKey(listType, value);
    if (!dedupMap.has(key)) {
      dedupMap.set(key, value);
    }
  }

  const deduped = [...dedupMap.values()];
  if (listType === 'period') {
    deduped.sort((left, right) => left.localeCompare(right));
  }
  return deduped;
}

function helperByType(listType: ManagedListType) {
  if (listType === 'fieldKey') {
    return 'Chỉ cho phép chọn field đã khai báo trong Field library.';
  }
  if (listType === 'freeText') {
    return 'Mỗi dòng là một giá trị tùy chọn hiển thị cho trường select.';
  }
  if (listType === 'email') {
    return 'Mỗi dòng là một email. Hệ thống tự chuẩn hóa về chữ thường.';
  }
  if (listType === 'period') {
    return 'Định dạng kỳ: YYYY-MM. Ví dụ: 2026-01.';
  }
  return 'Dùng định danh tài khoản chuẩn (user_id/email nội bộ).';
}

function tagByType(listType: ManagedListType) {
  if (listType === 'fieldKey') {
    return 'FIELD PICKER';
  }
  if (listType === 'freeText') {
    return 'OPTION LIST';
  }
  if (listType === 'email') {
    return 'EMAIL LIST';
  }
  if (listType === 'period') {
    return 'PERIOD LIST';
  }
  return 'USER ID LIST';
}

export function SettingsListManagerField({
  title,
  description,
  listType,
  items,
  pickerOptions = [],
  busy = false,
  testId,
  onChange
}: SettingsListManagerFieldProps) {
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [editingValue, setEditingValue] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const normalizedPickerOptions = useMemo<ManagedListPickerOption[]>(() => {
    const optionMap = new Map<string, ManagedListPickerOption>();
    for (const option of pickerOptions) {
      const value = String(option?.value ?? '').trim();
      if (!value) {
        continue;
      }
      const key = comparatorKey(listType, value);
      if (optionMap.has(key)) {
        continue;
      }
      optionMap.set(key, {
        value,
        label: String(option?.label ?? value).trim() || value,
        description: String(option?.description ?? '').trim()
      });
    }
    return [...optionMap.values()];
  }, [listType, pickerOptions]);

  const pickerOptionMap = useMemo(() => {
    const map = new Map<string, ManagedListPickerOption>();
    for (const option of normalizedPickerOptions) {
      map.set(comparatorKey(listType, option.value), option);
    }
    return map;
  }, [listType, normalizedPickerOptions]);

  const normalizedItems = useMemo(() => normalizeList(listType, items), [listType, items]);

  const filteredRows = useMemo<ManagedListRow[]>(() => {
    const keyword = query.trim().toLowerCase();
    const source = normalizedItems.map((value) => ({ id: value, value }));
    if (!keyword) {
      return source;
    }
    if (listType === 'fieldKey') {
      return source.filter((item) => {
        const byValue = item.value.toLowerCase().includes(keyword);
        if (byValue) {
          return true;
        }
        const option = pickerOptionMap.get(comparatorKey(listType, item.value));
        return option?.label.toLowerCase().includes(keyword) ?? false;
      });
    }
    return source.filter((item) => item.value.toLowerCase().includes(keyword));
  }, [listType, normalizedItems, pickerOptionMap, query]);

  const availablePickerOptions = useMemo(() => {
    if (listType !== 'fieldKey') {
      return [] as ManagedListPickerOption[];
    }

    const used = new Set(normalizedItems.map((item) => comparatorKey(listType, item)));
    if (dialogMode === 'edit' && editingValue) {
      used.delete(comparatorKey(listType, editingValue));
    }

    const available = normalizedPickerOptions.filter((option) => !used.has(comparatorKey(listType, option.value)));
    if (dialogMode === 'edit' && editingValue) {
      const editingKey = comparatorKey(listType, editingValue);
      const hasEditingOption = available.some((option) => comparatorKey(listType, option.value) === editingKey);
      if (!hasEditingOption) {
        const fallbackOption = pickerOptionMap.get(editingKey) ?? {
          value: editingValue,
          label: editingValue
        };
        available.unshift(fallbackOption);
      }
    }

    return available;
  }, [dialogMode, editingValue, listType, normalizedItems, normalizedPickerOptions, pickerOptionMap]);

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingValue('');
    if (listType === 'fieldKey') {
      const used = new Set(normalizedItems.map((item) => comparatorKey(listType, item)));
      const firstAvailable = normalizedPickerOptions.find((option) => !used.has(comparatorKey(listType, option.value)));
      setInputValue(firstAvailable?.value ?? '');
    } else {
      setInputValue('');
    }
    setLocalError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (value: string) => {
    setDialogMode('edit');
    setEditingValue(value);
    setInputValue(value);
    setLocalError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingValue('');
    setInputValue('');
    setLocalError(null);
  };

  const handleDelete = (value: string) => {
    const accepted = window.confirm(`Xác nhận xóa '${value}'?`);
    if (!accepted) {
      return;
    }
    const next = normalizedItems.filter((item) => comparatorKey(listType, item) !== comparatorKey(listType, value));
    onChange(normalizeList(listType, next));
  };

  const handleSubmit = () => {
    const parsed = normalizeInput(listType, inputValue, pickerOptionMap);
    if (parsed.error) {
      setLocalError(parsed.error);
      return;
    }

    const normalizedValue = parsed.value;
    const normalizedKey = comparatorKey(listType, normalizedValue);

    if (dialogMode === 'create') {
      const existed = normalizedItems.some((item) => comparatorKey(listType, item) === normalizedKey);
      if (existed) {
        setLocalError('Giá trị đã tồn tại trong danh sách.');
        return;
      }
      onChange(normalizeList(listType, [...normalizedItems, normalizedValue]));
      closeDialog();
      return;
    }

    const editingParsed = listType === 'fieldKey'
      ? {
          value: String(editingValue ?? '').trim(),
          error: String(editingValue ?? '').trim() ? null : 'Giá trị gốc không hợp lệ.'
        }
      : normalizeInput(listType, editingValue, pickerOptionMap);
    if (editingParsed.error) {
      setLocalError('Giá trị gốc không hợp lệ, vui lòng đóng form và thử lại.');
      return;
    }

    const editingKey = comparatorKey(listType, editingParsed.value);
    const collided = normalizedItems.some(
      (item) => comparatorKey(listType, item) === normalizedKey && comparatorKey(listType, item) !== editingKey
    );
    if (collided) {
      setLocalError('Giá trị mới đang trùng với mục khác.');
      return;
    }

    const next = normalizedItems.map((item) => (
      comparatorKey(listType, item) === editingKey ? normalizedValue : item
    ));
    onChange(normalizeList(listType, next));
    closeDialog();
  };

  const columns = useMemo<ColumnDefinition<ManagedListRow>[]>(() => ([
    {
      key: 'value',
      label: 'Giá trị',
      render: (item) => {
        const option = pickerOptionMap.get(comparatorKey(listType, item.value));
        if (listType === 'fieldKey' && option) {
          return (
            <div>
              <strong>{option.label}</strong>
              {option.label !== item.value ? <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{item.value}</div> : null}
            </div>
          );
        }
        return <strong>{item.value}</strong>;
      }
    },
    {
      key: 'actions',
      label: 'Tùy chọn',
      render: (item) => (
        <div className="settings-list-manager-actions">
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label={`Sửa ${item.value}`}
            onClick={(event) => {
              event.stopPropagation();
              openEditDialog(item.value);
            }}
            disabled={busy}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label={`Xóa ${item.value}`}
            onClick={(event) => {
              event.stopPropagation();
              handleDelete(item.value);
            }}
            disabled={busy}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ]), [busy, listType, pickerOptionMap]);

  const dialogTitle = dialogMode === 'create'
    ? `Thêm ${title.toLowerCase()}`
    : `Cập nhật ${title.toLowerCase()}`;

  return (
    <div className="settings-list-manager" data-testid={testId ? `list-manager-${testId}` : undefined}>
      <div className="settings-list-manager-head">
        <div>
          <h5>{title}</h5>
          {description ? <p>{description}</p> : null}
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateDialog} disabled={busy}>
          <Plus size={16} />
          Thêm
        </button>
      </div>

      <div className="settings-list-manager-toolbar">
        <span className="settings-list-manager-type">{tagByType(listType)}</span>
        <label className="settings-list-manager-search" aria-label={`Tìm kiếm ${title}`}>
          <Search size={14} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm trong danh sách..."
          />
        </label>
      </div>

      <StandardDataTable
        data={filteredRows}
        columns={columns}
        storageKey={`settings-list-manager-${testId ?? listType}-v1`}
        isLoading={busy}
      />

      <Modal open={dialogOpen} onClose={closeDialog} title={dialogTitle}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`settings-list-value-${testId ?? listType}`}>
            {dialogMode === 'create' ? 'Giá trị mới' : 'Giá trị cập nhật'}
          </label>
          {listType === 'fieldKey' ? (
            <select
              id={`settings-list-value-${testId ?? listType}`}
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                if (localError) {
                  setLocalError(null);
                }
              }}
            >
              <option value="">Chọn field</option>
              {availablePickerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`settings-list-value-${testId ?? listType}`}
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                if (localError) {
                  setLocalError(null);
                }
              }}
              placeholder={listType === 'period' ? '2026-01' : listType === 'email' ? 'admin@company.vn' : listType === 'freeText' ? 'Giá trị hiển thị' : 'user_admin_01'}
              autoFocus
            />
          )}
          <small>{helperByType(listType)}</small>
          {listType === 'fieldKey' && availablePickerOptions.length === 0 ? (
            <small style={{ color: '#b45309' }}>Field library đang trống hoặc đã dùng hết. Vui lòng cấu hình field trước.</small>
          ) : null}
          {localError ? <small style={{ color: '#b91c1c' }}>{localError}</small> : null}
        </div>

        <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={closeDialog} disabled={busy}>
            Đóng
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={
              busy
              || !inputValue.trim()
              || (listType === 'fieldKey' && dialogMode === 'create' && availablePickerOptions.length === 0)
            }
          >
            Lưu lại
          </button>
        </div>
      </Modal>
    </div>
  );
}
