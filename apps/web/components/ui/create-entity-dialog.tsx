'use client';

import type { ReactNode } from 'react';
import { EntityFormModal } from './entity-form-modal';

type CreateEntityDialogProps = {
  open: boolean;
  onClose: () => void;
  entityLabel: string;
  helperText?: string;
  fieldCount?: number;
  children: ReactNode;
  footer?: ReactNode;
};

export function CreateEntityDialog({
  open,
  onClose,
  entityLabel,
  helperText,
  fieldCount,
  children,
  footer
}: CreateEntityDialogProps) {
  return (
    <EntityFormModal
      open={open}
      onClose={onClose}
      title={`Thêm dữ liệu • ${entityLabel}`}
      description={helperText ?? 'Điền đầy đủ thông tin bắt buộc trước khi lưu.'}
      fieldCount={fieldCount}
      footer={footer}
    >
      {children}
    </EntityFormModal>
  );
}

