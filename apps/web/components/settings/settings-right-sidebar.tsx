'use client';

import { DOMAIN_ORDER, type CenterPayload } from '../settings-center/domain-config';
import { formatDateTime } from '../settings-center/domain-config';

type SettingsRightSidebarProps = {
  center: CenterPayload | null;
  role: string | null;
  validationErrors: string[];
  validationWarnings: string[];
  selectedSnapshotId: string;
  onSelectSnapshot: (id: string) => void;
  onRestoreSnapshot: () => void;
  busy: boolean;
};

export function SettingsRightSidebar({
  center,
  role,
  validationErrors,
  validationWarnings,
  selectedSnapshotId,
  onSelectSnapshot,
  onRestoreSnapshot,
  busy,
}: SettingsRightSidebarProps) {
  return (
    <aside className="settings-center-right">
      {/* ── Checklist khởi tạo ─────────────────── */}
      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Checklist khởi tạo</h3>
        <ul style={{ margin: '0.65rem 0 0 1rem' }}>
          <li>Tổ chức: {center?.checklist.org ? 'Hoàn tất' : 'Chờ xử lý'}</li>
          <li>Bảo mật: {center?.checklist.security ? 'Hoàn tất' : 'Chờ xử lý'}</li>
          <li>Tài chính: {center?.checklist.financeControls ? 'Hoàn tất' : 'Chờ xử lý'}</li>
          <li>Tích hợp: {center?.checklist.integrations ? 'Hoàn tất' : 'Chờ xử lý'}</li>
          <li>Chính sách phân hệ: {center?.checklist.modulePolicies ? 'Hoàn tất' : 'Chờ xử lý'}</li>
        </ul>
        <p style={{ margin: '0.65rem 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
          Tiến độ: {center?.summary.validDomains ?? 0}/{center?.summary.totalDomains ?? DOMAIN_ORDER.length} miền cấu hình đạt chuẩn.
        </p>
        <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
          Vai trò hiện tại trên web: {role}
        </p>
      </section>

      {/* ── Kết quả kiểm tra ──────────────────── */}
      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Kết quả kiểm tra</h3>
        <p style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: validationErrors.length === 0 ? '#1b8748' : '#b45309' }}>
          {validationErrors.length === 0 ? 'Không có lỗi validate.' : `${validationErrors.length} lỗi cần xử lý.`}
        </p>
        {validationErrors.length > 0 && (
          <ul style={{ margin: '0.45rem 0 0 1rem', fontSize: '0.78rem' }}>
            {validationErrors.slice(0, 6).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
        {validationWarnings.length > 0 && (
          <>
            <p style={{ marginTop: '0.55rem', fontSize: '0.8rem', color: '#b45309' }}>Cảnh báo:</p>
            <ul style={{ margin: '0.3rem 0 0 1rem', fontSize: '0.78rem' }}>
              {validationWarnings.slice(0, 6).map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── Ảnh chụp cấu hình ─────────────────── */}
      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Ảnh chụp cấu hình</h3>
        <select
          style={{ marginTop: '0.6rem', width: '100%' }}
          value={selectedSnapshotId}
          onChange={(event) => onSelectSnapshot(event.target.value)}
        >
          <option value="">-- Chọn snapshot --</option>
          {(center?.recentSnapshots ?? []).map((snapshot) => {
            const id = String(snapshot.id ?? '');
            return (
              <option key={id} value={id}>
                {id.slice(0, 8)} • {formatDateTime(snapshot.createdAt)}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: '0.6rem', width: '100%' }}
          onClick={onRestoreSnapshot}
          disabled={busy || !selectedSnapshotId}
        >
          Khôi phục snapshot đã chọn
        </button>
      </section>

      {/* ── Audit gần nhất ────────────────────── */}
      <section style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', background: '#fff' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Audit gần nhất</h3>
        <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.55rem', maxHeight: '260px', overflow: 'auto' }}>
          {(center?.recentAudit ?? []).slice(0, 12).map((item) => {
            const id = String(item.id ?? '');
            return (
              <article key={id} style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '0.55rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.78rem' }}>{String(item.domain ?? 'system')}</strong>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{String(item.action ?? '')}</span>
                </div>
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem' }}>{String(item.reason ?? '')}</p>
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {String(item.actor ?? 'system')} • {formatDateTime(item.createdAt)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
