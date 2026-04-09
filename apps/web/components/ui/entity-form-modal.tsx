'use client';

import type { ReactNode } from 'react';
import { Modal } from './modal';

type EntityFormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fieldCount?: number;
  children: ReactNode;
  footer?: ReactNode;
};

const FULLSCREEN_THRESHOLD = 10;

export function EntityFormModal({
  open,
  onClose,
  title,
  description,
  fieldCount = 0,
  children,
  footer
}: EntityFormModalProps) {
  const useFullScreen = fieldCount >= FULLSCREEN_THRESHOLD;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      maxWidth={useFullScreen ? '96vw' : '760px'}
      variant={useFullScreen ? 'fullscreen' : 'default'}
    >
      {description ? <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.9rem' }}>{description}</p> : null}
      {children}
    </Modal>
  );
}

