import type { Dispatch, SetStateAction } from 'react';
import * as DomainConfigModule from '../settings-center/domain-config';
import type { BulkRowId } from '../../lib/bulk-actions';

const { ROLE_OPTIONS, toRecord } = DomainConfigModule;

export interface AccountForm {
  fullName: string;
  email: string;
  role: string;
  positionId: string;
  orgUnitId: string;
}

interface HrAccountsPanelProps {
  accountForm: AccountForm;
  setAccountForm: Dispatch<SetStateAction<AccountForm>>;
  positionOptions: any[];
  orgUnitOptions: any[];
  handleCreateIamUser: () => void;
  busy: boolean;
  selectedIamUserIds: BulkRowId[];
  setSelectedIamUserIds: Dispatch<SetStateAction<BulkRowId[]>>;
  handleBulkResetIamPassword: () => void;
  iamUsers: any[];
  handleResetIamPassword: (userId: string) => void;
}

export function HrAccountsPanel({
  accountForm,
  setAccountForm,
  positionOptions,
  orgUnitOptions,
  handleCreateIamUser,
  busy,
  selectedIamUserIds,
  setSelectedIamUserIds,
  handleBulkResetIamPassword,
  iamUsers,
  handleResetIamPassword,
}: HrAccountsPanelProps) {
  return (
    <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Tạo nhân viên + tài khoản đăng nhập</h4>
      <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Luồng cấp tài khoản chuẩn. Hệ thống trả mật khẩu tạm và bắt buộc đổi ở lần đăng nhập đầu tiên.
      </p>

      <div className="form-grid" style={{ marginTop: '0.65rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div className="field">
          <label>Họ tên nhân viên</label>
          <input
            value={accountForm.fullName}
            onChange={(event) => setAccountForm((current) => ({ ...current, fullName: event.target.value }))}
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div className="field">
          <label>Email tài khoản</label>
          <input
            value={accountForm.email}
            onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="nguyenvana@company.vn"
          />
        </div>
        <div className="field">
          <label>Vai trò hệ thống</label>
          <select
            value={accountForm.role}
            onChange={(event) => setAccountForm((current) => ({ ...current, role: event.target.value }))}
          >
            {ROLE_OPTIONS.map((item) => (
              <option key={`account-role-${item.value}`} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Vị trí công việc</label>
          <select
            value={accountForm.positionId}
            onChange={(event) => setAccountForm((current) => ({ ...current, positionId: event.target.value }))}
          >
            <option value="">-- Chọn vị trí --</option>
            {positionOptions.map((item) => (
              <option key={`position-${item.id}`} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Org unit</label>
          <select
            value={accountForm.orgUnitId}
            onChange={(event) => setAccountForm((current) => ({ ...current, orgUnitId: event.target.value }))}
          >
            <option value="">-- Chọn đơn vị --</option>
            {orgUnitOptions.map((item) => (
              <option key={`account-org-${item.id}`} value={item.id}>
                {item.name} ({item.type})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="btn btn-primary" onClick={handleCreateIamUser} disabled={busy}>
          Tạo tài khoản nhân viên
        </button>
      </div>

      <div style={{ marginTop: '0.75rem', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.82rem' }}>Danh sách tài khoản IAM</strong>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              Đã chọn {selectedIamUserIds.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedIamUserIds([])}
              disabled={selectedIamUserIds.length === 0 || busy}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleBulkResetIamPassword()}
              disabled={selectedIamUserIds.length === 0 || busy}
            >
              Bulk reset mật khẩu
            </button>
          </div>
        </div>
        {iamUsers.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>Chưa có tài khoản.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        iamUsers.slice(0, 40).length > 0 &&
                        iamUsers.slice(0, 40).every((item) => selectedIamUserIds.includes(String(item.id ?? '')))
                      }
                      onChange={(event) => {
                        const visibleIds = iamUsers.slice(0, 40).map((item) => String(item.id ?? '')).filter(Boolean);
                        setSelectedIamUserIds(event.target.checked ? visibleIds : []);
                      }}
                    />
                  </th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {iamUsers.slice(0, 40).map((item) => {
                  const userId = String(item.id ?? '');
                  const employee = toRecord(item.employee);
                  return (
                    <tr key={`iam-${userId}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIamUserIds.includes(userId)}
                          onChange={(event) =>
                            setSelectedIamUserIds((prev) => {
                              if (event.target.checked) {
                                return prev.includes(userId) ? prev : [...prev, userId];
                              }
                              return prev.filter((id) => String(id) !== userId);
                            })
                          }
                        />
                      </td>
                      <td>{String(item.email ?? '--')}</td>
                      <td>{String(item.role ?? '--')}</td>
                      <td>{String(employee.fullName ?? '--')}</td>
                      <td>{item.mustChangePassword === true ? 'Đổi mật khẩu lần đầu' : 'Đang hoạt động'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void handleResetIamPassword(userId)}
                          disabled={busy}
                        >
                          Reset mật khẩu
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
