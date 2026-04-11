'use client';

import type { DomainKey } from '../settings-center/domain-config';
import { toRecord, getByPath, statusText, formatDateTime } from '../settings-center/domain-config';
import { ZaloAutomationAiRoutingWorkbench } from '../zalo-automation-ai-routing-workbench';

type SettingsConnectionPanelProps = {
  selectedDomain: DomainKey;
  submissionData: Record<string, unknown>;
  testResult: Record<string, unknown> | null;
  activeTab?: string;
};

export function SettingsConnectionPanel({
  selectedDomain,
  submissionData,
  testResult,
  activeTab,
}: SettingsConnectionPanelProps) {
  const showConnectorPanel = selectedDomain === 'integrations' || selectedDomain === 'search_performance';
  // AI Routing now only renders on its dedicated tab
  const showAiRouting = selectedDomain === 'integrations' && activeTab === 'integration-ai-routing';

  if (!showConnectorPanel && !showAiRouting) return null;

  return (
    <>
      {showConnectorPanel && !showAiRouting && (
        <section style={{ border: '1px dashed var(--line)', borderRadius: '10px', padding: '0.65rem', marginTop: '0.9rem' }}>
          <strong style={{ fontSize: '0.86rem' }}>Trạng thái kết nối</strong>
          {selectedDomain === 'integrations' ? (
            <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
              {['bhtot', 'zalo', 'ai'].map((connector) => {
                const current = toRecord(getByPath(submissionData, connector === 'ai' ? 'ai' : `${connector}`));
                const health = String(current.lastHealthStatus ?? 'UNKNOWN');
                const validatedAt = String(current.lastValidatedAt ?? '');
                return (
                  <div key={connector} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.35rem 0.5rem' }}>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{connector}</span>
                    <span style={{ color: health === 'HEALTHY' ? '#1b8748' : '#d97706' }}>
                      {health === 'HEALTHY' ? 'Kết nối tốt' : 'Cần kiểm tra'}{validatedAt ? ` • ${formatDateTime(validatedAt)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)' }}>
              Trạng thái tìm kiếm: {String(getByPath(submissionData, 'lastHealthStatus') ?? 'UNKNOWN')} • Lần kiểm tra gần nhất: {formatDateTime(getByPath(submissionData, 'lastValidatedAt'))}
            </p>
          )}
          {testResult && (
            <p style={{ margin: '0.55rem 0 0 0', color: '#1b8748', fontSize: '0.84rem' }}>
              {selectedDomain === 'search_performance'
                ? statusText(Boolean(testResult.ok))
                : 'Đã cập nhật trạng thái kết nối từng connector.'}
            </p>
          )}
        </section>
      )}

      {showAiRouting && (
        <section style={{ border: '1px dashed var(--line)', borderRadius: '10px', padding: '0.65rem', marginTop: '0.9rem' }}>
          <strong style={{ fontSize: '0.86rem' }}>AI Routing (Admin)</strong>
          <p style={{ margin: '0.45rem 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Quản trị webhook n8n và bảng chia nick/kênh theo ngành ngay trong Settings Center Enterprise.
          </p>
          <ZaloAutomationAiRoutingWorkbench embedded />
        </section>
      )}
    </>
  );
}

