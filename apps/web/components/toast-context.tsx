'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Global toast notification system.
 * Replaces the pattern where every board has its own resultMessage/errorMessage state.
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('Đã lưu thành công');
 *   toast.error('Lỗi khi lưu');
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
};

type ToastContextValue = {
  toasts: ToastItem[];
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

const TOAST_TTL_MS = 5000;
let toastIdCounter = 0;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`;
    const item: ToastItem = { id, message, variant, createdAt: Date.now() };
    setToasts((prev) => [...prev, item]);

    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useMemo(
    () => ({
      success: (message: string) => addToast(message, 'success'),
      error: (message: string) => addToast(message, 'error'),
      info: (message: string) => addToast(message, 'info'),
      warning: (message: string) => addToast(message, 'warning'),
    }),
    [addToast]
  );

  const value = useMemo(
    () => ({ toasts, toast, dismiss, dismissAll }),
    [toasts, toast, dismiss, dismissAll]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}

// ─── Visual Component ─────────────────────────────────────────────────────
const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(22, 163, 74, 0.08)', border: 'rgba(22, 163, 74, 0.3)', icon: '✓' },
  error: { bg: 'rgba(220, 38, 38, 0.08)', border: 'rgba(220, 38, 38, 0.3)', icon: '✕' },
  info: { bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.3)', icon: 'ℹ' },
  warning: { bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.3)', icon: '⚠' },
};

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 9999,
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none',
      }}
      aria-live="polite"
      role="status"
    >
      {toasts.map((item) => {
        const style = VARIANT_STYLES[item.variant];
        return (
          <div
            key={item.id}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              animation: 'toastSlideIn 0.3s ease-out',
              pointerEvents: 'auto',
            }}
            role="alert"
          >
            <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{style.icon}</span>
            <span style={{ flex: 1 }}>{item.message}</span>
            <button
              onClick={() => dismiss(item.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
                color: 'var(--muted)',
                padding: 0,
                flexShrink: 0,
              }}
              aria-label="Đóng"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
