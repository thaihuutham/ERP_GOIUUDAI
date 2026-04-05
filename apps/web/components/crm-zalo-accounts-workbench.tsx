'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { formatRuntimeDateTime } from '../lib/runtime-format';
import { useAccessPolicy } from './access-policy-context';
import { useUserRole } from './user-role-context';
import { Badge, type BadgeVariant, statusToBadge } from './ui';

type ZaloPermissionLevel = 'READ' | 'CHAT' | 'ADMIN';
type ZaloAccountType = 'PERSONAL' | 'OA';

type ZaloAccount = {
  id: string;
  accountType?: ZaloAccountType | null;
  displayName?: string | null;
  zaloUid?: string | null;
  phone?: string | null;
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
  revokedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
  zaloUid: string;
  phone: string;
  ownerUserId: string;
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

export function CrmZaloAccountsWorkbench() {
  const { canModule, canAction } = useAccessPolicy();
  const { role } = useUserRole();
  const canView = canModule('crm');
  const canCreate = canAction('crm', 'CREATE');
  const isSystemAdmin = role === 'ADMIN';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignments, setAssignments] = useState<ZaloAccountAssignment[]>([]);

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  const [accountFilterQ, setAccountFilterQ] = useState('');
  const [accountFilterType, setAccountFilterType] = useState<ZaloAccountType | 'ALL'>('ALL');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const [createAccountForm, setCreateAccountForm] = useState<CreateAccountForm>({
    accountType: 'PERSONAL',
    displayName: '',
    zaloUid: '',
    phone: '',
    ownerUserId: ''
  });

  const [assignUserId, setAssignUserId] = useState('');
  const [assignPermission, setAssignPermission] = useState<ZaloPermissionLevel>('READ');

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
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
      const tokens = [account.displayName, account.zaloUid, account.phone, account.ownerUserId, account.id]
        .map((item) => String(item ?? '').toLowerCase());
      return tokens.some((item) => item.includes(q));
    });
  }, [accounts, accountFilterQ, accountFilterType]);

  const userLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      const label = `${user.employee?.fullName || user.email} (${user.role ?? 'USER'})`;
      map.set(user.id, label);
    }
    return map;
  }, [users]);

  const clearNotice = () => {
    setErrorMessage(null);
    setResultMessage(null);
  };

  const loadAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const payload = await apiRequest<ZaloAccount[]>('/zalo/accounts', {
        query: { accountType: 'ALL' }
      });
      const rows = (normalizeListPayload(payload) as ZaloAccount[]).map((row) => ({
        ...row,
        currentPermissionLevel: normalizePermission(row.currentPermissionLevel ?? null)
      }));
      setAccounts(rows);
      setSelectedAccountId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? '';
      });
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
    if (!canView || !selectedAccountId) {
      setAssignments([]);
      return;
    }
    void loadAssignments(selectedAccountId);
  }, [canView, selectedAccountId, isSystemAdmin]);

  const onCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!canCreate) {
      setErrorMessage('Vai trò hiện tại không có quyền tạo tài khoản Zalo.');
      return;
    }

    try {
      await apiRequest('/zalo/accounts', {
        method: 'POST',
        body: {
          accountType: createAccountForm.accountType,
          displayName: createAccountForm.displayName.trim() || undefined,
          zaloUid: createAccountForm.zaloUid.trim() || undefined,
          phone: createAccountForm.phone.trim() || undefined,
          ownerUserId: createAccountForm.ownerUserId.trim() || undefined
        }
      });

      setCreateAccountForm((prev) => ({
        ...prev,
        displayName: '',
        zaloUid: '',
        phone: '',
        ownerUserId: ''
      }));
      setResultMessage('Đã tạo tài khoản Zalo mới.');
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể tạo tài khoản Zalo.');
    }
  };

  const onPersonalAction = async (action: 'login' | 'reconnect' | 'disconnect') => {
    clearNotice();
    if (!selectedAccount) {
      setErrorMessage('Vui lòng chọn tài khoản trước khi thao tác.');
      return;
    }
    if (selectedAccount.accountType !== 'PERSONAL') {
      setErrorMessage('Chỉ tài khoản Zalo cá nhân mới có thao tác đăng nhập/reconnect/disconnect.');
      return;
    }

    const endpoint =
      action === 'login'
        ? `/zalo/accounts/${selectedAccount.id}/personal/login`
        : action === 'reconnect'
          ? `/zalo/accounts/${selectedAccount.id}/personal/reconnect`
          : `/zalo/accounts/${selectedAccount.id}/personal/disconnect`;

    try {
      await apiRequest(endpoint, { method: 'POST' });
      const actionLabel = action === 'login' ? 'khởi tạo đăng nhập QR' : action === 'reconnect' ? 'khởi tạo reconnect' : 'ngắt kết nối';
      setResultMessage(`Đã ${actionLabel} cho tài khoản ${selectedAccount.displayName || selectedAccount.id}.`);
      await loadAccounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thao tác tài khoản.');
    }
  };

  const onUpsertAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotice();

    if (!isSystemAdmin) {
      setErrorMessage('Chỉ ADMIN hệ thống được phân quyền tài khoản Zalo.');
      return;
    }
    if (!selectedAccountId || !assignUserId) {
      setErrorMessage('Vui lòng chọn tài khoản và nhân sự cần phân quyền.');
      return;
    }

    try {
      await apiRequest(`/zalo/accounts/${selectedAccountId}/assignments/${encodeURIComponent(assignUserId)}`, {
        method: 'PUT',
        body: {
          permissionLevel: assignPermission
        }
      });
      setResultMessage('Đã cập nhật phân quyền tài khoản Zalo.');
      await loadAssignments(selectedAccountId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể lưu phân quyền tài khoản Zalo.');
    }
  };

  const onRevokeAssignment = async (userId: string) => {
    clearNotice();

    if (!isSystemAdmin) {
      setErrorMessage('Chỉ ADMIN hệ thống được thu hồi phân quyền.');
      return;
    }
    if (!selectedAccountId) {
      setErrorMessage('Vui lòng chọn tài khoản trước khi thu hồi.');
      return;
    }

    if (!window.confirm(`Thu hồi quyền tài khoản này của ${userLabelMap.get(userId) || userId}?`)) {
      return;
    }

    try {
      await apiRequest(`/zalo/accounts/${selectedAccountId}/assignments/${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      setResultMessage('Đã thu hồi phân quyền tài khoản Zalo.');
      await loadAssignments(selectedAccountId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể thu hồi phân quyền.');
    }
  };

  if (!canView) {
    return null;
  }

  return (
    <article className="module-workbench" data-testid="crm-zalo-accounts-workbench">
      <header className="module-header">
        <div>
          <h1>Quản lý tài khoản Zalo</h1>
          <p>Quản trị nhiều tài khoản Zalo, theo dõi trạng thái kết nối và phân quyền cho nhân viên.</p>
          <div className="action-buttons" style={{ marginTop: '0.6rem' }}>
            <Link className="btn btn-ghost" href="/modules/crm/conversations">
              Mở Inbox hội thoại
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => void refreshAll()}>
              Tải lại toàn bộ
            </button>
          </div>
        </div>
        <ul>
          <li>Áp dụng phân quyền `READ/CHAT/ADMIN` theo từng tài khoản Zalo.</li>
          <li>Luôn enforce quyền ở backend; UI chỉ phản ánh rõ ràng cho vận hành.</li>
        </ul>
      </header>

      {errorMessage ? <p className="banner banner-error">{errorMessage}</p> : null}
      {resultMessage ? <p className="banner banner-success">{resultMessage}</p> : null}

      <section className="crm-grid">
        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Danh sách tài khoản Zalo</h2>
            <Badge variant={statusToBadge('active')}>Tổng: {accounts.length}</Badge>
          </div>

          <div className="filter-grid">
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

          {isLoadingAccounts ? <p className="muted">Đang tải tài khoản Zalo...</p> : null}
          {!isLoadingAccounts && filteredAccounts.length === 0 ? <p className="muted">Chưa có tài khoản phù hợp.</p> : null}

          {filteredAccounts.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên tài khoản</th>
                    <th>Loại</th>
                    <th>Trạng thái</th>
                    <th>Owner</th>
                    <th>Quyền hiện tại</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => {
                    const active = account.id === selectedAccountId;
                    return (
                      <tr key={account.id} className={active ? 'table-row-selected' : ''}>
                        <td>
                          <button
                            type="button"
                            className="record-link row-select-trigger"
                            onClick={() => setSelectedAccountId(account.id)}
                          >
                            {account.displayName || account.zaloUid || account.id}
                            <span>Chọn</span>
                          </button>
                          <div className="muted" style={{ marginTop: '0.25rem' }}>
                            UID: {account.zaloUid || '--'} • SĐT: {account.phone || '--'}
                          </div>
                        </td>
                        <td>{accountTypeLabel(account.accountType)}</td>
                        <td>
                          <Badge variant={statusToBadge(account.status)}>{account.status || '--'}</Badge>
                        </td>
                        <td>{account.ownerUserId || '--'}</td>
                        <td>
                          <Badge variant={permissionToBadge(account.currentPermissionLevel)}>
                            {account.currentPermissionLevel || '--'}
                          </Badge>
                        </td>
                        <td>{toDateTime(account.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <section className="panel-surface" style={{ marginTop: '0.8rem' }}>
            <div className="crm-panel-head">
              <h3>Tác vụ tài khoản đang chọn</h3>
              <Badge variant={statusToBadge(selectedAccount?.status)}>{selectedAccount?.status || '--'}</Badge>
            </div>
            <p className="muted">
              Tài khoản: {selectedAccount?.displayName || selectedAccount?.zaloUid || selectedAccount?.id || '--'}
            </p>
            <p className="muted">Loại: {accountTypeLabel(selectedAccount?.accountType)}</p>
            <div className="action-buttons" style={{ marginTop: '0.55rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onPersonalAction('login')}
                disabled={!selectedAccount || selectedAccount.accountType !== 'PERSONAL'}
              >
                Đăng nhập QR
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onPersonalAction('reconnect')}
                disabled={!selectedAccount || selectedAccount.accountType !== 'PERSONAL'}
              >
                Reconnect
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onPersonalAction('disconnect')}
                disabled={!selectedAccount || selectedAccount.accountType !== 'PERSONAL'}
              >
                Disconnect
              </button>
            </div>
          </section>

          {canCreate ? (
            <form className="form-grid" onSubmit={onCreateAccount}>
              <h3>Tạo tài khoản Zalo mới</h3>
              <div className="field">
                <label htmlFor="zalo-create-account-type">Loại tài khoản</label>
                <select
                  id="zalo-create-account-type"
                  value={createAccountForm.accountType}
                  onChange={(event) =>
                    setCreateAccountForm((prev) => ({ ...prev, accountType: event.target.value as ZaloAccountType }))
                  }
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
                  placeholder="OA CSKH Miền Bắc"
                />
              </div>
              <div className="field">
                <label htmlFor="zalo-create-zalo-uid">Zalo UID</label>
                <input
                  id="zalo-create-zalo-uid"
                  value={createAccountForm.zaloUid}
                  onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, zaloUid: event.target.value }))}
                  placeholder="zalo_uid_001"
                />
              </div>
              <div className="field">
                <label htmlFor="zalo-create-phone">Số điện thoại</label>
                <input
                  id="zalo-create-phone"
                  value={createAccountForm.phone}
                  onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="0909..."
                />
              </div>
              <div className="field">
                <label htmlFor="zalo-create-owner">Owner userId</label>
                <input
                  id="zalo-create-owner"
                  value={createAccountForm.ownerUserId}
                  onChange={(event) => setCreateAccountForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
                  placeholder="manager_1"
                />
              </div>
              <div className="action-buttons">
                <button type="submit" className="btn btn-primary">
                  Tạo tài khoản
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="panel-surface crm-panel">
          <div className="crm-panel-head">
            <h2>Phân quyền tài khoản</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => selectedAccountId && void loadAssignments(selectedAccountId)}
              disabled={!selectedAccountId || !isSystemAdmin}
            >
              Tải lại phân quyền
            </button>
          </div>

          <p className="muted">
            Tài khoản đang chọn: {selectedAccount?.displayName || selectedAccount?.zaloUid || selectedAccount?.id || '--'}
          </p>
          <p className="muted" style={{ marginTop: '0.25rem' }}>
            Quyền của bạn trên tài khoản này:{' '}
            <Badge variant={permissionToBadge(selectedAccount?.currentPermissionLevel)}>
              {selectedAccount?.currentPermissionLevel || '--'}
            </Badge>
          </p>

          {!isSystemAdmin ? (
            <p className="banner banner-info" style={{ marginTop: '0.75rem' }}>
              Chỉ ADMIN hệ thống được quản trị assignment. Bạn vẫn có thể xem quyền hiện tại của chính mình.
            </p>
          ) : null}

          {isSystemAdmin ? (
            <form className="form-grid" onSubmit={onUpsertAssignment}>
              <h3>Gán/Cập nhật quyền cho nhân viên</h3>
              <div className="field">
                <label htmlFor="zalo-assignment-user">Nhân viên</label>
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
                  disabled={!selectedAccountId || !assignUserId}
                  data-testid="zalo-assignment-save"
                >
                  Gán quyền
                </button>
              </div>
            </form>
          ) : null}

          {isLoadingUsers ? <p className="muted">Đang tải danh sách nhân sự...</p> : null}
          {isLoadingAssignments ? <p className="muted">Đang tải danh sách phân quyền...</p> : null}
          {!isLoadingAssignments && isSystemAdmin && assignments.length === 0 ? (
            <p className="muted">Chưa có phân quyền nào cho tài khoản này.</p>
          ) : null}

          {isSystemAdmin && assignments.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: '0.6rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
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
        </section>
      </section>
    </article>
  );
}
