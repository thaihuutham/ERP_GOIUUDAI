'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useAccessPolicy } from './access-policy-context';
import { Badge, statusToBadge } from './ui';

type ConversationChannel = 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK' | 'OTHER';
type AiRoutingMode = 'legacy' | 'n8n' | 'shadow';

type RuntimeDomainPayload = {
  data?: Record<string, unknown>;
};

type IndustryRow = {
  id: string;
  industryKey: string;
  name: string;
  description?: string | null;
  knowledgeSpaceRef?: string | null;
  piiMaskEnabled?: boolean | null;
  isActive?: boolean | null;
  updatedAt?: string | null;
};

type ChannelMappingRow = {
  id: string;
  channel: ConversationChannel;
  channelAccountId: string;
  industryId: string;
  isActive?: boolean | null;
  updatedAt?: string | null;
  industry?: {
    id?: string;
    industryKey?: string;
    name?: string;
    isActive?: boolean;
  } | null;
};

type IndustryBindingRow = {
  id: string;
  industryId: string;
  workflowKey: string;
  agentKey?: string | null;
  webhookPath?: string | null;
  isActive?: boolean | null;
  updatedAt?: string | null;
  industry?: {
    id?: string;
    industryKey?: string;
    name?: string;
    isActive?: boolean;
  } | null;
};

type ZaloAccount = {
  id: string;
  displayName?: string | null;
  zaloUid?: string | null;
  accountType?: 'PERSONAL' | 'OA' | null;
  status?: string | null;
};

type RuntimeForm = {
  mode: AiRoutingMode;
  chatEventsUrl: string;
  outboundHmacSecret: string;
  callbackHmacSecret: string;
  debounceSeconds: string;
  dispatchTimeoutMs: string;
  maxRetryAttempts: string;
  retryBackoffSeconds: string;
};

type IndustryForm = {
  industryKey: string;
  name: string;
  description: string;
  knowledgeSpaceRef: string;
  piiMaskEnabled: boolean;
  isActive: boolean;
};

type ChannelMappingForm = {
  channel: ConversationChannel;
  channelAccountId: string;
  industryId: string;
  isActive: boolean;
};

type IndustryBindingForm = {
  industryId: string;
  workflowKey: string;
  agentKey: string;
  webhookPath: string;
  isActive: boolean;
};

type ZaloAutomationAiRoutingWorkbenchProps = {
  embedded?: boolean;
};

const CHANNEL_OPTIONS: ConversationChannel[] = ['ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'OTHER'];
const ROUTING_MODE_OPTIONS: AiRoutingMode[] = ['legacy', 'n8n', 'shadow'];

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  ZALO_PERSONAL: 'Zalo cá nhân',
  ZALO_OA: 'Zalo OA',
  FACEBOOK: 'Facebook',
  OTHER: 'Kênh khác'
};

function cleanString(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function toInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return Math.round(parsed);
}

function toDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatRuntimeDateTime(parsed.toISOString());
}

function routeStatusLabel(enabled: boolean | null | undefined) {
  return enabled ? 'ACTIVE' : 'INACTIVE';
}

function normalizeMode(value: unknown): AiRoutingMode {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'n8n' || normalized === 'shadow') {
    return normalized;
  }
  return 'legacy';
}

function accountMatchesChannel(account: ZaloAccount, channel: ConversationChannel) {
  if (channel === 'ZALO_PERSONAL') {
    return account.accountType === 'PERSONAL';
  }
  if (channel === 'ZALO_OA') {
    return account.accountType === 'OA';
  }
  return true;
}

function accountLabel(account: ZaloAccount) {
  const base = cleanString(account.displayName) || cleanString(account.zaloUid) || account.id;
  const suffix = cleanString(account.accountType);
  return suffix ? `${base} (${suffix})` : base;
}

export function ZaloAutomationAiRoutingWorkbench({ embedded = false }: ZaloAutomationAiRoutingWorkbenchProps) {
  const { canModule, canAction } = useAccessPolicy();
  const canView = canModule('settings');
  const canCreate = canAction('settings', 'CREATE');
  const canUpdate = canAction('settings', 'UPDATE');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [isLoadingRuntime, setIsLoadingRuntime] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [isLoadingIndustries, setIsLoadingIndustries] = useState(false);
  const [isSavingIndustry, setIsSavingIndustry] = useState(false);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [isLoadingBindings, setIsLoadingBindings] = useState(false);
  const [isSavingBinding, setIsSavingBinding] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  const [runtimeForm, setRuntimeForm] = useState<RuntimeForm>({
    mode: 'legacy',
    chatEventsUrl: '',
    outboundHmacSecret: '',
    callbackHmacSecret: '',
    debounceSeconds: '8',
    dispatchTimeoutMs: '25000',
    maxRetryAttempts: '3',
    retryBackoffSeconds: '10,30,90'
  });

  const [industryForm, setIndustryForm] = useState<IndustryForm>({
    industryKey: '',
    name: '',
    description: '',
    knowledgeSpaceRef: '',
    piiMaskEnabled: true,
    isActive: true
  });
  const [editingIndustryId, setEditingIndustryId] = useState('');

  const [mappingForm, setMappingForm] = useState<ChannelMappingForm>({
    channel: 'ZALO_PERSONAL',
    channelAccountId: '',
    industryId: '',
    isActive: true
  });
  const [editingMappingId, setEditingMappingId] = useState('');

  const [bindingForm, setBindingForm] = useState<IndustryBindingForm>({
    industryId: '',
    workflowKey: '',
    agentKey: '',
    webhookPath: '',
    isActive: true
  });
  const [editingBindingId, setEditingBindingId] = useState('');

  const [industries, setIndustries] = useState<IndustryRow[]>([]);
  const [channelMappings, setChannelMappings] = useState<ChannelMappingRow[]>([]);
  const [industryBindings, setIndustryBindings] = useState<IndustryBindingRow[]>([]);
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);

  const [industryQuery, setIndustryQuery] = useState('');
  const [mappingQuery, setMappingQuery] = useState('');
  const [bindingQuery, setBindingQuery] = useState('');

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const resetIndustryForm = () => {
    setEditingIndustryId('');
    setIndustryForm({
      industryKey: '',
      name: '',
      description: '',
      knowledgeSpaceRef: '',
      piiMaskEnabled: true,
      isActive: true
    });
  };

  const resetMappingForm = () => {
    setEditingMappingId('');
    setMappingForm({
      channel: 'ZALO_PERSONAL',
      channelAccountId: '',
      industryId: '',
      isActive: true
    });
  };

  const resetBindingForm = () => {
    setEditingBindingId('');
    setBindingForm({
      industryId: '',
      workflowKey: '',
      agentKey: '',
      webhookPath: '',
      isActive: true
    });
  };

  const loadRuntimeConfig = async () => {
    setIsLoadingRuntime(true);
    try {
      const payload = await apiRequest<RuntimeDomainPayload>('/settings/domains/integrations');
      const data = toRecord(payload?.data);
      const aiRouting = toRecord(data.aiRouting);
      setRuntimeForm({
        mode: normalizeMode(aiRouting.mode),
        chatEventsUrl: cleanString(aiRouting.chatEventsUrl),
        outboundHmacSecret: cleanString(aiRouting.outboundHmacSecret),
        callbackHmacSecret: cleanString(aiRouting.callbackHmacSecret),
        debounceSeconds: String(toInt(aiRouting.debounceSeconds, 8, 1, 120)),
        dispatchTimeoutMs: String(toInt(aiRouting.dispatchTimeoutMs, 25000, 1000, 120000)),
        maxRetryAttempts: String(toInt(aiRouting.maxRetryAttempts, 3, 1, 10)),
        retryBackoffSeconds: cleanString(aiRouting.retryBackoffSeconds) || '10,30,90'
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được runtime cấu hình n8n.');
    } finally {
      setIsLoadingRuntime(false);
    }
  };

  const loadIndustries = async (keyword = industryQuery) => {
    setIsLoadingIndustries(true);
    try {
      const payload = await apiRequest<{ items?: IndustryRow[] }>('/ai-industries', {
        query: {
          limit: 100,
          q: cleanString(keyword) || undefined
        }
      });
      const rows = normalizeListPayload(payload) as IndustryRow[];
      setIndustries(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách ngành.');
    } finally {
      setIsLoadingIndustries(false);
    }
  };

  const loadChannelMappings = async (keyword = mappingQuery) => {
    setIsLoadingMappings(true);
    try {
      const payload = await apiRequest<{ items?: ChannelMappingRow[] }>('/ai-routing/channel-accounts', {
        query: {
          limit: 100,
          q: cleanString(keyword) || undefined
        }
      });
      const rows = normalizeListPayload(payload) as ChannelMappingRow[];
      setChannelMappings(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được bảng phân nick/kênh theo ngành.');
    } finally {
      setIsLoadingMappings(false);
    }
  };

  const loadIndustryBindings = async (keyword = bindingQuery) => {
    setIsLoadingBindings(true);
    try {
      const payload = await apiRequest<{ items?: IndustryBindingRow[] }>('/ai-routing/industry-bindings', {
        query: {
          limit: 100,
          q: cleanString(keyword) || undefined
        }
      });
      const rows = normalizeListPayload(payload) as IndustryBindingRow[];
      setIndustryBindings(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được bảng ràng buộc ngành/workflow.');
    } finally {
      setIsLoadingBindings(false);
    }
  };

  const loadAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: { accountType: 'ALL' }
      });
      const rows = normalizeListPayload(payload) as ZaloAccount[];
      setAccounts(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách tài khoản Zalo.');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const refreshAll = async () => {
    clearNotice();
    await Promise.all([
      loadRuntimeConfig(),
      loadIndustries(),
      loadChannelMappings(),
      loadIndustryBindings(),
      loadAccounts()
    ]);
  };

  useEffect(() => {
    if (!canView) {
      return;
    }
    void refreshAll();
  }, [canView]);

  const accountOptions = useMemo(
    () => accounts.filter((account) => accountMatchesChannel(account, mappingForm.channel)),
    [accounts, mappingForm.channel]
  );

  const onSaveRuntimeConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật cấu hình.');
      return;
    }

    const retryBackoff = cleanString(runtimeForm.retryBackoffSeconds) || '10,30,90';

    setIsSavingRuntime(true);
    try {
      await apiRequest('/settings/domains/integrations', {
        method: 'PUT',
        body: {
          reason: 'Update AI routing runtime from Settings Center Enterprise',
          aiRouting: {
            mode: runtimeForm.mode,
            chatEventsUrl: cleanString(runtimeForm.chatEventsUrl),
            outboundHmacSecret: cleanString(runtimeForm.outboundHmacSecret),
            callbackHmacSecret: cleanString(runtimeForm.callbackHmacSecret),
            debounceSeconds: toInt(runtimeForm.debounceSeconds, 8, 1, 120),
            dispatchTimeoutMs: toInt(runtimeForm.dispatchTimeoutMs, 25000, 1000, 120000),
            maxRetryAttempts: toInt(runtimeForm.maxRetryAttempts, 3, 1, 10),
            retryBackoffSeconds: retryBackoff
          }
        }
      });
      setResultMessage('Đã lưu runtime webhook n8n thành công.');
      await loadRuntimeConfig();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu runtime webhook n8n.');
    } finally {
      setIsSavingRuntime(false);
    }
  };

  const onSubmitIndustry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate && !canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cấu hình ngành.');
      return;
    }

    if (!cleanString(industryForm.name)) {
      setErrorMessage('Tên ngành không được để trống.');
      return;
    }

    if (!editingIndustryId && !cleanString(industryForm.industryKey)) {
      setErrorMessage('Industry key không được để trống khi tạo mới.');
      return;
    }

    setIsSavingIndustry(true);
    try {
      const payload = {
        industryKey: cleanString(industryForm.industryKey) || undefined,
        name: cleanString(industryForm.name),
        description: cleanString(industryForm.description) || undefined,
        knowledgeSpaceRef: cleanString(industryForm.knowledgeSpaceRef) || undefined,
        piiMaskEnabled: Boolean(industryForm.piiMaskEnabled),
        isActive: Boolean(industryForm.isActive)
      };

      if (editingIndustryId) {
        await apiRequest(`/ai-industries/${editingIndustryId}`, {
          method: 'PATCH',
          body: payload
        });
        setResultMessage('Đã cập nhật ngành AI thành công.');
      } else {
        await apiRequest('/ai-industries', {
          method: 'POST',
          body: payload
        });
        setResultMessage('Đã tạo ngành AI thành công.');
      }

      resetIndustryForm();
      await Promise.all([loadIndustries(), loadChannelMappings(), loadIndustryBindings()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu thông tin ngành.');
    } finally {
      setIsSavingIndustry(false);
    }
  };

  const onEditIndustry = (industry: IndustryRow) => {
    setEditingIndustryId(industry.id);
    setIndustryForm({
      industryKey: cleanString(industry.industryKey),
      name: cleanString(industry.name),
      description: cleanString(industry.description),
      knowledgeSpaceRef: cleanString(industry.knowledgeSpaceRef),
      piiMaskEnabled: toBool(industry.piiMaskEnabled, true),
      isActive: toBool(industry.isActive, true)
    });
  };

  const onToggleIndustryActive = async (industry: IndustryRow, isActive: boolean) => {
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật trạng thái ngành.');
      return;
    }

    try {
      await apiRequest(`/ai-industries/${industry.id}`, {
        method: 'PATCH',
        body: {
          isActive
        }
      });
      setResultMessage(`Đã ${isActive ? 'bật' : 'tắt'} ngành ${industry.name}.`);
      await Promise.all([loadIndustries(), loadChannelMappings(), loadIndustryBindings()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái ngành.');
    }
  };

  const onSubmitMapping = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate && !canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật mapping nick/kênh.');
      return;
    }

    const channelAccountId = cleanString(mappingForm.channelAccountId);
    if (!channelAccountId) {
      setErrorMessage('Channel account ID không được để trống.');
      return;
    }
    if (!mappingForm.industryId) {
      setErrorMessage('Vui lòng chọn ngành cho nick/kênh.');
      return;
    }

    setIsSavingMapping(true);
    try {
      const payload = {
        channel: mappingForm.channel,
        channelAccountId,
        industryId: mappingForm.industryId,
        isActive: Boolean(mappingForm.isActive)
      };

      if (editingMappingId) {
        await apiRequest(`/ai-routing/channel-accounts/${editingMappingId}`, {
          method: 'PATCH',
          body: payload
        });
        setResultMessage('Đã cập nhật mapping nick/kênh theo ngành.');
      } else {
        await apiRequest('/ai-routing/channel-accounts', {
          method: 'POST',
          body: payload
        });
        setResultMessage('Đã tạo mapping nick/kênh theo ngành.');
      }

      resetMappingForm();
      await loadChannelMappings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu mapping nick/kênh.');
    } finally {
      setIsSavingMapping(false);
    }
  };

  const onEditMapping = (mapping: ChannelMappingRow) => {
    setEditingMappingId(mapping.id);
    setMappingForm({
      channel: mapping.channel,
      channelAccountId: cleanString(mapping.channelAccountId),
      industryId: cleanString(mapping.industry?.id) || mapping.industryId,
      isActive: toBool(mapping.isActive, true)
    });
  };

  const onToggleMappingActive = async (mapping: ChannelMappingRow, isActive: boolean) => {
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật trạng thái mapping.');
      return;
    }

    try {
      await apiRequest(`/ai-routing/channel-accounts/${mapping.id}`, {
        method: 'PATCH',
        body: {
          isActive
        }
      });
      setResultMessage(`Đã ${isActive ? 'bật' : 'tắt'} mapping ${mapping.channelAccountId}.`);
      await loadChannelMappings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái mapping.');
    }
  };

  const onSubmitBinding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate && !canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật binding ngành/workflow.');
      return;
    }

    if (!bindingForm.industryId) {
      setErrorMessage('Vui lòng chọn ngành.');
      return;
    }
    if (!cleanString(bindingForm.workflowKey)) {
      setErrorMessage('Workflow key không được để trống.');
      return;
    }

    setIsSavingBinding(true);
    try {
      const payload = {
        industryId: bindingForm.industryId,
        workflowKey: cleanString(bindingForm.workflowKey),
        agentKey: cleanString(bindingForm.agentKey) || undefined,
        webhookPath: cleanString(bindingForm.webhookPath) || undefined,
        isActive: Boolean(bindingForm.isActive)
      };

      if (editingBindingId) {
        await apiRequest(`/ai-routing/industry-bindings/${editingBindingId}`, {
          method: 'PATCH',
          body: payload
        });
        setResultMessage('Đã cập nhật binding ngành/workflow.');
      } else {
        await apiRequest('/ai-routing/industry-bindings', {
          method: 'POST',
          body: payload
        });
        setResultMessage('Đã tạo binding ngành/workflow.');
      }

      resetBindingForm();
      await loadIndustryBindings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu binding ngành/workflow.');
    } finally {
      setIsSavingBinding(false);
    }
  };

  const onEditBinding = (binding: IndustryBindingRow) => {
    setEditingBindingId(binding.id);
    setBindingForm({
      industryId: cleanString(binding.industry?.id) || binding.industryId,
      workflowKey: cleanString(binding.workflowKey),
      agentKey: cleanString(binding.agentKey),
      webhookPath: cleanString(binding.webhookPath),
      isActive: toBool(binding.isActive, true)
    });
  };

  const onToggleBindingActive = async (binding: IndustryBindingRow, isActive: boolean) => {
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật trạng thái binding.');
      return;
    }

    try {
      await apiRequest(`/ai-routing/industry-bindings/${binding.id}`, {
        method: 'PATCH',
        body: {
          isActive
        }
      });
      setResultMessage(
        `Đã ${isActive ? 'bật' : 'tắt'} binding ${cleanString(binding.industry?.industryKey) || binding.industryId}.`
      );
      await loadIndustryBindings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái binding.');
    }
  };

  if (!canView) {
    return null;
  }

  return (
    <article
      className={embedded ? '' : 'module-workbench'}
      style={embedded ? { marginTop: '0.6rem' } : undefined}
      data-testid="zalo-automation-ai-routing-workbench"
      data-embedded={embedded ? 'true' : 'false'}
    >
      {embedded ? (
        <div className="filter-actions" style={{ marginBottom: '0.55rem' }}>
          <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
            Tải lại AI Routing
          </button>
        </div>
      ) : (
        <header className="module-header">
          <div>
            <h1>AI Routing Theo Ngành</h1>
            <p>Cấu hình webhook n8n và bảng phân bổ nick Zalo theo ngành để điều phối AI auto-reply.</p>
            <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
              <Link className="btn btn-ghost" href="/modules/zalo-automation/messages">
                Mở trang Tin nhắn
              </Link>
              <Link className="btn btn-ghost" href="/modules/zalo-automation/accounts">
                Quản lý tài khoản Zalo
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
                Tải lại tất cả
              </button>
            </div>
          </div>
          <ul>
            <li>Bước 1: đặt runtime mode và webhook outbound ERP -&gt; n8n.</li>
            <li>Bước 2: tạo ngành nghiệp vụ và map nick kênh vào ngành.</li>
            <li>Bước 3: map ngành -&gt; workflow/agent để n8n route đúng kịch bản.</li>
          </ul>
        </header>
      )}

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="crm-grid crm-grid-single">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Runtime Webhook n8n</h2>
            <Badge variant={statusToBadge(runtimeForm.mode)}>{runtimeForm.mode.toUpperCase()}</Badge>
          </div>
          <p className="muted">
            Callback ERP nhận dữ liệu từ n8n tại <code>/api/v1/integrations/n8n/ai-replies</code>.
          </p>
          <form className="filter-bar" onSubmit={onSaveRuntimeConfig}>
            <div className="filter-grid">
              <div className="field">
                <label htmlFor="ai-routing-mode">Routing mode</label>
                <select
                  id="ai-routing-mode"
                  value={runtimeForm.mode}
                  onChange={(event) =>
                    setRuntimeForm((prev) => ({
                      ...prev,
                      mode: event.target.value as AiRoutingMode
                    }))
                  }
                >
                  {ROUTING_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ai-routing-chat-url">ERP -&gt; n8n webhook URL</label>
                <input
                  id="ai-routing-chat-url"
                  value={runtimeForm.chatEventsUrl}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, chatEventsUrl: event.target.value }))}
                  placeholder="https://n8n.example.com/webhook/erp-chat-events"
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-outbound-secret">Outbound HMAC secret</label>
                <input
                  id="ai-routing-outbound-secret"
                  value={runtimeForm.outboundHmacSecret}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, outboundHmacSecret: event.target.value }))}
                  placeholder="secret ký request ERP -> n8n"
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-callback-secret">Callback HMAC secret</label>
                <input
                  id="ai-routing-callback-secret"
                  value={runtimeForm.callbackHmacSecret}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, callbackHmacSecret: event.target.value }))}
                  placeholder="secret verify callback n8n -> ERP"
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-debounce">Debounce (giây)</label>
                <input
                  id="ai-routing-debounce"
                  type="number"
                  min={1}
                  max={120}
                  value={runtimeForm.debounceSeconds}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, debounceSeconds: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-timeout">Dispatch timeout (ms)</label>
                <input
                  id="ai-routing-timeout"
                  type="number"
                  min={1000}
                  max={120000}
                  value={runtimeForm.dispatchTimeoutMs}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, dispatchTimeoutMs: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-max-retry">Max retry attempts</label>
                <input
                  id="ai-routing-max-retry"
                  type="number"
                  min={1}
                  max={10}
                  value={runtimeForm.maxRetryAttempts}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, maxRetryAttempts: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="ai-routing-backoff">Retry backoff (giây)</label>
                <input
                  id="ai-routing-backoff"
                  value={runtimeForm.retryBackoffSeconds}
                  onChange={(event) => setRuntimeForm((prev) => ({ ...prev, retryBackoffSeconds: event.target.value }))}
                  placeholder="10,30,90"
                />
              </div>
            </div>
            <div className="filter-actions">
              <button type="submit" className="btn btn-primary" disabled={isSavingRuntime || isLoadingRuntime || !canUpdate}>
                {isSavingRuntime ? 'Đang lưu...' : 'Lưu runtime'}
              </button>
            </div>
          </form>
        </section>

        <section className="crm-grid">
          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Ngành AI</h2>
              <Badge variant="neutral">{industries.length} ngành</Badge>
            </div>

            <form className="filter-bar" onSubmit={onSubmitIndustry}>
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-industry-key">Industry key</label>
                  <input
                    id="ai-industry-key"
                    value={industryForm.industryKey}
                    onChange={(event) => setIndustryForm((prev) => ({ ...prev, industryKey: event.target.value }))}
                    placeholder="bao_hiem_xe"
                    disabled={Boolean(editingIndustryId)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-industry-name">Tên ngành</label>
                  <input
                    id="ai-industry-name"
                    value={industryForm.name}
                    onChange={(event) => setIndustryForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Bảo hiểm xe"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-industry-ks">Knowledge space</label>
                  <input
                    id="ai-industry-ks"
                    value={industryForm.knowledgeSpaceRef}
                    onChange={(event) => setIndustryForm((prev) => ({ ...prev, knowledgeSpaceRef: event.target.value }))}
                    placeholder="kb://insurance"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-industry-description">Mô tả</label>
                  <input
                    id="ai-industry-description"
                    value={industryForm.description}
                    onChange={(event) => setIndustryForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Mô tả ngắn ngữ cảnh ngành"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-industry-mask-enabled">Mask PII</label>
                  <select
                    id="ai-industry-mask-enabled"
                    value={industryForm.piiMaskEnabled ? 'true' : 'false'}
                    onChange={(event) =>
                      setIndustryForm((prev) => ({
                        ...prev,
                        piiMaskEnabled: event.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Bật</option>
                    <option value="false">Tắt</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ai-industry-active">Trạng thái</label>
                  <select
                    id="ai-industry-active"
                    value={industryForm.isActive ? 'true' : 'false'}
                    onChange={(event) =>
                      setIndustryForm((prev) => ({
                        ...prev,
                        isActive: event.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="filter-actions">
                {editingIndustryId ? (
                  <button type="button" className="btn btn-ghost" onClick={resetIndustryForm}>
                    Hủy sửa
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={isSavingIndustry || (!canCreate && !canUpdate)}>
                  {isSavingIndustry
                    ? 'Đang lưu...'
                    : editingIndustryId
                      ? 'Lưu ngành'
                      : 'Tạo ngành'}
                </button>
              </div>
            </form>

            <div className="filter-bar">
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-industry-query">Tìm ngành</label>
                  <input
                    id="ai-industry-query"
                    value={industryQuery}
                    onChange={(event) => setIndustryQuery(event.target.value)}
                    placeholder="industry key, tên ngành..."
                  />
                </div>
              </div>
              <div className="filter-actions">
                <button type="button" className="btn btn-ghost" onClick={() => void loadIndustries(industryQuery)}>
                  Tải danh sách ngành
                </button>
              </div>
            </div>

            {isLoadingIndustries ? <p className="muted">Đang tải ngành...</p> : null}
            {!isLoadingIndustries && industries.length === 0 ? <p className="muted">Chưa có ngành nào.</p> : null}
            {industries.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Industry</th>
                      <th>Knowledge</th>
                      <th>PII</th>
                      <th>Status</th>
                      <th>Cập nhật</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {industries.map((industry) => {
                      const active = toBool(industry.isActive, true);
                      return (
                        <tr key={industry.id}>
                          <td>
                            <strong>{industry.name}</strong>
                            <br />
                            <span className="muted">{industry.industryKey}</span>
                          </td>
                          <td>{cleanString(industry.knowledgeSpaceRef) || '--'}</td>
                          <td>{toBool(industry.piiMaskEnabled, true) ? 'MASK ON' : 'MASK OFF'}</td>
                          <td>
                            <Badge variant={statusToBadge(routeStatusLabel(active))}>{routeStatusLabel(active)}</Badge>
                          </td>
                          <td>{toDateTime(industry.updatedAt)}</td>
                          <td>
                            <div className="action-buttons">
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditIndustry(industry)}>
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void onToggleIndustryActive(industry, !active)}
                                disabled={!canUpdate}
                              >
                                {active ? 'Tắt' : 'Bật'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Map Nick Kênh -&gt; Ngành</h2>
              <Badge variant="neutral">{channelMappings.length} mappings</Badge>
            </div>

            <form className="filter-bar" onSubmit={onSubmitMapping}>
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-mapping-channel">Kênh</label>
                  <select
                    id="ai-mapping-channel"
                    value={mappingForm.channel}
                    onChange={(event) =>
                      setMappingForm((prev) => ({
                        ...prev,
                        channel: event.target.value as ConversationChannel
                      }))
                    }
                  >
                    {CHANNEL_OPTIONS.map((channel) => (
                      <option key={channel} value={channel}>
                        {CHANNEL_LABELS[channel]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ai-mapping-account-select">Nick tài khoản</label>
                  <select
                    id="ai-mapping-account-select"
                    value={mappingForm.channelAccountId}
                    onChange={(event) => setMappingForm((prev) => ({ ...prev, channelAccountId: event.target.value }))}
                  >
                    <option value="">-- Chọn tài khoản --</option>
                    {accountOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {accountLabel(account)}
                      </option>
                    ))}
                  </select>
                  {isLoadingAccounts ? <small>Đang tải tài khoản...</small> : null}
                </div>
                <div className="field">
                  <label htmlFor="ai-mapping-account-id">Channel account ID (manual)</label>
                  <input
                    id="ai-mapping-account-id"
                    value={mappingForm.channelAccountId}
                    onChange={(event) => setMappingForm((prev) => ({ ...prev, channelAccountId: event.target.value }))}
                    placeholder="account id hoặc external id"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-mapping-industry">Ngành</label>
                  <select
                    id="ai-mapping-industry"
                    value={mappingForm.industryId}
                    onChange={(event) => setMappingForm((prev) => ({ ...prev, industryId: event.target.value }))}
                  >
                    <option value="">-- Chọn ngành --</option>
                    {industries.map((industry) => (
                      <option key={industry.id} value={industry.id}>
                        {industry.name} ({industry.industryKey})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ai-mapping-active">Trạng thái</label>
                  <select
                    id="ai-mapping-active"
                    value={mappingForm.isActive ? 'true' : 'false'}
                    onChange={(event) =>
                      setMappingForm((prev) => ({
                        ...prev,
                        isActive: event.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="filter-actions">
                {editingMappingId ? (
                  <button type="button" className="btn btn-ghost" onClick={resetMappingForm}>
                    Hủy sửa
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={isSavingMapping || (!canCreate && !canUpdate)}>
                  {isSavingMapping
                    ? 'Đang lưu...'
                    : editingMappingId
                      ? 'Lưu mapping'
                      : 'Tạo mapping'}
                </button>
              </div>
            </form>

            <div className="filter-bar">
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-mapping-query">Tìm mapping</label>
                  <input
                    id="ai-mapping-query"
                    value={mappingQuery}
                    onChange={(event) => setMappingQuery(event.target.value)}
                    placeholder="channel account, ngành..."
                  />
                </div>
              </div>
              <div className="filter-actions">
                <button type="button" className="btn btn-ghost" onClick={() => void loadChannelMappings(mappingQuery)}>
                  Tải mappings
                </button>
              </div>
            </div>

            {isLoadingMappings ? <p className="muted">Đang tải mappings...</p> : null}
            {!isLoadingMappings && channelMappings.length === 0 ? <p className="muted">Chưa có mapping nào.</p> : null}
            {channelMappings.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kênh</th>
                      <th>Nick/Account</th>
                      <th>Ngành</th>
                      <th>Status</th>
                      <th>Cập nhật</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelMappings.map((mapping) => {
                      const active = toBool(mapping.isActive, true);
                      return (
                        <tr key={mapping.id}>
                          <td>{CHANNEL_LABELS[mapping.channel] ?? mapping.channel}</td>
                          <td>{mapping.channelAccountId}</td>
                          <td>{cleanString(mapping.industry?.name) || cleanString(mapping.industry?.industryKey) || '--'}</td>
                          <td>
                            <Badge variant={statusToBadge(routeStatusLabel(active))}>{routeStatusLabel(active)}</Badge>
                          </td>
                          <td>{toDateTime(mapping.updatedAt)}</td>
                          <td>
                            <div className="action-buttons">
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditMapping(mapping)}>
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void onToggleMappingActive(mapping, !active)}
                                disabled={!canUpdate}
                              >
                                {active ? 'Tắt' : 'Bật'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Map Ngành -&gt; Workflow</h2>
              <Badge variant="neutral">{industryBindings.length} bindings</Badge>
            </div>

            <form className="filter-bar" onSubmit={onSubmitBinding}>
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-binding-industry">Ngành</label>
                  <select
                    id="ai-binding-industry"
                    value={bindingForm.industryId}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, industryId: event.target.value }))}
                  >
                    <option value="">-- Chọn ngành --</option>
                    {industries.map((industry) => (
                      <option key={industry.id} value={industry.id}>
                        {industry.name} ({industry.industryKey})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ai-binding-workflow">Workflow key</label>
                  <input
                    id="ai-binding-workflow"
                    value={bindingForm.workflowKey}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, workflowKey: event.target.value }))}
                    placeholder="insurance_router_v1"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-binding-agent">Agent key</label>
                  <input
                    id="ai-binding-agent"
                    value={bindingForm.agentKey}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, agentKey: event.target.value }))}
                    placeholder="assistant_insurance"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-binding-webhook">Webhook path (optional)</label>
                  <input
                    id="ai-binding-webhook"
                    value={bindingForm.webhookPath}
                    onChange={(event) => setBindingForm((prev) => ({ ...prev, webhookPath: event.target.value }))}
                    placeholder="/webhook/erp-chat-events/insurance"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-binding-active">Trạng thái</label>
                  <select
                    id="ai-binding-active"
                    value={bindingForm.isActive ? 'true' : 'false'}
                    onChange={(event) =>
                      setBindingForm((prev) => ({
                        ...prev,
                        isActive: event.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="filter-actions">
                {editingBindingId ? (
                  <button type="button" className="btn btn-ghost" onClick={resetBindingForm}>
                    Hủy sửa
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={isSavingBinding || (!canCreate && !canUpdate)}>
                  {isSavingBinding
                    ? 'Đang lưu...'
                    : editingBindingId
                      ? 'Lưu binding'
                      : 'Tạo binding'}
                </button>
              </div>
            </form>

            <div className="filter-bar">
              <div className="filter-grid">
                <div className="field">
                  <label htmlFor="ai-binding-query">Tìm binding</label>
                  <input
                    id="ai-binding-query"
                    value={bindingQuery}
                    onChange={(event) => setBindingQuery(event.target.value)}
                    placeholder="workflow, agent, ngành..."
                  />
                </div>
              </div>
              <div className="filter-actions">
                <button type="button" className="btn btn-ghost" onClick={() => void loadIndustryBindings(bindingQuery)}>
                  Tải bindings
                </button>
              </div>
            </div>

            {isLoadingBindings ? <p className="muted">Đang tải bindings...</p> : null}
            {!isLoadingBindings && industryBindings.length === 0 ? <p className="muted">Chưa có binding nào.</p> : null}
            {industryBindings.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ngành</th>
                      <th>Workflow</th>
                      <th>Agent</th>
                      <th>Webhook path</th>
                      <th>Status</th>
                      <th>Cập nhật</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {industryBindings.map((binding) => {
                      const active = toBool(binding.isActive, true);
                      return (
                        <tr key={binding.id}>
                          <td>{cleanString(binding.industry?.name) || cleanString(binding.industry?.industryKey) || '--'}</td>
                          <td>{binding.workflowKey}</td>
                          <td>{cleanString(binding.agentKey) || '--'}</td>
                          <td>{cleanString(binding.webhookPath) || '--'}</td>
                          <td>
                            <Badge variant={statusToBadge(routeStatusLabel(active))}>{routeStatusLabel(active)}</Badge>
                          </td>
                          <td>{toDateTime(binding.updatedAt)}</td>
                          <td>
                            <div className="action-buttons">
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditBinding(binding)}>
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void onToggleBindingActive(binding, !active)}
                                disabled={!canUpdate}
                              >
                                {active ? 'Tắt' : 'Bật'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Ghi chú vận hành</h2>
          </div>
          <div className="form-grid">
            <p>
              Nếu không nhập secret tại đây, hệ thống sẽ fallback theo biến môi trường tương ứng trên VM deployment.
            </p>
            <p>
              Callback URL cố định của ERP: <code>/api/v1/integrations/n8n/ai-replies</code> với header <code>x-n8n-signature</code>.
            </p>
            <p>
              Mapping mới có hiệu lực cho event mới; job đã queue trước đó sẽ giữ snapshot routing cũ.
            </p>
          </div>
        </section>
      </section>
    </article>
  );
}
