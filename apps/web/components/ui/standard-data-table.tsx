'use client';

import { Settings2, ArrowUpRight, Check, X, Pencil } from 'lucide-react';
import { ReactNode, useEffect, useState, useMemo } from 'react';

export interface ColumnDefinition<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  isLink?: boolean;
  type?: 'text' | 'number' | 'select' | 'date';
  options?: { label: string; value: string | number }[];
}

interface StandardDataTableProps<T> {
  data: T[];
  columns: ColumnDefinition<T>[];
  storageKey: string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  editableKeys?: string[];
  onSaveRow?: (id: string | number, values: Partial<T>) => Promise<void>;
}

export function StandardDataTable<T extends { id: string | number }>({
  data,
  columns,
  storageKey,
  onRowClick,
  isLoading,
  editableKeys = [],
  onSaveRow,
}: StandardDataTableProps<T>) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  
  // Inline Editing State
  const [editingRowId, setEditingRowId] = useState<string | number | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setVisibleColumns(parsed.visible || columns.map(c => c.key));
        setColumnOrder(parsed.order || columns.map(c => c.key));
      } catch (e) {
        setVisibleColumns(columns.map(c => c.key));
        setColumnOrder(columns.map(c => c.key));
      }
    } else {
      setVisibleColumns(columns.map(c => c.key));
      setColumnOrder(columns.map(c => c.key));
    }
  }, [columns, storageKey]);

  // Save to localStorage
  const saveSettings = (visible: string[], order: string[]) => {
    localStorage.setItem(storageKey, JSON.stringify({ visible, order }));
  };

  const toggleColumn = (key: string) => {
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter((k) => k !== key)
      : [...visibleColumns, key];
    setVisibleColumns(next);
    saveSettings(next, columnOrder);
  };

  const orderedColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    return columnOrder
      .map((key) => colMap.get(key))
      .filter((c): c is ColumnDefinition<T> => !!c && visibleColumns.includes(c.key));
  }, [columns, columnOrder, visibleColumns]);

  const rowSelectTriggerKey = useMemo(() => {
    if (!onRowClick || orderedColumns.length === 0) {
      return null;
    }

    const explicitLinkColumn = orderedColumns.find((column) => column.isLink);
    return explicitLinkColumn?.key ?? orderedColumns[0].key;
  }, [onRowClick, orderedColumns]);

  // Editing Handlers
  const startEditing = (item: T) => {
    setEditingRowId(item.id);
    setEditingValues({ ...item });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
    setIsSaving(false);
  };

  const saveEditing = async () => {
    if (editingRowId === null || !onSaveRow) return;
    setIsSaving(true);
    try {
      await onSaveRow(editingRowId, editingValues as Partial<T>);
      setEditingRowId(null);
      setEditingValues({});
    } catch (error) {
      console.error('Failed to save row:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (key: string, value: any) => {
    setEditingValues(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="standard-table-empty-state">
        Đang tải dữ liệu...
      </div>
    );
  }

  const canEdit = editableKeys.length > 0 && !!onSaveRow;

  return (
    <div className="standard-table">
      <div className="standard-table-toolbar">
        <button
          className="btn btn-ghost standard-table-config-btn"
          onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
          title="Cấu hình cột"
        >
          <Settings2 size={16} />
          <span>Cấu hình cột</span>
        </button>

        {isColumnPickerOpen && (
          <div className="column-picker-popover standard-column-popover">
            <div className="standard-column-popover-title">Hiển thị cột</div>
            <div className="standard-column-popover-list">
              {columns.map((col) => (
                <label key={col.key} className="column-picker-item standard-column-picker-item">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="table-responsive standard-table-wrap">
        <table className="standard-table-table">
          <thead>
            <tr>
              {orderedColumns.map((col) => (
                <th key={col.key}>
                  {col.label}
                </th>
              ))}
              {canEdit && <th className="standard-table-actions-head">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + (canEdit ? 1 : 0)} className="standard-table-empty-row">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              data.map((item) => {
                const isEditing = editingRowId === item.id;
                return (
                  <tr key={item.id} className="standard-table-row">
                    {orderedColumns.map((col) => {
                      const isFieldEditable = editableKeys.includes(col.key);
                      const isRowSelectTrigger = !!onRowClick && rowSelectTriggerKey === col.key;
                      const renderedCellValue = col.render ? col.render(item) : ((item as any)[col.key] || '--');

                      return (
                        <td key={col.key}>
                          {isEditing && isFieldEditable ? (
                            <div onClick={(e: any) => e.stopPropagation()}>
                              {col.type === 'select' ? (
                                <select 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              ) : col.type === 'number' ? (
                                <input 
                                  type="number" 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <input 
                                  type="text" 
                                  value={editingValues[col.key] ?? ''} 
                                  onChange={(e) => handleInputChange(col.key, e.target.value)}
                                  className="standard-cell-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </div>
                          ) : isRowSelectTrigger ? (
                            <button
                              type="button"
                              className="record-link row-select-trigger"
                              onClick={() => onRowClick?.(item)}
                            >
                              {renderedCellValue}
                              <span><ArrowUpRight size={14} /></span>
                            </button>
                          ) : (
                            renderedCellValue
                          )}
                        </td>
                      );
                    })}
                    
                    {canEdit && (
                      <td className="standard-table-actions-cell">
                         {isEditing ? (
                           <div className="standard-edit-actions" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); saveEditing(); }} 
                                disabled={isSaving || !onSaveRow}
                                className="btn btn-primary standard-icon-btn"
                                title="Lưu"
                              >
                                {isSaving ? '...' : <Check size={14} />}
                              </button>
                              <button 
                                onClick={cancelEditing} 
                                className="btn btn-ghost standard-icon-btn"
                                title="Hủy"
                              >
                                <X size={14} />
                              </button>
                           </div>
                         ) : (
                           <button 
                             onClick={(e) => { e.stopPropagation(); startEditing(item); }}
                             className="btn btn-ghost standard-icon-btn"
                             title="Sửa nhanh"
                           >
                             <Pencil size={14} style={{ opacity: 0.5 }} />
                           </button>
                         )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
