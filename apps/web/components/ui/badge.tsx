'use client';

import { type ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const VARIANT_MAP: Record<BadgeVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
  info: 'badge-info',
};

type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={`badge ${VARIANT_MAP[variant]}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}

/**
 * Map common ERP status strings to badge variants.
 * Usage: <Badge variant={statusToBadge('approved')}>Đã duyệt</Badge>
 */
export function statusToBadge(status: string | null | undefined): BadgeVariant {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (['approved', 'active', 'done', 'completed', 'paid', 'confirmed', 'da_thanh_toan', 'da_mua'].includes(s)) return 'success';
  if (['pending', 'draft', 'new', 'open', 'processing', 'da_gui'].includes(s)) return 'warning';
  if (['rejected', 'error', 'overdue', 'cancelled', 'failed', 'huy'].includes(s)) return 'danger';
  if (['info', 'scheduled', 'in_progress'].includes(s)) return 'info';
  return 'neutral';
}
