'use client';

import { useState, useCallback } from 'react';

type SettingsKeyPoolFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  helper?: string;
};

/**
 * UI component for managing a pool of API keys.
 * Supports add/remove/mask operations with visual feedback.
 */
export function SettingsKeyPoolField({
  value,
  onChange,
  disabled,
  helper,
}: SettingsKeyPoolFieldProps) {
  const [newKey, setNewKey] = useState('');
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);

  const keys = Array.isArray(value) ? value : [];

  const handleAdd = useCallback(() => {
    const trimmed = newKey.trim();
    if (!trimmed || keys.includes(trimmed)) {
      return;
    }
    onChange([...keys, trimmed]);
    setNewKey('');
  }, [newKey, keys, onChange]);

  const handleRemove = useCallback((index: number) => {
    onChange(keys.filter((_, i) => i !== index));
    if (revealedIndex === index) {
      setRevealedIndex(null);
    }
  }, [keys, onChange, revealedIndex]);

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
  };

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {helper && (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.78rem' }}>{helper}</p>
      )}

      {/* Existing keys */}
      {keys.length > 0 && (
        <div style={{ display: 'grid', gap: '0.3rem' }}>
          {keys.map((key, index) => (
            <div
              key={`pool-key-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.5rem',
                background: index === 0 ? 'var(--primary-soft, #e8f4ed)' : 'var(--surface-muted, #f2f7f3)',
                borderRadius: '6px',
                border: '1px solid var(--line, #dfe5e0)',
                fontSize: '0.82rem',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--muted)', minWidth: '2rem' }}>
                #{index + 1}
              </span>
              <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.03em' }}>
                {revealedIndex === index ? key : maskKey(key)}
              </code>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                onClick={() => setRevealedIndex(revealedIndex === index ? null : index)}
                disabled={disabled}
              >
                {revealedIndex === index ? 'Ẩn' : 'Hiện'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', color: '#dc2626' }}
                onClick={() => handleRemove(index)}
                disabled={disabled}
              >
                Xóa
              </button>
              {index === 0 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--primary, #167746)', fontWeight: 700 }}>
                  ACTIVE
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new key */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="Nhập API key mới..."
          disabled={disabled}
          style={{
            flex: 1,
            padding: '0.4rem 0.55rem',
            borderRadius: '6px',
            border: '1px solid var(--line, #dfe5e0)',
            fontSize: '0.82rem',
            fontFamily: 'monospace',
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          onClick={handleAdd}
          disabled={disabled || !newKey.trim()}
        >
          + Thêm key
        </button>
      </div>

      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.72rem' }}>
        {keys.length} key trong bể · Key #1 sẽ được dùng trước, chuyển sang key kế tiếp khi gặp lỗi quota.
      </p>
    </div>
  );
}
