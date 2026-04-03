'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ASSISTANT_CHANNEL_TYPES,
  ASSISTANT_REPORT_PACKS,
  ASSISTANT_SCOPE_OPTIONS,
  assistantApi,
  type AssistantChannelType,
  type AssistantDispatchChannel,
  type AssistantScopeType
} from '../../lib/assistant-api';
import { apiRequest } from '../../lib/api-client';
import { formatRuntimeDateTime } from '../../lib/runtime-format';
import { formatBulkSummary, runBulkOperation, type BulkExecutionResult, type BulkRowId } from '../../lib/bulk-actions';
import { SidePanel } from '../ui/side-panel';
import { StandardDataTable, type ColumnDefinition, type StandardTableBulkAction } from '../ui/standard-data-table';

type OrgNode = {
  id: string;
  name: string;
  type?: string;
  children?: OrgNode[];
};

type UserOption = {
  id: string;
  email: string;
  role?: string;
  employee?: {
    fullName?: string | null;
  } | null;
};

type TestResult = {
  ok: boolean;
  statusCode: number;
  message: string;
  testedAt: string;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function flattenOrgTree(nodes: OrgNode[], prefix = ''): Array<{ id: string; label: string }> {
  const rows: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    const label = prefix ? `${prefix} / ${node.name}` : node.name;
    rows.push({ id: node.id, label: `${label} (${node.type ?? 'ORG'})` });
    rows.push(...flattenOrgTree(node.children ?? [], label));
  }
  return rows;
}

function reportPackMap(defaultValue = true) {
  return ASSISTANT_REPORT_PACKS.reduce<Record<string, boolean>>((acc, pack) => {
    acc[pack] = defaultValue;
    return acc;
  }, {});
}

export function AssistantChannelsBoard() {
  const [channels, setChannels] = useState<AssistantDispatchChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingPickers, setLoadingPickers] = useState(true);

  const [channelFilterQ, setChannelFilterQ] = useState('');
  const [channelFilterType, setChannelFilterType] = useState('');
  const [channelFilterScope, setChannelFilterScope] = useState('');
  const [channelFilterActive, setChannelFilterActive] = useState('');

  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; label: string }>>([]);

  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<BulkRowId[]>([]);

  const [createBusy, setCreateBusy] = useState(false);
  const [testBusyChannelId, setTestBusyChannelId] = useState('');
  const [lastTestMap, setLastTestMap] = useState<Record<string, TestResult>>({});

  const [createName, setCreateName] = useState('');
  const [createChannelType, setCreateChannelType] = useState<AssistantChannelType>('WEBHOOK');
  const [createEndpointUrl, setCreateEndpointUrl] = useState('');
  const [createWebhookSecretRef, setCreateWebhookSecretRef] = useState('');
  const [createScopeType, setCreateScopeType] = useState<AssistantScopeType>('department');
  const [createScopeRefs, setCreateScopeRefs] = useState<string[]>([]);
  const [createReportPackMap, setCreateReportPackMap] = useState<Record<string, boolean>>(reportPackMap(true));
  const [createIsActive, setCreateIsActive] = useState(true);

  const [selectedChannel, setSelectedChannel] = useState<AssistantDispatchChannel | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editChannelType, setEditChannelType] = useState<AssistantChannelType>('WEBHOOK');
  const [editEndpointUrl, setEditEndpointUrl] = useState('');
  const [editWebhookSecretRef, setEditWebhookSecretRef] = useState('');
  const [editScopeType, setEditScopeType] = useState<AssistantScopeType>('department');
  const [editScopeRefs, setEditScopeRefs] = useState<string[]>([]);
  const [editReportPackMap, setEditReportPackMap] = useState<Record<string, boolean>>(reportPackMap(false));
  const [editIsActive, setEditIsActive] = useState(true);

  const scopeRefOptions = useMemo(
    () => [...orgOptions, ...userOptions].sort((a, b) => a.label.localeCompare(b.label)),
    [orgOptions, userOptions]
  );

  const loadPickerOptions = async () => {
    setLoadingPickers(true);
    try {
      const [orgPayload, usersPayload] = await Promise.all([
        apiRequest<{ tree?: OrgNode[] }>('/settings/organization/tree'),
        apiRequest<{ items?: UserOption[] }>('/settings/iam/users', { query: { limit: 300 } })
      ]);

      setOrgOptions(flattenOrgTree(orgPayload.tree ?? []));
      setUserOptions(
        (usersPayload.items ?? []).map((user) => ({
          id: user.id,
          label: `${user.employee?.fullName || user.email} (${user.role ?? 'USER'})`
        }))
      );
    } catch {
      setOrgOptions([]);
      setUserOptions([]);
    } finally {
      setLoadingPickers(false);
    }
  };

  const loadChannels = async () => {
    setLoadingChannels(true);
    setFeedbackError(null);
    try {
      const payload = await assistantApi.listChannels({
        q: channelFilterQ || undefined,
        channelType: (channelFilterType || undefined) as AssistantChannelType | undefined,
        scopeType: (channelFilterScope || undefined) as AssistantScopeType | undefined,
        isActive:
          channelFilterActive === ''
            ? undefined
            : channelFilterActive === 'true',
        limit: 100
      });
      setChannels(payload.items ?? []);
    } catch (error) {
      setChannels([]);
      setFeedbackError(error instanceof Error ? error.message : 'Không thể tải danh sách kênh phân phối.');
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadChannels(), loadPickerOptions()]);
  }, []);

  const onCreateChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusy) {
      return;
    }
    if (!createName.trim() || !createEndpointUrl.trim()) {
      setFeedbackError('Tên kênh và URL đích là bắt buộc.');
      return;
    }

    setCreateBusy(true);
    setFeedbackError(null);
    setFeedbackMessage(null);
    try {
      const allowedReportPacks = ASSISTANT_REPORT_PACKS.filter((pack) => createReportPackMap[pack]);
      await assistantApi.createChannel({
        name: createName.trim(),
        channelType: createChannelType,
        endpointUrl: createEndpointUrl.trim(),
        webhookSecretRef: createWebhookSecretRef.trim() || undefined,
        scopeType: createScopeType,
        scopeRefIds: createScopeRefs,
        allowedReportPacks,
        isActive: createIsActive
      });
      setFeedbackMessage('Tạo kênh phân phối thành công.');
      await loadChannels();
      setCreateName('');
      setCreateEndpointUrl('');
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Không thể tạo kênh phân phối.');
    } finally {
      setCreateBusy(false);
    }
  };

  const openEditPanel = (channel: AssistantDispatchChannel) => {
    setSelectedChannel(channel);
    setEditName(channel.name);
    setEditChannelType(channel.channelType);
    setEditEndpointUrl(channel.endpointUrl);
    setEditWebhookSecretRef(channel.webhookSecretRef || '');
    setEditScopeType(channel.scopeType);
    setEditScopeRefs(channel.scopeRefIds ?? []);
    setEditIsActive(Boolean(channel.isActive));

    const map = reportPackMap(false);
    for (const pack of channel.allowedReportPacks ?? []) {
      map[pack] = true;
    }
    setEditReportPackMap(map);
  };

  const onUpdateChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedChannel || editBusy) {
      return;
    }

    setEditBusy(true);
    setFeedbackError(null);
    setFeedbackMessage(null);
    try {
      await assistantApi.updateChannel(selectedChannel.id, {
        name: editName.trim(),
        channelType: editChannelType,
        endpointUrl: editEndpointUrl.trim(),
        webhookSecretRef: editWebhookSecretRef.trim() || undefined,
        scopeType: editScopeType,
        scopeRefIds: editScopeRefs,
        allowedReportPacks: ASSISTANT_REPORT_PACKS.filter((pack) => editReportPackMap[pack]),
        isActive: editIsActive
      });
      setFeedbackMessage('Cập nhật kênh phân phối thành công.');
      await loadChannels();
      setSelectedChannel(null);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Không thể cập nhật kênh phân phối.');
    } finally {
      setEditBusy(false);
    }
  };

  const onTestChannel = async (channelId: string) => {
    if (testBusyChannelId) {
      return;
    }

    setTestBusyChannelId(channelId);
    setFeedbackError(null);
    setFeedbackMessage(null);
    try {
      const response = await assistantApi.testChannel(channelId);
      const testedAt = new Date().toISOString();
      setLastTestMap((prev) => ({
        ...prev,
        [channelId]: {
          ok: response.ok,
          statusCode: response.statusCode,
          message: response.message,
          testedAt
        }
      }));
      setFeedbackMessage(
        `Kiểm tra kênh ${channelId}: ${response.ok ? 'THÀNH CÔNG' : 'THẤT BẠI'} (status=${response.statusCode}, message=${response.message}).`
      );
      await loadChannels();
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Không thể kiểm tra kênh phân phối.');
    } finally {
      setTestBusyChannelId('');
    }
  };

  const channelColumns = useMemo<ColumnDefinition<AssistantDispatchChannel>[]>(
    () => [
      { key: 'name', label: 'Tên kênh', render: (row) => row.name, isLink: true },
      { key: 'channelType', label: 'Loại kênh', render: (row) => row.channelType },
      { key: 'scopeType', label: 'Phạm vi', render: (row) => row.scopeType },
      { key: 'isActive', label: 'Trạng thái', render: (row) => (row.isActive ? 'Bật' : 'Tắt') },
      { key: 'lastTestedAt', label: 'Lần kiểm tra gần nhất', render: (row) => formatDateTime(row.lastTestedAt) },
      {
        key: 'testNow',
        label: 'Kiểm tra',
        render: (row) => (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }}
            onClick={() => void onTestChannel(row.id)}
            disabled={Boolean(testBusyChannelId)}
          >
            Kiểm tra
          </button>
        )
      }
    ],
    [testBusyChannelId]
  );

  const runChannelBulkAction = async (
    actionLabel: string,
    selectedRows: AssistantDispatchChannel[],
    execute: (channel: AssistantDispatchChannel) => Promise<void>
  ): Promise<BulkExecutionResult> => {
    if (selectedRows.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        failedIds: [],
        failures: [],
        actionLabel,
        message: `${actionLabel}: không có kênh nào được chọn.`
      };
    }

    const rowsById = new Map<string, AssistantDispatchChannel>();
    selectedRows.forEach((row) => rowsById.set(row.id, row));

    const result = await runBulkOperation({
      ids: selectedRows.map((row) => row.id),
      continueOnError: true,
      chunkSize: 10,
      execute: async (channelId) => {
        const row = rowsById.get(String(channelId));
        if (!row) {
          throw new Error(`Không tìm thấy kênh ${channelId}.`);
        }
        await execute(row);
      }
    });

    const normalized: BulkExecutionResult = {
      ...result,
      actionLabel,
      message: formatBulkSummary(
        {
          ...result,
          actionLabel
        },
        actionLabel
      )
    };

    if (normalized.successCount > 0) {
      await loadChannels();
    }
    setFeedbackMessage(normalized.message ?? null);
    if (normalized.failedCount > 0) {
      setFeedbackError(`Một số kênh lỗi khi thực hiện "${actionLabel}".`);
    } else {
      setFeedbackError(null);
    }
    return normalized;
  };

  const bulkActions: StandardTableBulkAction<AssistantDispatchChannel>[] = [
    {
      key: 'bulk-activate-channels',
      label: 'Kích hoạt',
      tone: 'primary',
      execute: async (selectedRows) =>
        runChannelBulkAction('Kích hoạt kênh', selectedRows, async (channel) => {
          await assistantApi.updateChannel(channel.id, { isActive: true });
        })
    },
    {
      key: 'bulk-deactivate-channels',
      label: 'Tạm dừng',
      tone: 'danger',
      confirmMessage: (rows) => `Tạm dừng ${rows.length} kênh đã chọn?`,
      execute: async (selectedRows) =>
        runChannelBulkAction('Vô hiệu hóa kênh', selectedRows, async (channel) => {
          await assistantApi.updateChannel(channel.id, { isActive: false });
        })
    },
    {
      key: 'bulk-test-channels',
      label: 'Kiểm tra',
      tone: 'ghost',
      execute: async (selectedRows) => {
        const nextLastTestMap: Record<string, TestResult> = {};
        const result = await runChannelBulkAction('Kiểm tra kênh', selectedRows, async (channel) => {
          const response = await assistantApi.testChannel(channel.id);
          nextLastTestMap[channel.id] = {
            ok: response.ok,
            statusCode: response.statusCode,
            message: response.message,
            testedAt: new Date().toISOString()
          };
        });
        if (Object.keys(nextLastTestMap).length > 0) {
          setLastTestMap((prev) => ({
            ...prev,
            ...nextLastTestMap
          }));
        }
        return result;
      }
    }
  ];

  return (
    <section className="feature-panel" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.06rem', marginBottom: '0.2rem' }}>Kênh phân phối quản trị</h2>
          <p className="muted">Quản lý kênh gửi báo cáo và trạng thái kiểm tra kết nối.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadChannels()} disabled={loadingChannels}>
          Làm mới
        </button>
      </div>

      {feedbackMessage && <p className="banner banner-success">{feedbackMessage}</p>}
      {feedbackError && <p className="banner banner-error">{feedbackError}</p>}

      <form
        onSubmit={onCreateChannel}
        style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'grid', gap: '0.65rem' }}
      >
        <h3 style={{ fontSize: '0.98rem' }}>Tạo kênh mới</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Tên kênh
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </label>
          <label>
            Loại kênh
            <select
              value={createChannelType}
              onChange={(event) => setCreateChannelType(event.target.value as AssistantChannelType)}
            >
              {ASSISTANT_CHANNEL_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi
            <select
              value={createScopeType}
              onChange={(event) => setCreateScopeType(event.target.value as AssistantScopeType)}
            >
              {ASSISTANT_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            URL đích
            <input
              value={createEndpointUrl}
              onChange={(event) => setCreateEndpointUrl(event.target.value)}
              placeholder="https://hooks.company.vn/assistant"
            />
          </label>
          <label>
            Tham chiếu mã bí mật webhook
            <input
              value={createWebhookSecretRef}
              onChange={(event) => setCreateWebhookSecretRef(event.target.value)}
              placeholder="ASSISTANT_WEBHOOK_SECRET"
            />
          </label>
        </div>

        <label>
          Phạm vi áp dụng (chọn nhiều)
          <select
            multiple
            size={Math.min(8, Math.max(4, scopeRefOptions.length || 4))}
            value={createScopeRefs}
            onChange={(event) =>
              setCreateScopeRefs(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            disabled={loadingPickers}
          >
            {scopeRefOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset style={{ border: '1px solid #d9eadf', borderRadius: '8px', padding: '0.55rem' }}>
          <legend style={{ fontSize: '0.82rem', padding: '0 0.3rem' }}>Gói báo cáo được phép</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '0.4rem' }}>
            {ASSISTANT_REPORT_PACKS.map((pack) => (
              <label key={pack} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(createReportPackMap[pack])}
                  onChange={(event) =>
                    setCreateReportPackMap((prev) => ({
                      ...prev,
                      [pack]: event.target.checked
                    }))
                  }
                />
                <span>{pack}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
          <input type="checkbox" checked={createIsActive} onChange={(event) => setCreateIsActive(event.target.checked)} />
          <span>Kích hoạt kênh</span>
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={createBusy}>
            {createBusy ? 'Đang tạo...' : 'Tạo kênh'}
          </button>
        </div>
      </form>

      <section style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'grid', gap: '0.65rem' }}>
        <h3 style={{ fontSize: '0.98rem' }}>Danh sách kênh</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: '0.55rem' }}>
          <label>
            Tìm kiếm
            <input value={channelFilterQ} onChange={(event) => setChannelFilterQ(event.target.value)} />
          </label>
          <label>
            Loại kênh
            <select value={channelFilterType} onChange={(event) => setChannelFilterType(event.target.value)}>
              <option value="">Tất cả</option>
              {ASSISTANT_CHANNEL_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi
            <select value={channelFilterScope} onChange={(event) => setChannelFilterScope(event.target.value)}>
              <option value="">Tất cả</option>
              {ASSISTANT_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select value={channelFilterActive} onChange={(event) => setChannelFilterActive(event.target.value)}>
              <option value="">Tất cả</option>
              <option value="true">Bật</option>
              <option value="false">Tắt</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => void loadChannels()}>
              Lọc kênh
            </button>
          </div>
        </div>

        <StandardDataTable
          data={channels}
          columns={channelColumns}
          storageKey="assistant-channels-table-v1"
          isLoading={loadingChannels}
          onRowClick={(row) => openEditPanel(row)}
          enableRowSelection
          selectedRowIds={selectedRowIds}
          onSelectedRowIdsChange={setSelectedRowIds}
          bulkActions={bulkActions}
          showDefaultBulkUtilities
        />

        {!loadingChannels && channels.length === 0 && (
          <p className="banner banner-warning" style={{ margin: 0 }}>
            Chưa có kênh nào. Tạo kênh đầu tiên để mở luồng phân phối báo cáo.
          </p>
        )}
      </section>

      <SidePanel
        isOpen={Boolean(selectedChannel)}
        onClose={() => setSelectedChannel(null)}
        title="Cập nhật kênh phân phối"
      >
        {selectedChannel && (
          <form onSubmit={onUpdateChannel} style={{ display: 'grid', gap: '0.65rem' }}>
            <label>
              Tên kênh
              <input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </label>
            <label>
              Loại kênh
              <select
                value={editChannelType}
                onChange={(event) => setEditChannelType(event.target.value as AssistantChannelType)}
              >
                {ASSISTANT_CHANNEL_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phạm vi
              <select
                value={editScopeType}
                onChange={(event) => setEditScopeType(event.target.value as AssistantScopeType)}
              >
                {ASSISTANT_SCOPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              URL đích
              <input value={editEndpointUrl} onChange={(event) => setEditEndpointUrl(event.target.value)} />
            </label>
            <label>
              Tham chiếu mã bí mật webhook
              <input
                value={editWebhookSecretRef}
                onChange={(event) => setEditWebhookSecretRef(event.target.value)}
              />
            </label>

            <label>
              Phạm vi áp dụng (chọn nhiều)
              <select
                multiple
                size={Math.min(8, Math.max(4, scopeRefOptions.length || 4))}
                value={editScopeRefs}
                onChange={(event) =>
                  setEditScopeRefs(Array.from(event.target.selectedOptions).map((option) => option.value))
                }
              >
                {scopeRefOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset style={{ border: '1px solid #d9eadf', borderRadius: '8px', padding: '0.55rem' }}>
              <legend style={{ fontSize: '0.82rem', padding: '0 0.3rem' }}>Gói báo cáo được phép</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.4rem' }}>
                {ASSISTANT_REPORT_PACKS.map((pack) => (
                  <label key={pack} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editReportPackMap[pack])}
                      onChange={(event) =>
                        setEditReportPackMap((prev) => ({
                          ...prev,
                          [pack]: event.target.checked
                        }))
                      }
                    />
                    <span>{pack}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
              <input type="checkbox" checked={editIsActive} onChange={(event) => setEditIsActive(event.target.checked)} />
              <span>Kích hoạt kênh</span>
            </label>

            <dl className="kv-grid">
              <div className="kv-item">
                <dt>Lần kiểm tra (hệ thống)</dt>
                <dd>{formatDateTime(selectedChannel.lastTestedAt)}</dd>
              </div>
              <div className="kv-item">
                <dt>Lần kiểm tra (giao diện)</dt>
                <dd>{formatDateTime(lastTestMap[selectedChannel.id]?.testedAt)}</dd>
              </div>
              <div className="kv-item">
                <dt>Kết quả kiểm tra</dt>
                <dd>
                  {lastTestMap[selectedChannel.id]
                    ? `${lastTestMap[selectedChannel.id]?.ok ? 'THÀNH CÔNG' : 'THẤT BẠI'} (${lastTestMap[selectedChannel.id]?.statusCode})`
                    : '--'}
                </dd>
              </div>
            </dl>

            {lastTestMap[selectedChannel.id] && (
              <p className={`banner ${lastTestMap[selectedChannel.id]?.ok ? 'banner-success' : 'banner-error'}`}>
                {lastTestMap[selectedChannel.id]?.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={editBusy}>
                {editBusy ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onTestChannel(selectedChannel.id)}
                disabled={Boolean(testBusyChannelId)}
              >
                {testBusyChannelId ? 'Đang kiểm tra...' : 'Kiểm tra kênh'}
              </button>
            </div>
          </form>
        )}
      </SidePanel>
    </section>
  );
}
