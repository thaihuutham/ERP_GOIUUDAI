'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload, normalizeObjectPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { Badge, Modal, statusToBadge } from './ui';

type CampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELED';
type CampaignAccountStatus = 'READY' | 'PAUSED_ERROR' | 'DONE' | 'DISABLED';
type CampaignRecipientStatus = 'PENDING' | 'IN_PROGRESS' | 'SENT' | 'SKIPPED' | 'FAILED';
type CampaignAttemptStatus = 'SENT' | 'FAILED' | 'SKIPPED';
type SelectionPolicy = 'PRIORITIZE_RECENT_INTERACTION' | 'AVOID_PREVIOUSLY_INTERACTED_ACCOUNT';
type CustomerZaloNickType =
  | 'CHUA_KIEM_TRA'
  | 'CHUA_CO_NICK_ZALO'
  | 'CHAN_NGUOI_LA'
  | 'GUI_DUOC_TIN_NHAN';

type CampaignStats = {
  pending?: number;
  inProgress?: number;
  sent?: number;
  skipped?: number;
  failed?: number;
};

type CampaignAccountRow = {
  id: string;
  zaloAccountId: string;
  templateContent: string;
  quota: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  consecutiveErrorCount: number;
  status: CampaignAccountStatus;
  nextSendAt?: string | null;
  lastSentAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
  zaloAccount?: {
    id: string;
    displayName?: string | null;
    status?: string | null;
  } | null;
};

type CampaignOperatorRow = {
  id: string;
  userId: string;
  assignedBy?: string | null;
  assignedAt?: string | null;
};

type CampaignRow = {
  id: string;
  code?: string | null;
  name: string;
  status: CampaignStatus;
  timezone?: string | null;
  selectionPolicy: SelectionPolicy;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxConsecutiveErrors: number;
  maxRecipients?: number | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  stats?: CampaignStats;
  accounts: CampaignAccountRow[];
  operators: CampaignOperatorRow[];
};

type RecipientRow = {
  id: string;
  customerId: string;
  externalThreadId?: string | null;
  targetAccountId?: string | null;
  status: CampaignRecipientStatus;
  attemptCount: number;
  sentAt?: string | null;
  skippedReason?: string | null;
  failedReason?: string | null;
  messagePreview?: string | null;
  customer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  targetAccount?: {
    id: string;
    displayName?: string | null;
    status?: string | null;
  } | null;
};

type AttemptRow = {
  id: string;
  status: CampaignAttemptStatus;
  renderedContent?: string | null;
  missingVariables?: string[];
  errorMessage?: string | null;
  attemptedAt?: string | null;
  campaignAccount?: {
    id: string;
    zaloAccountId?: string | null;
  } | null;
  customer?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
  zaloAccount?: {
    id: string;
    displayName?: string | null;
    status?: string | null;
  } | null;
};

type ZaloAccount = {
  id: string;
  displayName?: string | null;
  zaloUid?: string | null;
  status?: string | null;
};

type UserOption = {
  id: string;
  email: string;
  role?: string | null;
  employee?: {
    fullName?: string | null;
  } | null;
};

type CreateCampaignForm = {
  name: string;
  code: string;
  selectionPolicy: SelectionPolicy;
  delayMinSeconds: string;
  delayMaxSeconds: string;
  maxConsecutiveErrors: string;
  maxRecipients: string;
  allowedVariableKeys: string;
  customerIds: string;
  tags: string;
  stage: string;
  source: string;
  zaloNickTypes: CustomerZaloNickType[];
  defaultPromoCode: string;
};

type AccountDraft = {
  enabled: boolean;
  quota: string;
  templateContent: string;
};

const SELECTION_POLICY_OPTIONS: Array<{ value: SelectionPolicy; label: string }> = [
  {
    value: 'PRIORITIZE_RECENT_INTERACTION',
    label: 'Ưu tiên nick tương tác gần nhất',
  },
  {
    value: 'AVOID_PREVIOUSLY_INTERACTED_ACCOUNT',
    label: 'Không gửi bằng nick đã tương tác',
  },
];

const CUSTOMER_ZALO_NICK_TYPE_OPTIONS: Array<{ value: CustomerZaloNickType; label: string }> = [
  { value: 'CHUA_KIEM_TRA', label: 'Chưa kiểm tra' },
  { value: 'CHUA_CO_NICK_ZALO', label: 'Chưa có nick Zalo' },
  { value: 'CHAN_NGUOI_LA', label: 'Chặn người lạ' },
  { value: 'GUI_DUOC_TIN_NHAN', label: 'Gửi được tin nhắn' },
];

type CampaignFieldHelpKey =
  | 'name'
  | 'code'
  | 'selectionPolicy'
  | 'delayMinSeconds'
  | 'delayMaxSeconds'
  | 'maxConsecutiveErrors'
  | 'maxRecipients'
  | 'allowedVariableKeys'
  | 'customerIds'
  | 'tags'
  | 'stage'
  | 'source'
  | 'zaloNickTypes'
  | 'defaultPromoCode'
  | 'operatorCampaign'
  | 'accountQuota'
  | 'accountTemplateContent';

type CampaignFieldHelpContent = {
  title: string;
  description: string;
  details: string[];
  example?: string;
};

const CAMPAIGN_FIELD_HELP: Record<CampaignFieldHelpKey, CampaignFieldHelpContent> = {
  name: {
    title: 'Tên campaign',
    description: 'Tên hiển thị để đội vận hành nhận diện chiến dịch.',
    details: [
      'Nên đặt theo mục tiêu + thời gian để dễ tìm trong lịch sử.',
      'Tên này không cần unique, nhưng nên rõ nghĩa.',
    ],
    example: 'Tái kích hoạt khách cũ - Tháng 4',
  },
  code: {
    title: 'Mã campaign',
    description: 'Mã nội bộ để đối soát nhanh giữa báo cáo và vận hành.',
    details: [
      'Có thể để trống nếu không cần quy ước mã.',
      'Nên dùng format cố định để team dễ tra cứu.',
    ],
    example: 'ZALO_REACT_2026Q2',
  },
  selectionPolicy: {
    title: 'Policy chọn account',
    description: 'Quy tắc chọn nick Zalo nào sẽ gửi cho khách.',
    details: [
      'Ưu tiên nick tương tác gần nhất: cố gắng giữ continuity theo lịch sử chat.',
      'Không gửi bằng nick đã tương tác: thử account khác để phân tải.',
    ],
  },
  delayMinSeconds: {
    title: 'Delay tối thiểu',
    description: 'Khoảng chờ ngắn nhất giữa 2 lần gửi thành công của cùng account.',
    details: [
      'Giúp giảm tốc độ gửi đột biến và giảm rủi ro bị hạn chế.',
      'Giá trị càng thấp thì campaign chạy càng nhanh.',
    ],
    example: '180 giây',
  },
  delayMaxSeconds: {
    title: 'Delay tối đa',
    description: 'Khoảng chờ dài nhất giữa 2 lần gửi thành công của cùng account.',
    details: [
      'Hệ thống sẽ random trong khoảng min..max sau mỗi lần gửi.',
      'Nên giữ khoảng đủ rộng để phân tán nhịp gửi tự nhiên.',
    ],
    example: '300 giây',
  },
  maxConsecutiveErrors: {
    title: 'Ngưỡng lỗi liên tiếp',
    description: 'Số lỗi liên tục tối đa trước khi account bị PAUSED_ERROR.',
    details: [
      'Khi một account bị pause vì lỗi, account khác vẫn tiếp tục chạy.',
      'Nên đặt thấp nếu bạn muốn fail-fast để bảo vệ account.',
    ],
    example: '3',
  },
  maxRecipients: {
    title: 'Max recipients',
    description: 'Giới hạn số khách snapshot tối đa cho campaign.',
    details: [
      'Để trống: hệ thống dùng mức mặc định an toàn khi tạo snapshot.',
      'Dùng khi cần chạy thử nghiệm nhỏ trước khi mở rộng.',
      'V1 giới hạn tối đa 20.000 recipients cho mỗi campaign.',
      'Đặt càng lớn thì truy vấn snapshot ban đầu càng nặng.',
    ],
  },
  allowedVariableKeys: {
    title: 'Allowed variable keys',
    description: 'Danh sách biến được phép resolve trong template.',
    details: [
      'Biến không nằm trong allowlist sẽ bị coi là thiếu và recipient bị skip.',
      'Dùng để kiểm soát chặt nguồn dữ liệu thay thế vào nội dung.',
    ],
    example: 'ten_khach,ma_khuyen_mai,customer.phone',
  },
  customerIds: {
    title: 'Customer IDs snapshot',
    description: 'Danh sách customer id muốn ép đưa vào snapshot.',
    details: [
      'Phù hợp cho chiến dịch target chính xác theo danh sách định sẵn.',
      'Có thể nhập nhiều id, phân tách bằng dấu phẩy hoặc xuống dòng.',
    ],
  },
  tags: {
    title: 'Tags snapshot',
    description: 'Lọc khách theo tag tại thời điểm tạo snapshot.',
    details: [
      'Dùng khi muốn nhắm theo phân khúc nghiệp vụ.',
      'Nhiều tag sẽ được xử lý theo logic hasSome.',
    ],
    example: 'vip,lead-moi',
  },
  stage: {
    title: 'Stage snapshot',
    description: 'Lọc khách theo giai đoạn CRM (customer stage).',
    details: [
      'Giúp chiến dịch bám đúng vòng đời khách hàng.',
      'Giá trị nên theo taxonomy đang dùng trong CRM.',
    ],
    example: 'MOI',
  },
  source: {
    title: 'Source snapshot',
    description: 'Lọc khách theo nguồn đến (source).',
    details: [
      'Dùng để tách chiến dịch theo kênh lead.',
      'Nên thống nhất cách đặt source trong CRM để tránh lệch dữ liệu.',
    ],
    example: 'ZALO',
  },
  zaloNickTypes: {
    title: 'Lọc theo loại nick Zalo',
    description: 'Chọn nhóm khách theo khả năng gửi tin trên Zalo.',
    details: [
      'Nếu không chọn gì, backend mặc định lấy CHUA_KIEM_TRA + GUI_DUOC_TIN_NHAN.',
      'CHUA_CO_NICK_ZALO sẽ bị loại khỏi tập gửi.',
      'CHAN_NGUOI_LA chỉ gửi được bằng nick đã từng tương tác gần nhất.',
    ],
  },
  defaultPromoCode: {
    title: 'Promo code mặc định',
    description: 'Mã khuyến mãi fallback dùng khi dữ liệu khách không có promo riêng.',
    details: [
      'Mã này có thể được chèn qua biến trong template.',
      'Nên đặt theo chiến dịch để dễ đo hiệu quả.',
    ],
    example: 'SPRING-2026',
  },
  operatorCampaign: {
    title: 'Operator campaign',
    description: 'Nhân sự được gán để có toàn quyền vận hành campaign này.',
    details: [
      'Operator có thể start/pause/resume/cancel campaign được gán.',
      'Bạn có thể thêm nhiều operator trong cùng campaign.',
    ],
  },
  accountQuota: {
    title: 'Quota account',
    description: 'Số lượng tin nhắn tối đa account được gửi trong 1 ngày.',
    details: [
      'Đến 24:00 theo timezone campaign, quota ngày sẽ reset.',
      'Khi chạm quota ngày, account sẽ chờ đến ngày hôm sau rồi gửi tiếp.',
    ],
  },
  accountTemplateContent: {
    title: 'Template nội dung account',
    description: 'Nội dung gửi riêng cho từng account, hỗ trợ biến và spin syntax.',
    details: [
      'Biến dùng cú pháp {{key}}, spin dùng {A|B|C}.',
      'Nếu thiếu biến hợp lệ, recipient sẽ bị skip và lưu reason.',
    ],
  },
};

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

function parseDelimitedValues(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function toPositiveInt(raw: string, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(parsed));
}

function campaignStatusLabel(status: CampaignStatus) {
  switch (status) {
    case 'DRAFT':
      return 'Nháp';
    case 'RUNNING':
      return 'Đang chạy';
    case 'PAUSED':
      return 'Tạm dừng';
    case 'COMPLETED':
      return 'Hoàn tất';
    case 'FAILED':
      return 'Lỗi';
    case 'CANCELED':
      return 'Đã hủy';
    default:
      return status;
  }
}

function policyLabel(policy: SelectionPolicy) {
  return policy === 'PRIORITIZE_RECENT_INTERACTION'
    ? 'Ưu tiên nick gần nhất'
    : 'Tránh nick đã tương tác';
}

type ZaloAutomationCampaignsWorkbenchProps = {
  campaignId?: string;
};

export function ZaloAutomationCampaignsWorkbench(props: ZaloAutomationCampaignsWorkbenchProps = {}) {
  const { campaignId } = props;
  const router = useRouter();
  const isDetailView = Boolean(campaignId);
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const isAdmin = role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId ?? '');

  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [operatorUserId, setOperatorUserId] = useState('');
  const [createOperatorUserId, setCreateOperatorUserId] = useState('');
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [activeHelpKey, setActiveHelpKey] = useState<CampaignFieldHelpKey | null>(null);

  const [createForm, setCreateForm] = useState<CreateCampaignForm>({
    name: '',
    code: '',
    selectionPolicy: 'PRIORITIZE_RECENT_INTERACTION',
    delayMinSeconds: '180',
    delayMaxSeconds: '300',
    maxConsecutiveErrors: '3',
    maxRecipients: '',
    allowedVariableKeys: '',
    customerIds: '',
    tags: '',
    stage: '',
    source: '',
    zaloNickTypes: [],
    defaultPromoCode: '',
  });

  const [accountDrafts, setAccountDrafts] = useState<Record<string, AccountDraft>>({});

  const activeCampaignId = isDetailView ? (campaignId ?? '') : selectedCampaignId;
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null,
    [activeCampaignId, campaigns],
  );

  const unassignedRecipientStats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let skippedNoTargetThread = 0;
    let lastSentAt: string | null = null;

    for (const recipient of recipients) {
      if (recipient.targetAccountId) {
        continue;
      }

      if (recipient.status === 'PENDING') {
        pending += 1;
      } else if (recipient.status === 'IN_PROGRESS') {
        inProgress += 1;
      } else if (recipient.status === 'SENT') {
        sent += 1;
      } else if (recipient.status === 'SKIPPED') {
        skipped += 1;
        if (String(recipient.skippedReason ?? '').trim().toUpperCase() === 'NO_TARGET_THREAD') {
          skippedNoTargetThread += 1;
        }
      } else if (recipient.status === 'FAILED') {
        failed += 1;
      }

      if (recipient.sentAt) {
        if (!lastSentAt || new Date(recipient.sentAt).getTime() > new Date(lastSentAt).getTime()) {
          lastSentAt = recipient.sentAt;
        }
      }
    }

    const total = pending + inProgress + sent + skipped + failed;
    return {
      total,
      pending,
      inProgress,
      sent,
      skipped,
      failed,
      skippedNoTargetThread,
      lastSentAt,
    };
  }, [recipients]);

  const userLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      map.set(user.id, `${user.employee?.fullName || user.email} (${user.role ?? 'USER'})`);
    }
    return map;
  }, [users]);

  const accountLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, account.displayName || account.zaloUid || account.id);
    }
    return map;
  }, [accounts]);

  const activeHelp = activeHelpKey ? CAMPAIGN_FIELD_HELP[activeHelpKey] : null;

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const loadCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const payload = await apiRequest<CampaignRow[]>('/zalo/campaigns');
      const rows = normalizeListPayload(payload) as unknown as CampaignRow[];
      setCampaigns(rows);
      setSelectedCampaignId((prev) => {
        if (isDetailView) {
          return campaignId ?? '';
        }
        if (prev && rows.some((row) => row.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được campaign.');
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: {
          accountType: 'PERSONAL',
        },
      });
      const rows = normalizeListPayload(payload) as unknown as ZaloAccount[];
      setAccounts(rows);
      setAccountDrafts((prev) => {
        const next: Record<string, AccountDraft> = { ...prev };
        for (const account of rows) {
          if (next[account.id]) {
            continue;
          }
          next[account.id] = {
            enabled: false,
            quota: '20',
            templateContent: 'Chào {{ten_khach}}, {shop đang có ưu đãi|shop vừa cập nhật khuyến mãi} dành cho bạn. Mã: {{ma_khuyen_mai}}',
          };
        }
        return next;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được tài khoản Zalo PERSONAL.');
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }

    try {
      const payload = await apiRequest<UserOption[]>('/settings/iam/users', {
        query: {
          limit: 300,
        },
      });
      const rows = normalizeListPayload(payload) as unknown as UserOption[];
      setUsers(rows);
      setOperatorUserId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
      setCreateOperatorUserId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách user nội bộ.');
    }
  };

  const loadCampaignDetails = async (campaignId: string) => {
    if (!campaignId) {
      setRecipients([]);
      setAttempts([]);
      return;
    }

    setIsLoadingDetails(true);
    try {
      const [campaignPayload, recipientsPayload, attemptsPayload] = await Promise.all([
        apiRequest<CampaignRow>(`/zalo/campaigns/${campaignId}`),
        apiRequest<RecipientRow[]>(`/zalo/campaigns/${campaignId}/recipients`, {
          query: {
            limit: 80,
          },
        }),
        apiRequest<AttemptRow[]>(`/zalo/campaigns/${campaignId}/attempts`, {
          query: {
            limit: 80,
          },
        }),
      ]);
      const campaignDetail = normalizeObjectPayload(campaignPayload) as CampaignRow | null;
      if (campaignDetail?.id) {
        setCampaigns((prev) => {
          const exists = prev.some((campaign) => campaign.id === campaignId);
          if (!exists) {
            return [campaignDetail, ...prev];
          }
          return prev.map((campaign) => (campaign.id === campaignId ? campaignDetail : campaign));
        });
      }
      setRecipients(normalizeListPayload(recipientsPayload) as unknown as RecipientRow[]);
      setAttempts(normalizeListPayload(attemptsPayload) as unknown as AttemptRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu chi tiết campaign.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const refreshAll = async () => {
    clearNotice();
    await Promise.all([loadCampaigns(), loadAccounts(), loadUsers()]);
  };

  useEffect(() => {
    if (campaignId) {
      setSelectedCampaignId(campaignId);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    void refreshAll();
  }, [canView, isAdmin]);

  useEffect(() => {
    if (!isDetailView) {
      setRecipients([]);
      setAttempts([]);
      return;
    }
    if (!canView || !activeCampaignId) {
      setRecipients([]);
      setAttempts([]);
      return;
    }
    void loadCampaignDetails(activeCampaignId);
  }, [activeCampaignId, canView, isDetailView]);

  const onCreateCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo campaign.');
      return;
    }

    const selectedAccounts = Object.entries(accountDrafts)
      .filter(([, draft]) => draft.enabled)
      .map(([accountId, draft]) => ({
        zaloAccountId: accountId,
        quota: toPositiveInt(draft.quota, 20),
        templateContent: draft.templateContent.trim(),
      }))
      .filter((item) => item.templateContent.length > 0);

    if (selectedAccounts.length === 0) {
      setErrorMessage('Bạn cần chọn ít nhất 1 account và nhập template hợp lệ.');
      return;
    }

    const customerIds = parseDelimitedValues(createForm.customerIds);
    const tags = parseDelimitedValues(createForm.tags);
    const allowedVariableKeys = parseDelimitedValues(createForm.allowedVariableKeys);

    const recipientFilterJson: Record<string, unknown> = {};
    if (customerIds.length > 0) {
      recipientFilterJson.customerIds = customerIds;
    }
    if (tags.length > 0) {
      recipientFilterJson.tags = tags;
    }
    if (createForm.stage.trim()) {
      recipientFilterJson.stage = createForm.stage.trim();
    }
    if (createForm.source.trim()) {
      recipientFilterJson.source = createForm.source.trim();
    }
    if (createForm.zaloNickTypes.length > 0) {
      recipientFilterJson.zaloNickTypes = createForm.zaloNickTypes;
    }
    if (createForm.defaultPromoCode.trim()) {
      recipientFilterJson.defaultPromoCode = createForm.defaultPromoCode.trim();
    }

    const maxRecipientsRaw = Number(createForm.maxRecipients);
    const hasMaxRecipients = Number.isFinite(maxRecipientsRaw) && maxRecipientsRaw > 0;

    try {
      await apiRequest('/zalo/campaigns', {
        method: 'POST',
        body: {
          name: createForm.name.trim(),
          code: createForm.code.trim() || undefined,
          selectionPolicy: createForm.selectionPolicy,
          delayMinSeconds: toPositiveInt(createForm.delayMinSeconds, 180),
          delayMaxSeconds: toPositiveInt(createForm.delayMaxSeconds, 300),
          maxConsecutiveErrors: toPositiveInt(createForm.maxConsecutiveErrors, 3),
          maxRecipients: hasMaxRecipients ? Math.trunc(maxRecipientsRaw) : undefined,
          allowedVariableKeys,
          recipientFilterJson: Object.keys(recipientFilterJson).length > 0 ? recipientFilterJson : undefined,
          accounts: selectedAccounts,
          operatorUserIds: isAdmin ? selectedOperatorIds : undefined,
        },
      });

      setResultMessage('Đã tạo campaign mới thành công.');
      setCreateForm((prev) => ({
        ...prev,
        name: '',
        code: '',
        zaloNickTypes: [],
      }));
      setSelectedOperatorIds([]);
      setAccountDrafts((prev) => {
        const next: Record<string, AccountDraft> = {};
        for (const [accountId, draft] of Object.entries(prev)) {
          next[accountId] = {
            ...draft,
            enabled: false,
          };
        }
        return next;
      });

      await loadCampaigns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo campaign.');
    }
  };

  const runCampaignAction = async (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    if (!activeCampaignId) {
      return;
    }
    clearNotice();

    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền thao tác campaign.');
      return;
    }

    try {
      await apiRequest(`/zalo/campaigns/${activeCampaignId}/${action}`, {
        method: 'POST',
      });
      setResultMessage(`Đã thực hiện thao tác ${action.toUpperCase()} cho campaign.`);
      await Promise.all([loadCampaigns(), loadCampaignDetails(activeCampaignId)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Không thể ${action} campaign.`);
    }
  };

  const onDeleteCampaign = async () => {
    if (!selectedCampaign) {
      return;
    }
    clearNotice();

    if (!isAdmin) {
      setErrorMessage('Chỉ ADMIN mới có quyền xóa campaign.');
      return;
    }

    if (selectedCampaign.status !== 'DRAFT') {
      setErrorMessage('Chỉ cho phép xóa campaign ở trạng thái DRAFT.');
      return;
    }

    if (!window.confirm(`Xóa campaign "${selectedCampaign.name}"?`)) {
      return;
    }

    try {
      await apiRequest(`/zalo/campaigns/${selectedCampaign.id}`, {
        method: 'DELETE',
      });
      setResultMessage('Đã xóa campaign draft.');
      if (isDetailView) {
        router.push('/modules/zalo-automation/campaigns');
        return;
      }
      await loadCampaigns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xóa campaign.');
    }
  };

  const onAssignOperator = async () => {
    if (!isAdmin || !activeCampaignId || !operatorUserId) {
      return;
    }
    clearNotice();

    try {
      await apiRequest(`/zalo/campaigns/${activeCampaignId}/operators/${operatorUserId}`, {
        method: 'PUT',
      });
      setResultMessage('Đã thêm operator cho campaign.');
      await loadCampaigns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thêm operator.');
    }
  };

  const onAddCreateOperator = () => {
    if (!createOperatorUserId) {
      return;
    }
    setSelectedOperatorIds((prev) => Array.from(new Set([...prev, createOperatorUserId])));
  };

  const onRemoveCreateOperator = (userId: string) => {
    setSelectedOperatorIds((prev) => prev.filter((item) => item !== userId));
  };

  const renderFieldLabel = (label: string, helpKey: CampaignFieldHelpKey) => (
    <span className="zalo-campaign-label-row">
      <span>{label}</span>
      <button
        type="button"
        className="zalo-campaign-help-btn"
        aria-label="Mở giải thích trường dữ liệu"
        title={`Giải thích: ${label}`}
        onClick={() => setActiveHelpKey(helpKey)}
      >
        i
      </button>
    </span>
  );

  const onRevokeOperator = async (userId: string) => {
    if (!isAdmin || !activeCampaignId) {
      return;
    }
    clearNotice();

    try {
      await apiRequest(`/zalo/campaigns/${activeCampaignId}/operators/${userId}`, {
        method: 'DELETE',
      });
      setResultMessage('Đã thu hồi operator khỏi campaign.');
      await loadCampaigns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thu hồi operator.');
    }
  };

  if (!canView) {
    return (
      <div className="panel-surface crm-panel">
        <div className="crm-panel-head">
          <h2>Zalo Campaigns</h2>
        </div>
        <p>Bạn không có quyền truy cập khu vực chiến dịch Zalo Automation.</p>
      </div>
    );
  }

  return (
    <div className="crm-customer-page" data-testid="zalo-automation-campaigns-workbench">
      <header className="crm-customer-page-header">
        <h1>{isDetailView ? 'Chi tiết Campaign Zalo PERSONAL' : 'Chiến dịch Zalo PERSONAL'}</h1>
        <p>
          {isDetailView
            ? 'Theo dõi chi tiết campaign, trạng thái gửi, recipients snapshot và lịch sử attempts.'
            : 'Tạo campaign theo quota account, chạy tự động theo khung giờ và theo dõi trạng thái gửi theo thời gian thực.'}
        </p>
      </header>

      {errorMessage && <div className="banner banner-error">{errorMessage}</div>}
      {resultMessage && <div className="banner banner-success">{resultMessage}</div>}

      {!isDetailView && (
        <>
          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <div>
                <h2>Tạo Campaign Mới</h2>
                <p>Chỉ kênh PERSONAL, mỗi account có template và quota riêng.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
                  Tải lại dữ liệu
                </button>
                <Link href="/modules/zalo-automation/accounts" className="btn btn-ghost">
                  Quản lý tài khoản
                </Link>
              </div>
            </div>

            <form className="form-grid" onSubmit={onCreateCampaign}>
              <div className="zalo-campaign-form-grid">
                <label>
                  {renderFieldLabel('Tên campaign', 'name')}
                  <input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Ví dụ: Campaign Tư vấn tháng 4"
                    required
                  />
                </label>
                <label>
                  {renderFieldLabel('Mã campaign', 'code')}
                  <input
                    value={createForm.code}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, code: event.target.value }))}
                    placeholder="OPTIONAL_CAMPAIGN_CODE"
                  />
                </label>
                <label>
                  {renderFieldLabel('Policy chọn account', 'selectionPolicy')}
                  <select
                    value={createForm.selectionPolicy}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        selectionPolicy: event.target.value as SelectionPolicy,
                      }))
                    }
                  >
                    {SELECTION_POLICY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {renderFieldLabel('Delay tối thiểu (giây)', 'delayMinSeconds')}
                  <input
                    type="number"
                    min={1}
                    value={createForm.delayMinSeconds}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, delayMinSeconds: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  {renderFieldLabel('Delay tối đa (giây)', 'delayMaxSeconds')}
                  <input
                    type="number"
                    min={1}
                    value={createForm.delayMaxSeconds}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, delayMaxSeconds: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  {renderFieldLabel('Ngưỡng lỗi liên tiếp / account', 'maxConsecutiveErrors')}
                  <input
                    type="number"
                    min={1}
                    value={createForm.maxConsecutiveErrors}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        maxConsecutiveErrors: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {renderFieldLabel('Max recipients (tuỳ chọn)', 'maxRecipients')}
                  <input
                    type="number"
                    min={1}
                    value={createForm.maxRecipients}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, maxRecipients: event.target.value }))}
                    placeholder="Để trống = theo tổng quota"
                  />
                </label>
                <label>
                  {renderFieldLabel('Allowed variable keys (phân cách dấu phẩy)', 'allowedVariableKeys')}
                  <input
                    value={createForm.allowedVariableKeys}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        allowedVariableKeys: event.target.value,
                      }))
                    }
                    placeholder="ten_khach,ma_khuyen_mai,customer.phone"
                  />
                </label>
                <label>
                  {renderFieldLabel('Customer IDs snapshot (tuỳ chọn)', 'customerIds')}
                  <input
                    value={createForm.customerIds}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, customerIds: event.target.value }))}
                    placeholder="id1,id2,id3"
                  />
                </label>
                <label>
                  {renderFieldLabel('Tags snapshot (tuỳ chọn)', 'tags')}
                  <input
                    value={createForm.tags}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: event.target.value }))}
                    placeholder="vip,lead-mới"
                  />
                </label>
                <label>
                  {renderFieldLabel('Stage snapshot (tuỳ chọn)', 'stage')}
                  <input
                    value={createForm.stage}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, stage: event.target.value }))}
                    placeholder="MOI"
                  />
                </label>
                <label>
                  {renderFieldLabel('Source snapshot (tuỳ chọn)', 'source')}
                  <input
                    value={createForm.source}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, source: event.target.value }))}
                    placeholder="ZALO"
                  />
                </label>
                <label>
                  {renderFieldLabel('Loại nick Zalo (tuỳ chọn)', 'zaloNickTypes')}
                  <select
                    multiple
                    value={createForm.zaloNickTypes}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        zaloNickTypes: Array.from(event.target.selectedOptions).map(
                          (option) => option.value as CustomerZaloNickType,
                        ),
                      }))
                    }
                    size={Math.min(Math.max(CUSTOMER_ZALO_NICK_TYPE_OPTIONS.length, 3), 6)}
                  >
                    {CUSTOMER_ZALO_NICK_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {renderFieldLabel('Promo code mặc định (tuỳ chọn)', 'defaultPromoCode')}
                  <input
                    value={createForm.defaultPromoCode}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        defaultPromoCode: event.target.value,
                      }))
                    }
                    placeholder="SPRING-2026"
                  />
                </label>
                {isAdmin && users.length > 0 && (
                  <div className="zalo-campaign-operator-picker is-inline-grid">
                    <p>
                      {renderFieldLabel('Operator campaign (được toàn quyền trên campaign được gán)', 'operatorCampaign')}
                    </p>
                    <div className="zalo-campaign-assign-operator-row">
                      <select
                        aria-label="Chọn operator cho campaign"
                        value={createOperatorUserId}
                        onChange={(event) => setCreateOperatorUserId(event.target.value)}
                      >
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {userLabelMap.get(user.id) || user.id}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-ghost" onClick={onAddCreateOperator}>
                        Thêm operator
                      </button>
                    </div>
                    <div className="zalo-campaign-operators-inline">
                      {selectedOperatorIds.length === 0 && (
                        <span className="zalo-campaign-empty-operator">Chưa chọn operator cho campaign mới.</span>
                      )}
                      {selectedOperatorIds.map((userId) => (
                        <div key={userId} className="zalo-campaign-operator-chip">
                          <span>{userLabelMap.get(userId) || userId}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onRemoveCreateOperator(userId)}
                          >
                            Bỏ
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="zalo-campaign-account-grid">
                {accounts.map((account) => {
                  const draft = accountDrafts[account.id] ?? {
                    enabled: false,
                    quota: '20',
                    templateContent: '',
                  };
                  const label = account.displayName || account.zaloUid || account.id;
                  return (
                    <div key={account.id} className="zalo-campaign-account-card">
                      <div className="zalo-campaign-account-top-row">
                        <label className="zalo-campaign-account-toggle">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) =>
                              setAccountDrafts((prev) => ({
                                ...prev,
                                [account.id]: {
                                  ...draft,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                        <div className="zalo-campaign-account-top-actions">
                          <div className="zalo-campaign-account-inline-field is-inline">
                            {renderFieldLabel('Quota/ngày', 'accountQuota')}
                            <input
                              type="number"
                              min={1}
                              value={draft.quota}
                              onChange={(event) =>
                                setAccountDrafts((prev) => ({
                                  ...prev,
                                  [account.id]: {
                                    ...draft,
                                    quota: event.target.value,
                                  },
                                }))
                              }
                              disabled={!draft.enabled}
                            />
                          </div>
                          <Badge variant={statusToBadge(account.status)}>{account.status || '--'}</Badge>
                        </div>
                      </div>
                      <label>
                        {renderFieldLabel('Template nội dung', 'accountTemplateContent')}
                        <textarea
                          className="zalo-campaign-template-textarea"
                          rows={5}
                          value={draft.templateContent}
                          onChange={(event) =>
                            setAccountDrafts((prev) => ({
                              ...prev,
                              [account.id]: {
                                ...draft,
                                templateContent: event.target.value,
                              },
                            }))
                          }
                          disabled={!draft.enabled}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                <button type="submit" className="btn btn-primary" disabled={!canCreate}>
                  Tạo campaign
                </button>
              </div>
            </form>
          </section>

          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Danh sách Campaign</h2>
              <Badge variant="neutral">{isLoadingCampaigns ? 'Đang tải...' : `${campaigns.length} campaigns`}</Badge>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Trạng thái</th>
                    <th>Policy</th>
                    <th>Tiến độ</th>
                    <th>Tạo lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 && (
                    <tr>
                      <td colSpan={5}>Chưa có campaign.</td>
                    </tr>
                  )}
                  {campaigns.map((campaign) => {
                    const stats = campaign.stats ?? {};
                    return (
                      <tr key={campaign.id}>
                        <td>
                          <strong>
                            <Link className="zalo-campaign-name-link" href={`/modules/zalo-automation/campaigns/${campaign.id}`}>
                              {campaign.name}
                            </Link>
                          </strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                            {campaign.code || campaign.id}
                          </div>
                        </td>
                        <td>
                          <Badge variant={statusToBadge(campaign.status)}>{campaignStatusLabel(campaign.status)}</Badge>
                        </td>
                        <td>{policyLabel(campaign.selectionPolicy)}</td>
                        <td>
                          {`S:${stats.sent ?? 0} / P:${stats.pending ?? 0} / K:${stats.skipped ?? 0} / F:${stats.failed ?? 0}`}
                        </td>
                        <td>{toDateTime(campaign.createdAt ?? null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {isDetailView && !isLoadingCampaigns && !selectedCampaign && (
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Chi tiết Campaign</h2>
          </div>
          <p>Không tìm thấy campaign hoặc bạn không có quyền truy cập.</p>
          <Link href="/modules/zalo-automation/campaigns" className="btn btn-ghost">
            Quay lại danh sách campaign
          </Link>
        </section>
      )}

      {isDetailView && selectedCampaign && (
        <>
          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <div>
                <h2>Chi tiết Campaign</h2>
                <p>
                  {selectedCampaign.name} • {selectedCampaign.code || selectedCampaign.id}
                </p>
              </div>
              <div className="zalo-chat-toolbar">
                <Link href="/modules/zalo-automation/campaigns" className="btn btn-ghost">
                  Danh sách campaign
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="zalo-campaign-action-start"
                  onClick={() => void runCampaignAction('start')}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="zalo-campaign-action-pause"
                  onClick={() => void runCampaignAction('pause')}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="zalo-campaign-action-resume"
                  onClick={() => void runCampaignAction('resume')}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="zalo-campaign-action-cancel"
                  onClick={() => void runCampaignAction('cancel')}
                >
                  Cancel
                </button>
                {isAdmin && selectedCampaign.status === 'DRAFT' && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    data-testid="zalo-campaign-action-delete"
                    onClick={() => void onDeleteCampaign()}
                  >
                    Xóa nháp
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => void loadCampaignDetails(selectedCampaign.id)}>
                  Reload details
                </button>
              </div>
            </div>

            <div className="zalo-campaign-kpi-grid">
              <div>
                <p>Trạng thái</p>
                <strong>{campaignStatusLabel(selectedCampaign.status)}</strong>
              </div>
              <div>
                <p>Delay</p>
                <strong>{`${selectedCampaign.delayMinSeconds}s - ${selectedCampaign.delayMaxSeconds}s`}</strong>
              </div>
              <div>
                <p>Error threshold</p>
                <strong>{selectedCampaign.maxConsecutiveErrors}</strong>
              </div>
              <div>
                <p>Khung giờ</p>
                <strong>07:00 - 11:30 / 14:00 - 20:00</strong>
              </div>
              <div>
                <p>Bắt đầu</p>
                <strong>{toDateTime(selectedCampaign.startedAt ?? null)}</strong>
              </div>
              <div>
                <p>Kết thúc</p>
                <strong>{toDateTime(selectedCampaign.completedAt ?? selectedCampaign.canceledAt ?? null)}</strong>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
              <table className="data-table zalo-campaign-account-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Trạng thái</th>
                    <th>Quota</th>
                    <th>Sent</th>
                    <th>Skipped</th>
                    <th>Failed</th>
                    <th>Lỗi liên tiếp</th>
                    <th>Lần gửi gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCampaign.accounts.length === 0 && (
                    <tr>
                      <td colSpan={8}>Campaign chưa có account.</td>
                    </tr>
                  )}
                  {selectedCampaign.accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.zaloAccount?.displayName || account.zaloAccountId}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{account.zaloAccountId}</div>
                      </td>
                      <td>
                        <Badge variant={statusToBadge(account.status)}>{account.status}</Badge>
                      </td>
                      <td>{account.quota}</td>
                      <td>{account.sentCount}</td>
                      <td>{account.skippedCount}</td>
                      <td>{account.failedCount}</td>
                      <td>{account.consecutiveErrorCount}</td>
                      <td>{toDateTime(account.lastSentAt ?? null)}</td>
                    </tr>
                  ))}
                  {unassignedRecipientStats.total > 0 && (
                    <tr className="zalo-campaign-unassigned-row">
                      <td>
                        <strong>Chưa gán account</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Recipients không xác định được target account
                        </div>
                      </td>
                      <td>
                        <Badge variant="neutral">UNASSIGNED</Badge>
                      </td>
                      <td>--</td>
                      <td>{unassignedRecipientStats.sent}</td>
                      <td>{unassignedRecipientStats.skipped}</td>
                      <td>{unassignedRecipientStats.failed}</td>
                      <td>--</td>
                      <td>{toDateTime(unassignedRecipientStats.lastSentAt)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {unassignedRecipientStats.total > 0 && (
              <p className="muted" style={{ marginTop: '0.45rem' }}>
                Tiến độ ở danh sách campaign là tổng toàn bộ recipients. Dòng <strong>Chưa gán account</strong>{' '}
                thể hiện phần recipients chưa map được target account (NO_TARGET_THREAD:{' '}
                {unassignedRecipientStats.skippedNoTargetThread}).
              </p>
            )}

            <div style={{ marginTop: '0.8rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Operators</h3>
              <div className="zalo-campaign-operators-inline">
                {selectedCampaign.operators.map((operator) => (
                  <div key={operator.id} className="zalo-campaign-operator-chip">
                    <span>{userLabelMap.get(operator.userId) || operator.userId}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void onRevokeOperator(operator.userId)}
                      >
                        Thu hồi
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {isAdmin && users.length > 0 && (
                <div className="zalo-campaign-assign-operator-row">
                  <select
                    value={operatorUserId}
                    onChange={(event) => setOperatorUserId(event.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabelMap.get(user.id) || user.id}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-ghost" onClick={() => void onAssignOperator()}>
                    Thêm operator
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Recipients Snapshot</h2>
              <Badge variant="neutral">{isLoadingDetails ? 'Đang tải...' : `${recipients.length} rows`}</Badge>
            </div>
            <p className="muted" style={{ marginTop: '0.35rem', marginBottom: '0.55rem' }}>
              Bảng này dùng để kiểm tra nhanh kết quả gửi theo từng khách (thread, target account, lý do skip/fail). Hệ thống chỉ
              tải snapshot gần nhất (tối đa 80 dòng), không kéo toàn bộ danh sách khi campaign có dữ liệu lớn.
            </p>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Trạng thái</th>
                    <th>Thread</th>
                    <th>Target account</th>
                    <th>Lý do</th>
                    <th>Nội dung preview</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.length === 0 && (
                    <tr>
                      <td colSpan={6}>Chưa có recipients.</td>
                    </tr>
                  )}
                  {recipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td>
                        <strong>{recipient.customer?.fullName || recipient.customerId}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {recipient.customer?.phone || recipient.customer?.email || recipient.customerId}
                        </div>
                      </td>
                      <td>
                        <Badge variant={statusToBadge(recipient.status)}>{recipient.status}</Badge>
                      </td>
                      <td>{recipient.externalThreadId || '--'}</td>
                      <td>{recipient.targetAccount?.displayName || accountLabelMap.get(recipient.targetAccountId || '') || '--'}</td>
                      <td>{recipient.skippedReason || recipient.failedReason || '--'}</td>
                      <td>{recipient.messagePreview || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-surface crm-panel">
            <div className="crm-panel-head">
              <h2>Lịch sử Attempts</h2>
              <Badge variant="neutral">{isLoadingDetails ? 'Đang tải...' : `${attempts.length} rows`}</Badge>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Account</th>
                    <th>Khách hàng</th>
                    <th>Kết quả</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.length === 0 && (
                    <tr>
                      <td colSpan={5}>Chưa có attempts.</td>
                    </tr>
                  )}
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{toDateTime(attempt.attemptedAt ?? null)}</td>
                      <td>{attempt.zaloAccount?.displayName || attempt.campaignAccount?.zaloAccountId || '--'}</td>
                      <td>{attempt.customer?.fullName || attempt.customer?.phone || '--'}</td>
                      <td>
                        <Badge variant={statusToBadge(attempt.status)}>{attempt.status}</Badge>
                      </td>
                      <td>
                        {attempt.errorMessage
                          || (attempt.missingVariables && attempt.missingVariables.length > 0
                            ? `Missing vars: ${attempt.missingVariables.join(', ')}`
                            : attempt.renderedContent || '--')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Modal
        open={Boolean(activeHelp)}
        onClose={() => setActiveHelpKey(null)}
        title={activeHelp ? `Giải thích: ${activeHelp.title}` : 'Giải thích trường dữ liệu'}
        maxWidth="680px"
      >
        {activeHelp && (
          <div className="zalo-campaign-help-modal">
            <p>{activeHelp.description}</p>
            <ul>
              {activeHelp.details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {activeHelp.example && (
              <p>
                <strong>Ví dụ:</strong> {activeHelp.example}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
