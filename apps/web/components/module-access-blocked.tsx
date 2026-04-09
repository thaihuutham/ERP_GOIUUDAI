'use client';

import { ShieldAlert } from 'lucide-react';

function toReasonMessage(reason: string, moduleTitle: string) {
  switch (reason) {
    case 'POLICY_LOADING':
      return `Đang nạp chính sách truy cập cho module ${moduleTitle}. Vui lòng chờ vài giây và thử lại.`;
    case 'MODULE_DENIED':
      return `Bạn chưa được cấp quyền truy cập module ${moduleTitle}. Vui lòng liên hệ Admin để được cấp quyền.`;
    case 'MODULE_KEY_INVALID':
      return 'Module không hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra lại điều hướng.';
    default:
      return `Không thể truy cập module ${moduleTitle} ở thời điểm hiện tại.`;
  }
}

export function ModuleAccessBlocked({
  moduleTitle,
  reason
}: {
  moduleTitle: string;
  reason: string;
}) {
  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#6c4a1c', fontWeight: 600 }}>
        <ShieldAlert size={16} />
        Truy cập bị giới hạn
      </div>
      <p className="banner banner-warning" style={{ margin: 0 }}>
        {toReasonMessage(reason, moduleTitle)}
      </p>
    </section>
  );
}
