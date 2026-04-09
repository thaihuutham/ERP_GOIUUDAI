'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { getZaloAutomationSocket, resolveZaloAutomationOrgId } from '../lib/zalo-automation-socket';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { Badge, type BadgeVariant, Modal, statusToBadge } from './ui';

type ZaloPermissionLevel = 'READ' | 'CHAT' | 'ADMIN';
type ZaloAccountType = 'PERSONAL' | 'OA';

type ZaloAccount = {
  id: string;
  accountType?: ZaloAccountType | null;
  displayName?: string | null;
  zaloUid?: string | null;
  phone?: string | null;
  aiAutoReplyEnabled?: boolean | null;
  aiAutoReplyTakeoverMinutes?: number | null;
  ownerUserId?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  currentPermissionLevel?: ZaloPermissionLevel | null;
};

type ZaloAccountAssignment = {
  id: string;
  zaloAccountId: string;
  userId: string;
  permissionLevel: ZaloPermissionLevel;
  assignedBy?: string | null;
  assignedAt?: string | null;
};

type UserOption = {
  id: string;
  email: string;
  role?: string;
  employee?: {
    fullName?: string | null;
  } | null;
};

type CreateAccountForm = {
  accountType: ZaloAccountType;
  displayName: string;
  phone: string;
  ownerUserId: string;
};

type QrRealtimeState = {
  accountId: string;
  qrImage?: string | null;
  displayName?: string | null;
  statusText: string;
  error?: string | null;
};

const ACCOUNT_TYPE_OPTIONS: ZaloAccountType[] = ['PERSONAL', 'OA'];
const PERMISSION_OPTIONS: ZaloPermissionLevel[] = ['READ', 'CHAT', 'ADMIN'];

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

function accountTypeLabel(value: ZaloAccountType | string | null | undefined) {
  if (!value) {
    return '--';
  }
  return value === 'PERSONAL' ? 'Zalo cá nhân' : value === 'OA' ? 'Zalo OA' : value;
}

function permissionToBadge(permission: ZaloPermissionLevel | null | undefined): BadgeVariant {
  if (permission === 'ADMIN') {
    return 'success';
  }
  if (permission === 'CHAT') {
    return 'info';
  }
  if (permission === 'READ') {
    return 'warning';
  }
  return 'neutral';
}

function normalizePermission(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'READ' || normalized === 'CHAT' || normalized === 'ADMIN') {
    return normalized as ZaloPermissionLevel;
  }
  return null;
}

function normalizeQrImageSource(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith('data:image/')) {
    return raw;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
    return raw;
  }

  const compact = raw.replace(/\s+/g, '');
  const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(compact) && compact.length >= 64;
  if (looksLikeBase64) {
    return `data:image/png;base64,${compact}`;
  }

  return raw;
}

type SocketAccountEvent = {
  accountId?: string;
  qrImage?: string;
  displayName?: string;
  error?: string;
};

export function ZaloAutomationAccountsWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const canUpdate = canAction('crm', 'UPDATE');
  const canDelete = canAction('crm', 'DELETE');
  const isSystemAdmin = role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignments, setAssignments] = useState<ZaloAccountAssignment[]>([]);

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState('');
  const [togglingAutoReplyAccountId, setTogglingAutoReplyAccountId] = useState('');

  const [accountFilterQ, setAccountFilterQ] = useState('');
  const [accountFilterType, setAccountFilterType] = useState<ZaloAccountType | 'ALL'>('ALL');

  const [createAccountForm, setCreateAccountForm] = useState<CreateAccountForm>({
    accountType: 'PERSONAL',
    displayName: '',
    phone: '',
    ownerUserId: ''
  });
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);

  const [assignUserId, setAssignUserId] = useState('');
  const [assignPermission, setAssignPermission] = useState<ZaloPermissionLevel>('READ');
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentAccountId, setAssignmentAccountId] = useState('');

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrState, setQrState] = useState<QrRealtimeState | null>(null);
  const [qrAccountSubscriptionId, setQrAccountSubscriptionId] = useState('');

  const assignmentAccount = useMemo(
    () => accounts.find((item) => item.id === assignmentAccountId) ?? null,
    [accounts, assignmentAccountId]
  );
  const editingAccount = useMemo(
    () => accounts.find((item) => item.id === editingAccountId) ?? null,
    [accounts, editingAccountId]
  );

  const filteredAccounts = useMemo(() => {
    const q = accountFilterQ.trim().toLowerCase();
    return accounts.filter((account) => {
      if (accountFilterType !== 'ALL' && (account.accountType ?? '') !== accountFilterType) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [account.displayName, account.zaloUid, account.phone, account.ownerUserId, account.id]
        .map((value) => String(value ?? '').toLowerCase());
      return haystack.some((value) => value.includes(q));
    });
  }, [accounts, accountFilterQ, accountFilterType]);

  const userLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      map.set(user.id, `${user.employee?.fullName || user.email} (${user.role ?? 'USER'})`);
    }
    return map;
  }, [users]);

  const ownerSelectionOptions = useMemo(
    () => users.filter((user) => user.role === 'ADMIN' || user.role === 'USER'),
    [users]
  );

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const closeDisplayNameModal = () => {
    setDisplayNameModalOpen(false);
    setEditingAccountId('');
    setEditingDisplayName('');
  };

  const loadAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: { accountType: 'ALL' }
      });
      const rows = (normalizeListPayload(payload) as ZaloAccount[]).map((row) => ({
        ...row,
        currentPermissionLevel: normalizePermission(row.currentPermissionLevel)
      }));
      setAccounts(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách tài khoản Zalo.');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const loadUsers = async () => {
    if (!isSystemAdmin) {
      setUsers([]);
      return;
    }

    setIsLoadingUsers(true);
    try {
      const payload = await apiRequest<{ items?: UserOption[] }>('/settings/iam/users', {
        query: { limit: 300 }
      });
      const rows = normalizeListPayload(payload) as UserOption[];
      setUsers(rows);
      setAssignUserId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
      setCreateAccountForm((prev) => {
        if (!isSystemAdmin) {
          return prev;
        }
        if (prev.ownerUserId && rows.some((item) => item.id === prev.ownerUserId)) {
          return prev;
        }
        return {
          ...prev,
          ownerUserId: ''
        };
      });
    } catch (error) {
      setUsers([]);
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách nhân sự.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadAssignments = async (accountId: string) => {
    if (!accountId || !isSystemAdmin) {
      setAssignments([]);
      return;
    }

    setIsLoadingAssignments(true);
    try {
      const payload = await apiRequest<ZaloAccountAssignment[]>(`/zalo/accounts/${accountId}/assignments`);
      setAssignments(normalizeListPayload(payload) as ZaloAccountAssignment[]);
    } catch (error) {
      setAssignments([]);
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được phân quyền tài khoản Zalo.');
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const refreshAll = async () => {
    clearNotice();
    await Promise.all([loadAccounts(), loadUsers()]);
  };

  useEffect(() => {
    if (!canView) {
      return;
    }
    void refreshAll();
  }, [canView, isSystemAdmin]);

  useEffect(() => {
    if (!canView || !qrModalOpen || !qrState?.accountId) {
      return;
    }
    const socket = getZaloAutomationSocket();
    if (!socket) {
      return;
    }

    const orgId = resolveZaloAutomationOrgId();
    socket.emit('org:join', { orgId });
    socket.emit('zalo:subscribe', { accountId: qrState.accountId });
    setQrAccountSubscriptionId(qrState.accountId);

    const onQr = (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          qrImage: normalizeQrImageSource(payload.qrImage ?? prev.qrImage ?? null),
          statusText: 'Đang chờ quét QR...',
          error: null
        };
      });
    };

    const onScanned = (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          displayName: payload.displayName ?? prev.displayName ?? null,
          statusText: 'Đã quét QR, đang hoàn tất kết nối...',
          error: null
        };
      });
    };

    const onConnected = async (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'Kết nối thành công.',
          error: null
        };
      });
      await loadAccounts();
    };

    const onQrExpired = (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'QR đã hết hạn, vui lòng thao tác lại.',
          error: null
        };
      });
    };

    const onDisconnected = async (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'Tài khoản đã ngắt kết nối.',
          error: null
        };
      });
      await loadAccounts();
    };

    const onError = (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'Có lỗi trong phiên đăng nhập.',
          error: payload.error || 'Lỗi không xác định'
        };
      });
    };

    const onReconnectFailed = (payload: SocketAccountEvent) => {
      if (payload.accountId !== qrState.accountId) {
        return;
      }
      setQrState((prev) => {
        if (!prev || prev.accountId !== payload.accountId) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'Reconnect thất bại.',
          error: payload.error || 'Vui lòng đăng nhập QR lại'
        };
      });
    };

    socket.on('zalo:qr', onQr);
    socket.on('zalo:scanned', onScanned);
    socket.on('zalo:connected', onConnected);
    socket.on('zalo:qr-expired', onQrExpired);
    socket.on('zalo:disconnected', onDisconnected);
    socket.on('zalo:error', onError);
    socket.on('zalo:reconnect-failed', onReconnectFailed);

    return () => {
      socket.off('zalo:qr', onQr);
      socket.off('zalo:scanned', onScanned);
      socket.off('zalo:connected', onConnected);
      socket.off('zalo:qr-expired', onQrExpired);
      socket.off('zalo:disconnected', onDisconnected);
      socket.off('zalo:error', onError);
      socket.off('zalo:reconnect-failed', onReconnectFailed);
      socket.emit('zalo:unsubscribe', { accountId: qrState.accountId });
      setQrAccountSubscriptionId('');
    };
  }, [canView, qrModalOpen, qrState?.accountId]);

  const onCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo tài khoản Zalo.');
      return;
    }

    const displayName = createAccountForm.displayName.trim();
    const phone = createAccountForm.phone.trim();
    if (!displayName || !phone) {
      setErrorMessage('Vui lòng nhập đầy đủ Loại tài khoản, Tên hiển thị và Số điện thoại.');
      return;
    }

    try {
      await apiRequest('/zalo/accounts', {
        method: 'POST',
        body: {
          accountType: createAccountForm.accountType,
          displayName,
          phone,
          ownerUserId: isSystemAdmin ? createAccountForm.ownerUserId.trim() || undefined : undefined
        }
      });

      setCreateAccountForm((prev) => ({
        ...prev,
        displayName: '',
        phone: '',
        ownerUserId: prev.ownerUserId
      }));
      setCreateAccountModalOpen(false);
      setResultMessage('Đã tạo tài khoản Zalo mới.');
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo tài khoản Zalo.');
    }
  };

  const onOpenCreateAccountModal = async () => {
    clearNotice();
    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo tài khoản Zalo.');
      return;
    }
    if (isSystemAdmin && users.length === 0) {
      await loadUsers();
    }
    setCreateAccountModalOpen(true);
  };

  const onOpenDisplayNameModal = (account: ZaloAccount) => {
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật tài khoản Zalo.');
      return;
    }
    setEditingAccountId(account.id);
    setEditingDisplayName(String(account.displayName ?? '').trim());
    setDisplayNameModalOpen(true);
  };

  const onSaveDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật tài khoản Zalo.');
      return;
    }
    if (!editingAccountId) {
      setErrorMessage('Không xác định được tài khoản cần cập nhật.');
      return;
    }
    const normalizedDisplayName = editingDisplayName.trim();
    if (!normalizedDisplayName) {
      setErrorMessage('Tên hiển thị không được để trống.');
      return;
    }

    try {
      setIsSavingDisplayName(true);
      await apiRequest(`/zalo/accounts/${editingAccountId}`, {
        method: 'PATCH',
        body: {
          displayName: normalizedDisplayName
        }
      });
      closeDisplayNameModal();
      setResultMessage('Đã cập nhật tên hiển thị tài khoản Zalo trong ERP.');
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật tên hiển thị tài khoản Zalo.');
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const startQrFlow = async (account: ZaloAccount, mode: 'login' | 'reconnect') => {
    clearNotice();
    if (account.accountType !== 'PERSONAL') {
      setErrorMessage('Chỉ tài khoản Zalo cá nhân mới hỗ trợ QR/reconnect.');
      return;
    }

    try {
      setQrState({
        accountId: account.id,
        statusText: mode === 'login' ? 'Đang khởi tạo phiên QR...' : 'Đang khởi tạo reconnect...',
        qrImage: null,
        error: null
      });
      setQrModalOpen(true);

      const endpoint =
        mode === 'login'
          ? `/zalo/accounts/${account.id}/personal/login`
          : `/zalo/accounts/${account.id}/personal/reconnect`;
      await apiRequest(endpoint, { method: 'POST' });

      const qr = await apiRequest<{ status?: string; qrImage?: string | null }>(`/zalo/accounts/${account.id}/personal/qr`);
      setQrState((prev) => {
        if (!prev || prev.accountId !== account.id) {
          return prev;
        }
        return {
          ...prev,
          statusText: `Trạng thái: ${qr.status || 'QR_PENDING'}`,
          qrImage: normalizeQrImageSource(qr.qrImage ?? prev.qrImage ?? null)
        };
      });
      setResultMessage(mode === 'login' ? 'Đã khởi tạo đăng nhập QR.' : 'Đã khởi tạo reconnect.');
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể khởi tạo phiên QR/reconnect.');
      setQrState((prev) => {
        if (!prev || prev.accountId !== account.id) {
          return prev;
        }
        return {
          ...prev,
          statusText: 'Khởi tạo thất bại.',
          error: error instanceof Error ? error.message : 'Lỗi không xác định'
        };
      });
    }
  };

  const onDisconnect = async (account: ZaloAccount) => {
    clearNotice();
    if (account.accountType !== 'PERSONAL') {
      setErrorMessage('Chỉ tài khoản cá nhân mới hỗ trợ disconnect trực tiếp.');
      return;
    }
    try {
      await apiRequest(`/zalo/accounts/${account.id}/personal/disconnect`, {
        method: 'POST'
      });
      setResultMessage(`Đã ngắt kết nối ${account.displayName || account.id}.`);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể ngắt kết nối tài khoản.');
    }
  };

  const onSyncContacts = async (account: ZaloAccount) => {
    clearNotice();
    if (account.accountType !== 'PERSONAL') {
      setErrorMessage('Chỉ tài khoản cá nhân mới hỗ trợ sync danh bạ.');
      return;
    }

    try {
      setSyncingAccountId(account.id);
      const payload = await apiRequest<{
        created: number;
        updated: number;
        skippedNoPhone: number;
        skippedInvalidPhone: number;
      }>(`/zalo/accounts/${account.id}/sync-contacts`, {
        method: 'POST'
      });
      setResultMessage(
        `Sync danh bạ hoàn tất: tạo mới ${payload.created}, cập nhật ${payload.updated}, bỏ qua không có SĐT ${payload.skippedNoPhone}, SĐT không hợp lệ ${payload.skippedInvalidPhone}.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể đồng bộ danh bạ.');
    } finally {
      setSyncingAccountId('');
    }
  };

  const onToggleAutoReply = async (account: ZaloAccount, enabled: boolean) => {
    clearNotice();
    if (!canUpdate) {
      setErrorMessage('Vai trò hiện tại không có quyền cập nhật tài khoản.');
      return;
    }
    if (account.accountType !== 'PERSONAL') {
      setErrorMessage('Chỉ tài khoản Zalo cá nhân mới hỗ trợ auto-reply AI.');
      return;
    }

    setTogglingAutoReplyAccountId(account.id);
    try {
      await apiRequest(`/zalo/accounts/${account.id}`, {
        method: 'PATCH',
        body: {
          aiAutoReplyEnabled: enabled
        }
      });
      setAccounts((prev) =>
        prev.map((item) =>
          item.id === account.id
            ? { ...item, aiAutoReplyEnabled: enabled }
            : item
        )
      );
      setResultMessage(
        enabled
          ? `Đã bật AI auto-reply cho ${account.displayName || account.id}.`
          : `Đã tắt AI auto-reply cho ${account.displayName || account.id}.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái AI auto-reply.');
    } finally {
      setTogglingAutoReplyAccountId('');
    }
  };

  const onSoftDelete = async (account: ZaloAccount) => {
    clearNotice();
    if (!canDelete) {
      setErrorMessage('Vai trò hiện tại không có quyền xóa mềm tài khoản.');
      return;
    }

    if (!window.confirm(`Xóa mềm tài khoản ${account.displayName || account.id}? Hệ thống vẫn giữ lịch sử hội thoại.`)) {
      return;
    }

    try {
      await apiRequest(`/zalo/accounts/${account.id}`, {
        method: 'DELETE'
      });
      setResultMessage(`Đã xóa mềm tài khoản ${account.displayName || account.id}.`);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể xóa mềm tài khoản.');
    }
  };

  const onOpenAssignmentModal = async (account: ZaloAccount) => {
    clearNotice();
    if (!isSystemAdmin) {
      setErrorMessage('Chỉ ADMIN hệ thống được phân quyền tài khoản Zalo.');
      return;
    }

    setAssignmentAccountId(account.id);
    setAssignPermission('READ');
    setAssignmentModalOpen(true);

    if (users.length === 0) {
      await loadUsers();
    }
    await loadAssignments(account.id);
  };

  const onUpsertAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!isSystemAdmin) {
      setErrorMessage('Chỉ ADMIN hệ thống được phân quyền tài khoản Zalo.');
      return;
    }
    if (!assignmentAccountId || !assignUserId) {
      setErrorMessage('Vui lòng chọn tài khoản và nhân sự cần phân quyền.');
      return;
    }

    try {
      setIsSavingAssignment(true);
      await apiRequest(`/zalo/accounts/${assignmentAccountId}/assignments/${encodeURIComponent(assignUserId)}`, {
        method: 'PUT',
        body: {
          permissionLevel: assignPermission
        }
      });
      setResultMessage('Đã cập nhật phân quyền tài khoản Zalo.');
      await loadAssignments(assignmentAccountId);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu phân quyền tài khoản Zalo.');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const onRevokeAssignment = async (userId: string) => {
    clearNotice();

    if (!isSystemAdmin) {
      setErrorMessage('Chỉ ADMIN hệ thống được thu hồi phân quyền.');
      return;
    }
    if (!assignmentAccountId) {
      setErrorMessage('Vui lòng chọn tài khoản trước khi thu hồi.');
      return;
    }
    if (!window.confirm(`Thu hồi quyền tài khoản này của ${userLabelMap.get(userId) || userId}?`)) {
      return;
    }

    try {
      await apiRequest(`/zalo/accounts/${assignmentAccountId}/assignments/${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      setResultMessage('Đã thu hồi phân quyền tài khoản Zalo.');
      await loadAssignments(assignmentAccountId);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thu hồi phân quyền.');
    }
  };

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench" data-testid="zalo-automation-accounts-workbench">
      <header className="module-header">
        <div>
          <h1>Tài khoản Zalo Automation</h1>
          <p>Quản lý tài khoản, phân quyền vận hành, đăng nhập QR realtime và đồng bộ danh bạ theo số điện thoại.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/zalo-automation/messages">
              Mở trang Tin nhắn
            </Link>
            <Link className="btn btn-ghost" href="/modules/zalo-automation/ai-runs">
              Mở AI đánh giá & Phiên chạy
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại
            </button>
          </div>
        </div>
        <ul>
          <li>Hỗ trợ phân quyền account theo mức READ/CHAT/ADMIN.</li>
          <li>Đồng bộ danh bạ chỉ cho contact có số điện thoại hợp lệ.</li>
          <li>Xóa mềm tài khoản giữ nguyên lịch sử hội thoại để audit.</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="crm-grid crm-grid-single">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Danh sách tài khoản Zalo</h2>
            <Badge variant={statusToBadge('active')}>Tổng: {accounts.length}</Badge>
          </div>

          <div className="zalo-account-filter-toolbar">
            <div className="filter-grid zalo-account-filter-grid">
              <div className="field">
                <label htmlFor="zalo-account-filter-q">Tìm kiếm tài khoản</label>
                <input
                  id="zalo-account-filter-q"
                  value={accountFilterQ}
                  onChange={(event) => setAccountFilterQ(event.target.value)}
                  placeholder="Tên hiển thị, UID, owner..."
                />
              </div>
              <div className="field">
                <label htmlFor="zalo-account-filter-type">Loại tài khoản</label>
                <select
                  id="zalo-account-filter-type"
                  value={accountFilterType}
                  onChange={(event) => setAccountFilterType(event.target.value as ZaloAccountType | 'ALL')}
                >
                  <option value="ALL">Tất cả</option>
                  {ACCOUNT_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {accountTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canCreate ? (
              <button
                type="button"
                className="btn btn-primary"
                data-testid="zalo-open-create-account-modal"
                onClick={() => void onOpenCreateAccountModal()}
              >
                Tạo tài khoản
              </button>
            ) : null}
          </div>

          {isLoadingAccounts ? <p className="muted">Đang tải tài khoản Zalo...</p> : null}
          {!isLoadingAccounts && filteredAccounts.length === 0 ? <p className="muted">Chưa có tài khoản phù hợp.</p> : null}

          {filteredAccounts.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Zalo UID</th>
                    <th>SĐT</th>
                    <th>Trạng thái</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => {
                    return (
                      <tr key={account.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{account.displayName || account.id}</div>
                          <div className="muted" style={{ marginTop: '0.25rem' }}>
                            {accountTypeLabel(account.accountType)} • Owner: {account.ownerUserId || '--'}
                          </div>
                        </td>
                        <td>{account.zaloUid || '--'}</td>
                        <td>{account.phone || '--'}</td>
                        <td>
                          <Badge variant={statusToBadge(account.status)}>{account.status || '--'}</Badge>
                          {account.accountType === 'PERSONAL' ? (
                            <div style={{ marginTop: '0.35rem' }}>
                              <Badge variant={account.aiAutoReplyEnabled ? 'success' : 'neutral'}>
                                AI: {account.aiAutoReplyEnabled ? 'ON' : 'OFF'}
                              </Badge>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="action-buttons">
                            {isSystemAdmin ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void onOpenAssignmentModal(account)}
                              >
                                Phân quyền
                              </button>
                            ) : null}
                            {canUpdate ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                data-testid={`zalo-account-edit-display-name-${account.id}`}
                                onClick={() => onOpenDisplayNameModal(account)}
                              >
                                Sửa tên hiển thị
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void onToggleAutoReply(account, !Boolean(account.aiAutoReplyEnabled))}
                              disabled={account.accountType !== 'PERSONAL' || togglingAutoReplyAccountId === account.id}
                            >
                              {togglingAutoReplyAccountId === account.id
                                ? 'Đang cập nhật...'
                                : (account.aiAutoReplyEnabled ? 'Tắt AI auto-reply' : 'Bật AI auto-reply')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void onSyncContacts(account)}
                              disabled={syncingAccountId === account.id || account.accountType !== 'PERSONAL'}
                            >
                              {syncingAccountId === account.id ? 'Đang sync...' : 'Sync danh bạ'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void startQrFlow(account, 'login')}
                              disabled={account.accountType !== 'PERSONAL'}
                            >
                              Login QR
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void startQrFlow(account, 'reconnect')}
                              disabled={account.accountType !== 'PERSONAL'}
                            >
                              Reconnect
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void onDisconnect(account)}
                              disabled={account.accountType !== 'PERSONAL'}
                            >
                              Disconnect
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => void onSoftDelete(account)}
                              disabled={!canDelete}
                            >
                              Xóa mềm
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

      <Modal
        open={createAccountModalOpen}
        onClose={() => setCreateAccountModalOpen(false)}
        title="Tạo tài khoản Zalo mới"
        maxWidth="640px"
      >
        <form className="form-grid" onSubmit={onCreateAccount}>
          <div className="field">
            <label htmlFor="zalo-create-account-type">Loại tài khoản</label>
            <select
              id="zalo-create-account-type"
              value={createAccountForm.accountType}
              onChange={(event) =>
                setCreateAccountForm((prev) => ({ ...prev, accountType: event.target.value as ZaloAccountType }))
              }
              required
            >
              {ACCOUNT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {accountTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="zalo-create-display-name">Tên hiển thị</label>
            <input
              id="zalo-create-display-name"
              value={createAccountForm.displayName}
              onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, displayName: event.target.value }))}
              placeholder="zalo1"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="zalo-create-phone">Số điện thoại</label>
            <input
              id="zalo-create-phone"
              value={createAccountForm.phone}
              onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="0909..."
              required
            />
          </div>
          {isSystemAdmin ? (
            <div className="field">
              <label htmlFor="zalo-create-owner">Chủ sở hữu</label>
              <select
                id="zalo-create-owner"
                value={createAccountForm.ownerUserId}
                onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
              >
                <option value="">Mặc định: người đăng nhập hiện tại</option>
                {ownerSelectionOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.employee?.fullName || user.email} ({user.role ?? 'USER'})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCreateAccountModalOpen(false)}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Tạo tài khoản
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={displayNameModalOpen}
        onClose={closeDisplayNameModal}
        title="Sửa tên hiển thị tài khoản"
        maxWidth="560px"
      >
        <form className="form-grid" onSubmit={onSaveDisplayName}>
          <p className="muted">
            Thay đổi này chỉ lưu trong ERP để tiện vận hành, không đổi tên trên nick Zalo thật.
          </p>
          <p className="muted">
            Tài khoản: {editingAccount?.displayName || editingAccount?.zaloUid || editingAccount?.id || '--'}
          </p>
          <div className="field">
            <label htmlFor="zalo-edit-display-name">Tên hiển thị trong ERP</label>
            <input
              id="zalo-edit-display-name"
              value={editingDisplayName}
              onChange={(event) => setEditingDisplayName(event.target.value)}
              placeholder="Nhập tên hiển thị mới"
              required
            />
          </div>
          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeDisplayNameModal}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSavingDisplayName}
              data-testid="zalo-save-display-name"
            >
              {isSavingDisplayName ? 'Đang lưu...' : 'Lưu tên hiển thị'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={qrModalOpen}
        onClose={() => {
          if (qrAccountSubscriptionId) {
            const socket = getZaloAutomationSocket();
            socket?.emit('zalo:unsubscribe', { accountId: qrAccountSubscriptionId });
          }
          setQrModalOpen(false);
          setQrState(null);
          setQrAccountSubscriptionId('');
        }}
        title="Đăng nhập QR tài khoản Zalo"
        maxWidth="680px"
        footer={(
          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (qrState?.accountId) {
                  const account = accounts.find((item) => item.id === qrState.accountId);
                  if (account) {
                    void startQrFlow(account, 'login');
                  }
                }
              }}
              disabled={!qrState?.accountId}
            >
              Làm mới QR
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setQrModalOpen(false)}
            >
              Đóng
            </button>
          </div>
        )}
      >
        <div className="zalo-qr-modal-grid">
          <div className="panel-surface">
            <h3>QR đăng nhập</h3>
            {qrState?.qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrState.qrImage} alt="QR đăng nhập Zalo" className="zalo-qr-image" />
            ) : (
              <p className="muted">Chưa nhận được ảnh QR realtime. Vui lòng đợi vài giây...</p>
            )}
          </div>
          <div className="panel-surface">
            <h3>Trạng thái realtime</h3>
            <p className="muted">Account: {qrState?.accountId || '--'}</p>
            <p className="muted">Display name: {qrState?.displayName || '--'}</p>
            <p>{qrState?.statusText || 'Đang chờ...'}</p>
            {qrState?.error ? <p className="banner banner-error">{qrState.error}</p> : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false);
          setAssignmentAccountId('');
          setAssignments([]);
        }}
        title="Phân quyền tài khoản Zalo"
        maxWidth="880px"
        footer={(
          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (assignmentAccountId) {
                  void loadAssignments(assignmentAccountId);
                }
              }}
              disabled={!assignmentAccountId || !isSystemAdmin}
            >
              Tải lại phân quyền
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAssignmentModalOpen(false)}
            >
              Đóng
            </button>
          </div>
        )}
      >
        <div className="form-grid">
          <p className="muted">
            Tài khoản: {assignmentAccount?.displayName || assignmentAccount?.zaloUid || assignmentAccount?.id || '--'}
          </p>
          <p className="muted">
            Trạng thái:{' '}
            <Badge variant={statusToBadge(assignmentAccount?.status)}>{assignmentAccount?.status || '--'}</Badge>
          </p>
          <p className="muted">
            Quyền của bạn:{' '}
            <Badge variant={permissionToBadge(assignmentAccount?.currentPermissionLevel)}>
              {assignmentAccount?.currentPermissionLevel || '--'}
            </Badge>
          </p>

          {isSystemAdmin ? (
            <form className="form-grid" onSubmit={onUpsertAssignment}>
              <h3>Cấp quyền cho nhân sự</h3>
              <div className="field">
                <label htmlFor="zalo-assignment-user">Nhân sự</label>
                <select
                  id="zalo-assignment-user"
                  value={assignUserId}
                  onChange={(event) => setAssignUserId(event.target.value)}
                  disabled={isLoadingUsers}
                >
                  {users.length === 0 ? <option value="">-- chưa có dữ liệu --</option> : null}
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.employee?.fullName || user.email} ({user.role || 'USER'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="zalo-assignment-permission">Mức quyền</label>
                <select
                  id="zalo-assignment-permission"
                  value={assignPermission}
                  onChange={(event) => setAssignPermission(event.target.value as ZaloPermissionLevel)}
                >
                  {PERMISSION_OPTIONS.map((permission) => (
                    <option key={permission} value={permission}>
                      {permission}
                    </option>
                  ))}
                </select>
              </div>
              <div className="action-buttons">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!assignmentAccountId || !assignUserId || isSavingAssignment}
                  data-testid="zalo-assignment-save"
                >
                  {isSavingAssignment ? 'Đang lưu...' : 'Gán quyền'}
                </button>
              </div>
            </form>
          ) : (
            <p className="banner banner-info">Chỉ ADMIN hệ thống được quản trị assignment tài khoản Zalo.</p>
          )}

          {isLoadingUsers ? <p className="muted">Đang tải danh sách nhân sự...</p> : null}
          {isLoadingAssignments ? <p className="muted">Đang tải danh sách phân quyền...</p> : null}
          {!isLoadingAssignments && isSystemAdmin && assignments.length === 0 ? (
            <p className="muted">Chưa có phân quyền nào cho tài khoản này.</p>
          ) : null}

          {isSystemAdmin && assignments.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhân sự</th>
                    <th>Quyền</th>
                    <th>Gán bởi</th>
                    <th>Thời điểm gán</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{userLabelMap.get(assignment.userId) || assignment.userId}</td>
                      <td>
                        <Badge variant={permissionToBadge(assignment.permissionLevel)}>{assignment.permissionLevel}</Badge>
                      </td>
                      <td>{assignment.assignedBy || '--'}</td>
                      <td>{toDateTime(assignment.assignedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void onRevokeAssignment(assignment.userId)}
                        >
                          Thu hồi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Modal>
    </article>
  );
}
