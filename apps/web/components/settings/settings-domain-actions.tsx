'use client';

import { REASON_TEMPLATES, type FieldChange } from '../settings-center/domain-config';
import { formatDateTime } from '../settings-center/domain-config';

type SettingsDomainActionsProps = {
  fieldChanges: FieldChange[];
  reasonTemplate: string;
  reasonNote: string;
  onReasonTemplateChange: (value: string) => void;
  onReasonNoteChange: (value: string) => void;
  onValidate: () => void;
  onSave: () => void;
  onTestConnection?: () => void;
  onCreateSnapshot: () => void;
  busy: boolean;
  showTestConnection: boolean;
  error: string | null;
  message: string | null;
  globalValidationErrors: string[];
};

export function SettingsDomainActions({
  fieldChanges,
  reasonTemplate,
  reasonNote,
  onReasonTemplateChange,
  onReasonNoteChange,
  onValidate,
  onSave,
  onTestConnection,
  onCreateSnapshot,
  busy,
  showTestConnection,
  error,
  message,
  globalValidationErrors,
}: SettingsDomainActionsProps) {
  return (
    <>
      {/* ── Diff preview ──────────────────────────── */}
      <section style={{ marginTop: '0.9rem', border: '1px dashed var(--line)', borderRadius: '10px', padding: '0.65rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>Diff preview (ngôn ngữ nghiệp vụ)</strong>
        {fieldChanges.length === 0 ? (
          <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)' }}>Không có thay đổi.</p>
        ) : (
          <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.4rem' }}>
            {fieldChanges.slice(0, 24).map((change) => (
              <article key={change.id} style={{ border: '1px solid #edf2ef', borderRadius: '8px', padding: '0.45rem' }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem' }}>{change.label}</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Từ: {change.before}
                </p>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#1f6b3a' }}>
                  Thành: {change.after}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Reason inputs ─────────────────────────── */}
      <section style={{ marginTop: '0.9rem' }}>
        <div className="field">
          <label htmlFor="reason-template">Lý do thay đổi (bắt buộc)</label>
          <select id="reason-template" value={reasonTemplate} onChange={(event) => onReasonTemplateChange(event.target.value)}>
            {REASON_TEMPLATES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.5rem' }}>
          <label htmlFor="reason-note">Ghi chú thêm</label>
          <input id="reason-note" value={reasonNote} placeholder="Ví dụ: Đóng kỳ 2026-03 theo quyết định phòng tài chính" onChange={(event) => onReasonNoteChange(event.target.value)} />
        </div>
      </section>

      {/* ── Action buttons ────────────────────────── */}
      <div style={{ marginTop: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" className="btn btn-ghost" onClick={onValidate} disabled={busy}>Kiểm tra</button>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>Lưu cấu hình</button>
        {showTestConnection && onTestConnection && (
          <button type="button" className="btn btn-ghost" onClick={onTestConnection} disabled={busy}>Kiểm tra kết nối</button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCreateSnapshot} disabled={busy}>Tạo snapshot</button>
      </div>

      {/* ── Banners ───────────────────────────────── */}
      {globalValidationErrors.length > 0 && (
        <div className="banner banner-warning" style={{ marginTop: '0.85rem' }}>{globalValidationErrors[0]}</div>
      )}
      {error && <div className="banner banner-error" style={{ marginTop: '0.85rem' }}>{error}</div>}
      {message && <div className="banner banner-success" style={{ marginTop: '0.85rem' }}>{message}</div>}
    </>
  );
}
