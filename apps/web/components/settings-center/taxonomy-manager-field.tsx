'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Modal } from '../ui/modal';
import { StandardDataTable, type ColumnDefinition } from '../ui/standard-data-table';

type TaxonomyType = 'stages' | 'sources' | 'customerTags' | 'interactionTags' | 'interactionResultTags';

export type SalesTaxonomyItem = {
  id: string;
  value: string;
  usageCount: number;
  canDelete: boolean;
};

type TaxonomyManagerFieldProps<TType extends TaxonomyType = TaxonomyType> = {
  type: TType;
  title: string;
  description?: string;
  items: SalesTaxonomyItem[];
  busy?: boolean;
  normalization?: 'upper' | 'lower' | 'none';
  valueLabel?: string;
  searchPlaceholder?: string;
  inputPlaceholder?: string;
  inputHelper?: string;
  onCreate: (type: TType, value: string) => Promise<void>;
  onRename: (type: TType, currentValue: string, nextValue: string) => Promise<void>;
  onDelete: (type: TType, value: string) => Promise<void>;
};

type DialogMode = 'create' | 'rename';

const toUsageText = (count: number) => {
  if (count <= 0) {
    return 'Chua co du lieu ap dung';
  }
  if (count === 1) {
    return 'Dang ap dung: 1 ban ghi';
  }
  return `Dang ap dung: ${count.toLocaleString('vi-VN')} ban ghi`;
};

const normalizeInputValue = (value: string, normalization: 'upper' | 'lower' | 'none') => {
  const normalized = value.trim();
  if (normalization === 'lower') {
    return normalized.toLowerCase();
  }
  if (normalization === 'upper') {
    return normalized.toUpperCase();
  }
  return normalized;
};

export function TaxonomyManagerField<TType extends TaxonomyType>({
  type,
  title,
  description,
  items,
  busy = false,
  normalization = 'none',
  valueLabel = 'Gia tri taxonomy',
  searchPlaceholder = 'Tim kiem taxonomy...',
  inputPlaceholder = 'Vi du: DANG_TU_VAN',
  inputHelper = 'Gia tri duoc giu nguyen theo cach ban nhap.',
  onCreate,
  onRename,
  onDelete
}: TaxonomyManagerFieldProps<TType>) {
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [editingValue, setEditingValue] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toUpperCase();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => item.value.toUpperCase().includes(keyword));
  }, [items, query]);

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingValue('');
    setInputValue('');
    setDialogOpen(true);
  };

  const openRenameDialog = (value: string) => {
    setDialogMode('rename');
    setEditingValue(value);
    setInputValue(value);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }
    setDialogOpen(false);
    setEditingValue('');
    setInputValue('');
  };

  const handleSubmit = async () => {
    const nextValue = normalizeInputValue(inputValue, normalization);
    if (!nextValue) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await onCreate(type, nextValue);
      } else {
        await onRename(type, editingValue, nextValue);
      }
      closeDialog();
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDefinition<SalesTaxonomyItem>[]>(() => {
    return [
      {
        key: 'value',
        label: valueLabel,
        render: (item) => (
          <div>
            <strong>{item.value}</strong>
          </div>
        )
      },
      {
        key: 'usageCount',
        label: 'Thong ke ap dung',
        render: (item) => (
          <span style={{ fontSize: '0.82rem', color: item.usageCount > 0 ? '#0f766e' : 'var(--muted)' }}>
            {toUsageText(item.usageCount)}
          </span>
        )
      },
      {
        key: 'actions',
        label: 'Tuy chon',
        render: (item) => (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              aria-label={`Sua ${item.value}`}
              onClick={(event) => {
                event.stopPropagation();
                openRenameDialog(item.value);
              }}
              disabled={busy || isSubmitting}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              aria-label={`Xoa ${item.value}`}
              title={item.canDelete ? `Xoa ${item.value}` : 'Khong the xoa vi dang co du lieu ap dung'}
              onClick={async (event) => {
                event.stopPropagation();
                if (!item.canDelete || busy || isSubmitting) {
                  return;
                }
                const accepted = window.confirm(`Xac nhan xoa '${item.value}'?`);
                if (!accepted) {
                  return;
                }
                await onDelete(type, item.value);
              }}
              disabled={!item.canDelete || busy || isSubmitting}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )
      }
    ];
  }, [busy, isSubmitting, onDelete, type]);

  const dialogTitle = dialogMode === 'create'
    ? `Them ${title.toLowerCase()}`
    : `Cap nhat ${title.toLowerCase()}`;

  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <div>
          <h5 style={{ margin: 0, fontSize: '0.92rem' }}>{title}</h5>
          {description && (
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>{description}</p>
          )}
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateDialog} disabled={busy || isSubmitting}>
          <Plus size={16} />
          Them
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '0.64rem', color: 'var(--muted)' }} />
          <input
            style={{ paddingLeft: '1.9rem' }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
      </div>

      <StandardDataTable
        data={filteredItems}
        columns={columns}
        storageKey={`settings-sales-taxonomy-${type}-v1`}
        isLoading={busy || isSubmitting}
      />

      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        title={dialogTitle}
      >
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`taxonomy-value-${type}`}>
            {dialogMode === 'create' ? 'Gia tri moi' : 'Gia tri cap nhat'}
          </label>
          <input
            id={`taxonomy-value-${type}`}
            value={inputValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (normalization === 'upper') {
                setInputValue(nextValue.toUpperCase());
                return;
              }
              if (normalization === 'lower') {
                setInputValue(nextValue.toLowerCase());
                return;
              }
              setInputValue(nextValue);
            }}
            placeholder={inputPlaceholder}
            autoFocus
          />
          <small>{inputHelper}</small>
        </div>

        <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={closeDialog} disabled={isSubmitting}>
            Dong
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !inputValue.trim()}
          >
            Luu lai
          </button>
        </div>
      </Modal>
    </div>
  );
}
