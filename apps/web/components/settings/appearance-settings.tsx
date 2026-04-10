'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Palette, RotateCcw, Sun, Moon, Monitor, Check, ChevronLeft, Type, Maximize } from 'lucide-react';

/* ────────────────── Token Presets ────────────── */

const COLOR_PRESETS = [
  { name: 'Emerald (Mặc định)', primary: '#0a5f38', accent: '#1b8748' },
  { name: 'Ocean Blue', primary: '#1a56db', accent: '#3b82f6' },
  { name: 'Royal Purple', primary: '#6d28d9', accent: '#7c3aed' },
  { name: 'Crimson', primary: '#b91c1c', accent: '#dc2626' },
  { name: 'Amber', primary: '#92400e', accent: '#d97706' },
  { name: 'Slate', primary: '#334155', accent: '#64748b' },
] as const;

const DENSITY_OPTIONS = [
  { value: 'compact', label: 'Thu gọn', description: 'Padding nhỏ, font size nhỏ hơn' },
  { value: 'default', label: 'Mặc định', description: 'Cân bằng giữa đọc & mật độ' },
  { value: 'comfortable', label: 'Thoải mái', description: 'Padding lớn, dễ đọc hơn' },
] as const;

const RADIUS_OPTIONS = [
  { value: '4px', label: 'Vuông góc' },
  { value: '8px', label: 'Bo nhẹ (Mặc định)' },
  { value: '14px', label: 'Bo tròn' },
  { value: '9999px', label: 'Pill' },
] as const;

const FONT_OPTIONS = [
  { value: "'Inter', sans-serif", label: 'Inter (Mặc định)' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Outfit', sans-serif", label: 'Outfit' },
  { value: "'Be Vietnam Pro', sans-serif", label: 'Be Vietnam Pro' },
  { value: "system-ui, sans-serif", label: 'Hệ thống' },
] as const;

type AppearanceState = {
  primaryColor: string;
  accentColor: string;
  density: string;
  borderRadius: string;
  fontFamily: string;
  mode: 'light' | 'dark' | 'system';
};

const DEFAULT_STATE: AppearanceState = {
  primaryColor: '#0a5f38',
  accentColor: '#1b8748',
  density: 'default',
  borderRadius: '8px',
  fontFamily: "'Inter', sans-serif",
  mode: 'light',
};

/* ────────────────── Component ────────────────── */

export function AppearanceSettings() {
  const [state, setState] = useState<AppearanceState>(DEFAULT_STATE);
  const [saved, setSaved] = useState(false);

  // Apply tokens to root element for live preview
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--primary', state.primaryColor);
    root.style.setProperty('--primary-hover', state.accentColor);
    root.style.setProperty('--radius-md', state.borderRadius);

    if (state.density === 'compact') {
      root.style.setProperty('--space-base', '0.35rem');
    } else if (state.density === 'comfortable') {
      root.style.setProperty('--space-base', '0.65rem');
    } else {
      root.style.removeProperty('--space-base');
    }

    root.style.setProperty('--font-sans', state.fontFamily);
  }, [state]);

  const updateField = useCallback((key: keyof AppearanceState, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const applyPreset = useCallback((preset: typeof COLOR_PRESETS[number]) => {
    setState((prev) => ({
      ...prev,
      primaryColor: preset.primary,
      accentColor: preset.accent,
    }));
    setSaved(false);
  }, []);

  const handleReset = useCallback(() => {
    setState(DEFAULT_STATE);
    setSaved(false);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
      root.style.removeProperty('--radius-md');
      root.style.removeProperty('--space-base');
      root.style.removeProperty('--font-sans');
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/domains/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            primaryColor: state.primaryColor,
            accentColor: state.accentColor,
            density: state.density,
            borderRadius: state.borderRadius,
            fontFamily: state.fontFamily,
            mode: state.mode,
          },
          reason: 'Appearance settings update',
        }),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Silent fail, tokens already applied live
    }
  }, [state]);

  const selectedPreset = useMemo(() => {
    return COLOR_PRESETS.find((p) => p.primary === state.primaryColor) ?? null;
  }, [state.primaryColor]);

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      {/* Header */}
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 1.2rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
          <Link href="/modules/settings" className="btn btn-icon btn-ghost" aria-label="Quay lại cấu hình">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              <Palette size={22} style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
              Giao diện hệ thống
            </h1>
            <p style={{ color: 'var(--muted)', margin: '0.3rem 0 0 0' }}>
              Tùy chỉnh màu sắc, bo góc, mật độ hiển thị, font chữ tên toàn hệ thống.
            </p>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>
        {/* ── Main settings panel ─────────── */}
        <div style={{ display: 'grid', gap: '1rem' }}>

          {/* Color Presets */}
          <section className="appearance-section">
            <h3 className="appearance-section-title">
              <Palette size={16} />
              Bảng màu chủ đạo
            </h3>
            <div className="appearance-preset-grid">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={`appearance-preset-card${selectedPreset?.name === preset.name ? ' is-selected' : ''}`}
                  onClick={() => applyPreset(preset)}
                >
                  <div className="appearance-preset-swatches">
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: preset.primary }} />
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: preset.accent, marginLeft: -6 }} />
                  </div>
                  <span className="appearance-preset-name">{preset.name}</span>
                  {selectedPreset?.name === preset.name && <Check size={14} style={{ color: 'var(--primary)' }} />}
                </button>
              ))}
            </div>
          </section>

          {/* Custom Colors */}
          <section className="appearance-section">
            <h3 className="appearance-section-title">Màu tùy chỉnh</h3>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field">
                <label htmlFor="app-primary-color">Màu chủ đạo (Primary)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    id="app-primary-color-picker"
                    type="color"
                    value={state.primaryColor}
                    onChange={(e) => updateField('primaryColor', e.target.value)}
                    style={{ width: 40, height: 40, padding: 0, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 'var(--radius)' }}
                  />
                  <input
                    id="app-primary-color"
                    type="text"
                    value={state.primaryColor}
                    onChange={(e) => updateField('primaryColor', e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="app-accent-color">Màu nhấn (Accent/Hover)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    id="app-accent-color-picker"
                    type="color"
                    value={state.accentColor}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    style={{ width: 40, height: 40, padding: 0, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 'var(--radius)' }}
                  />
                  <input
                    id="app-accent-color"
                    type="text"
                    value={state.accentColor}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Border Radius */}
          <section className="appearance-section">
            <h3 className="appearance-section-title">
              <Maximize size={16} />
              Bo góc
            </h3>
            <div className="appearance-option-grid">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`appearance-option-card${state.borderRadius === opt.value ? ' is-selected' : ''}`}
                  onClick={() => updateField('borderRadius', opt.value)}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      border: '2px solid var(--primary)',
                      borderRadius: opt.value,
                      background: state.borderRadius === opt.value ? 'color-mix(in srgb, var(--primary) 12%, white)' : 'white',
                    }}
                  />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Density */}
          <section className="appearance-section">
            <h3 className="appearance-section-title">Mật độ hiển thị</h3>
            <div className="appearance-option-grid">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`appearance-option-card${state.density === opt.value ? ' is-selected' : ''}`}
                  onClick={() => updateField('density', opt.value)}
                >
                  <strong>{opt.label}</strong>
                  <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{opt.description}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Font */}
          <section className="appearance-section">
            <h3 className="appearance-section-title">
              <Type size={16} />
              Phông chữ
            </h3>
            <div className="appearance-option-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`appearance-option-card${state.fontFamily === opt.value ? ' is-selected' : ''}`}
                  onClick={() => updateField('fontFamily', opt.value)}
                  style={{ fontFamily: opt.value }}
                >
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aa</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              {saved ? <><Check size={16} /> Đã lưu</> : 'Lưu giao diện'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>
              <RotateCcw size={16} />
              Khôi phục mặc định
            </button>
          </div>
        </div>

        {/* ── Preview sidebar ─────────────── */}
        <aside className="appearance-preview">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.92rem', fontWeight: 700 }}>Xem trước</h3>

          {/* Mini sidebar preview */}
          <div className="appearance-preview-sidebar">
            <div className="appearance-preview-sidebar-item is-active">Dashboard</div>
            <div className="appearance-preview-sidebar-item">CRM</div>
            <div className="appearance-preview-sidebar-item">Bán hàng</div>
            <div className="appearance-preview-sidebar-item">Nhân sự</div>
          </div>

          {/* Mini button preview */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm">+ Thêm mới</button>
            <button type="button" className="btn btn-ghost btn-sm">Hủy</button>
            <button type="button" className="btn btn-danger btn-sm">Xóa</button>
          </div>

          {/* Mini card previews */}
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.85rem' }}>
            <div className="metric-card">
              <h2>Doanh thu tuần</h2>
              <p>42,800,000đ</p>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span className="badge badge-success">Hoàn tất</span>
              <span className="badge badge-warning">Chờ duyệt</span>
              <span className="badge badge-danger">Quá hạn</span>
              <span className="badge badge-neutral">Nháp</span>
            </div>
          </div>

          {/* Mini input preview */}
          <div className="field" style={{ marginTop: '0.85rem' }}>
            <label>Tên khách hàng</label>
            <input type="text" placeholder="Nguyễn Văn A" readOnly />
          </div>

          {/* Token summary */}
          <div style={{ marginTop: '1rem', padding: '0.6rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            <div>--primary: {state.primaryColor}</div>
            <div>--radius-md: {state.borderRadius}</div>
            <div>--density: {state.density}</div>
            <div>--font: {state.fontFamily.split(',')[0]}</div>
          </div>
        </aside>
      </div>
    </article>
  );
}
