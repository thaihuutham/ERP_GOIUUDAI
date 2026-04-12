'use client';

import { Info, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * InfoTip — Nút ℹ️ hiện popup diễn giải chi tiết.
 *
 * Dành cho người dùng không có kiến thức IT:
 * - Bấm icon ℹ️ → hiển thị popup giải thích
 * - Bấm ngoài hoặc nút X → đóng popup
 * - Có thể đặt bên cạnh bất kỳ label/nút nào
 */
type InfoTipProps = {
  /** Tiêu đề ngắn của popup */
  title?: string;
  /** Nội dung giải thích chi tiết */
  content: string;
  /** Kích thước icon (mặc định 14) */
  size?: number;
};

export function InfoTip({ title, content, size = 14 }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={title || 'Xem hướng dẫn'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 8,
          height: size + 8,
          background: open ? 'color-mix(in srgb, var(--info) 15%, var(--surface))' : 'transparent',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          color: 'var(--info)',
          padding: 0,
          transition: 'all 0.15s ease'
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--info) 12%, var(--surface))')}
        onMouseOut={(e) => (e.currentTarget.style.background = open ? 'color-mix(in srgb, var(--info) 15%, var(--surface))' : 'transparent')}
      >
        <Info size={size} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 6,
            width: 280,
            maxWidth: '85vw',
            padding: '0.85rem 1rem',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            fontSize: '0.8rem',
            lineHeight: 1.55,
            color: 'var(--foreground)',
            animation: 'infotip-fadein 0.15s ease'
          }}
        >
          {/* Arrow indicator */}
          <div style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 12,
            height: 6,
            overflow: 'hidden'
          }}>
            <div style={{
              width: 10,
              height: 10,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              transform: 'rotate(45deg)',
              position: 'absolute',
              top: 2,
              left: 1
            }} />
          </div>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: title ? '0.4rem' : 0 }}>
            {title && (
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--info)' }}>
                {title}
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                padding: 0,
                borderRadius: '50%',
                marginLeft: 'auto',
                flexShrink: 0
              }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Content */}
          <div style={{ color: 'var(--foreground)', whiteSpace: 'pre-line' }}>
            {content}
          </div>

          {/* CSS animation injected inline */}
          <style>{`
            @keyframes infotip-fadein {
              from { opacity: 0; transform: translateX(-50%) translateY(4px); }
              to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
