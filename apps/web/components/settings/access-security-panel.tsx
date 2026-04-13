import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import * as DomainConfigModule from '../settings-center/domain-config';
import { parseFiniteNumber } from '../../lib/form-validation';

const {
  POSITION_STATUS_OPTIONS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_KEYS,
  IAM_SCOPE_MODE_OPTIONS,
  MODULE_OPTIONS,
  formatDateTime
} = DomainConfigModule;

export type PermissionEffectValue = 'ALLOW' | 'DENY';
export type IamScopeMode = 'SELF' | 'SUBTREE' | 'ALL';
export type PermissionActionKey = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';

export interface PositionForm {
  id?: string;
  title: string;
  code: string;
  level: string;
  status: string;
}

export interface IamScopeOverrideForm {
  scopeMode: IamScopeMode;
  rootOrgUnitId: string;
  reason: string;
}

export interface IamTitleScopeForm {
  titlePattern: string;
  scopeMode: IamScopeMode;
  priority: number;
  reason: string;
}

export interface IamMismatchFilter {
  moduleKey: string;
  action: '' | PermissionActionKey;
  limit: number;
}

export interface PermissionMatrix {
  [module: string]: Record<string, PermissionEffectValue | undefined>;
}

interface AccessSecurityPanelProps {
  canManagePositionCatalog: boolean;
  canManageIamAdmin: boolean;
  busy: boolean;
  showPositionForm: boolean;
  positionFormMode: 'create' | 'edit';
  positionForm: PositionForm;
  setPositionForm: Dispatch<SetStateAction<PositionForm>>;
  handleOpenCreatePosition: () => void;
  handleCancelPositionForm: () => void;
  handleSubmitPositionForm: () => void;
  positionSearch: string;
  setPositionSearch: Dispatch<SetStateAction<string>>;
  filteredPositions: any[];
  positions: any[];
  handleOpenEditPosition: (item: any) => void;
  handleDeletePosition: (item: any) => Promise<void>;
  selectedOverrideUserId: string;
  setSelectedOverrideUserId: Dispatch<SetStateAction<string>>;
  iamUsers: any[];
  overrideMatrix: PermissionMatrix;
  setOverrideMatrix: Dispatch<SetStateAction<PermissionMatrix>>;
  handleSaveUserOverrides: () => void;
  iamScopeOverrideForm: IamScopeOverrideForm;
  setIamScopeOverrideForm: Dispatch<SetStateAction<IamScopeOverrideForm>>;
  orgUnitOptions: any[];
  handleSaveIamScopeOverride: () => Promise<void>;
  iamTitleScopeForm: IamTitleScopeForm;
  setIamTitleScopeForm: Dispatch<SetStateAction<IamTitleScopeForm>>;
  handleUpsertIamTitleScopeMapping: (isDelete: boolean) => Promise<void>;
  iamMismatchFilter: IamMismatchFilter;
  setIamMismatchFilter: Dispatch<SetStateAction<IamMismatchFilter>>;
  loadIamMismatchReport: () => Promise<void>;
  iamMismatchBusy: boolean;
  iamMismatchReport: any;
  updateMatrixCell: (setter: any, module: string, action: string, value: any) => void;
}

export function AccessSecurityPanel({
  canManagePositionCatalog,
  canManageIamAdmin,
  busy,
  showPositionForm,
  positionFormMode,
  positionForm,
  setPositionForm,
  handleOpenCreatePosition,
  handleCancelPositionForm,
  handleSubmitPositionForm,
  positionSearch,
  setPositionSearch,
  filteredPositions,
  positions,
  handleOpenEditPosition,
  handleDeletePosition,
  selectedOverrideUserId,
  setSelectedOverrideUserId,
  iamUsers,
  overrideMatrix,
  setOverrideMatrix,
  handleSaveUserOverrides,
  iamScopeOverrideForm,
  setIamScopeOverrideForm,
  orgUnitOptions,
  handleSaveIamScopeOverride,
  iamTitleScopeForm,
  setIamTitleScopeForm,
  handleUpsertIamTitleScopeMapping,
  iamMismatchFilter,
  setIamMismatchFilter,
  loadIamMismatchReport,
  iamMismatchBusy,
  iamMismatchReport,
  updateMatrixCell
}: AccessSecurityPanelProps) {
  return (
    <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Trung tâm cấu hình vị trí và phân quyền</h4>
      <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Quản trị tập trung danh sách vị trí, số nhân sự theo vị trí và ma trận quyền chi tiết theo từng hành động.
      </p>

      <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.65rem' }}>
        <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.82rem' }}>Danh sách vị trí công việc</strong>
            <div style={{ display: 'inline-flex', gap: '0.45rem' }}>
              {canManagePositionCatalog ? (
                <button type="button" className="btn btn-primary" onClick={handleOpenCreatePosition} disabled={busy}>
                  Thêm vị trí
                </button>
              ) : (
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Chỉ ADMIN được thêm/sửa/xóa vị trí.</span>
              )}
            </div>
          </div>

          {showPositionForm && (
            <div style={{ marginTop: '0.55rem', border: '1px dashed #dbe9df', borderRadius: '8px', padding: '0.55rem' }}>
              <strong style={{ fontSize: '0.82rem' }}>
                {positionFormMode === 'create' ? 'Thêm vị trí mới' : 'Cập nhật vị trí'}
              </strong>
              <div className="form-grid" style={{ marginTop: '0.45rem' }}>
                <div className="field">
                  <label>Tên vị trí</label>
                  <input
                    value={positionForm.title}
                    onChange={(event) => setPositionForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Ví dụ: Trưởng phòng kinh doanh"
                  />
                </div>
                <div className="field">
                  <label>Mã vị trí</label>
                  <input
                    value={positionForm.code}
                    onChange={(event) => setPositionForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="SALES_MANAGER"
                  />
                </div>
                <div className="field">
                  <label>Cấp vị trí</label>
                  <input
                    value={positionForm.level}
                    onChange={(event) => setPositionForm((current) => ({ ...current, level: event.target.value }))}
                    placeholder="LEAD / SENIOR / JUNIOR"
                  />
                </div>
                <div className="field">
                  <label>Trạng thái</label>
                  <select
                    value={positionForm.status}
                    onChange={(event) => setPositionForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    {POSITION_STATUS_OPTIONS.map((item) => (
                      <option key={`position-status-${item.value}`} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '0.45rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={handleCancelPositionForm} disabled={busy}>
                  Hủy
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSubmitPositionForm} disabled={busy}>
                  {positionFormMode === 'create' ? 'Thêm vị trí' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.55rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <input
              style={{ maxWidth: '320px' }}
              value={positionSearch}
              onChange={(event) => setPositionSearch(event.target.value)}
              placeholder="Tìm vị trí theo tên/mã/cấp..."
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              {filteredPositions.length}/{positions.length} vị trí
            </span>
          </div>

          <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vị trí</th>
                  <th>Mã</th>
                  <th>Cấp</th>
                  <th>Bộ phận</th>
                  <th>Nhân sự</th>
                  <th>Rule quyền</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ color: 'var(--muted)' }}>
                      Chưa có vị trí nào.
                    </td>
                  </tr>
                ) : (
                  filteredPositions.map((item) => (
                    <tr key={`position-row-${item.id}`}>
                      <td>
                        <Link
                          href={`/modules/settings/positions/${item.id}`}
                          className="btn btn-ghost"
                          style={{ padding: 0, minHeight: 'unset' }}
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td>{item.code || '--'}</td>
                      <td>{item.level || '--'}</td>
                      <td>{item.departmentName || '--'}</td>
                      <td>{item.employeeCount.toLocaleString('vi-VN')}</td>
                      <td>{item.permissionRuleCount.toLocaleString('vi-VN')}</td>
                      <td>{item.status}</td>
                      <td>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleOpenEditPosition(item)}
                            disabled={!canManagePositionCatalog || busy}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void handleDeletePosition(item)}
                            disabled={!canManagePositionCatalog || busy || item.employeeCount > 0}
                            title={item.employeeCount > 0 ? 'Không thể xóa vì đang có nhân sự.' : 'Xóa vị trí'}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
          <strong style={{ fontSize: '0.82rem' }}>Chi tiết vị trí mở trên trang riêng</strong>
          <p style={{ marginTop: '0.45rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Bấm vào tên vị trí để mở trang chi tiết riêng với 2 tab:
            {' '}
            <strong>Chi tiết quyền</strong>
            {' '}
            và
            {' '}
            <strong>Danh sách nhân viên</strong>
            . Cách này giúp không cần kéo xuống trong màn hình dài.
          </p>
        </div>

        <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <strong style={{ fontSize: '0.82rem' }}>Override theo user</strong>
            <select
              value={selectedOverrideUserId}
              onChange={(event) => setSelectedOverrideUserId(event.target.value)}
              style={{ minWidth: '220px' }}
            >
              <option value="">-- Chọn user --</option>
              {iamUsers.map((item) => {
                const id = String(item.id ?? '');
                const email = String(item.email ?? '');
                return (
                  <option key={`override-user-${id}`} value={id}>
                    {email || id}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={`override-action-${action}`}>{action}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULE_KEYS.map((moduleKey) => (
                  <tr key={`override-module-${moduleKey}`}>
                    <td>{moduleKey}</td>
                    {PERMISSION_ACTIONS.map((action) => (
                      <td key={`override-${moduleKey}-${action}`}>
                        <select
                          value={overrideMatrix[moduleKey]?.[action] ?? ''}
                          onChange={(event) => updateMatrixCell(setOverrideMatrix, moduleKey, action, event.target.value as PermissionEffectValue)}
                        >
                          <option value="">--</option>
                          <option value="ALLOW">ALLOW</option>
                          <option value="DENY">DENY</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '0.55rem' }}
            onClick={handleSaveUserOverrides}
            disabled={busy || !selectedOverrideUserId}
          >
            Lưu override theo user
          </button>
        </div>

        {canManageIamAdmin ? (
          <div
            data-testid="iam-scope-override-editor"
            style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}
          >
            <strong style={{ fontSize: '0.82rem' }}>IAM v2 scope override + shadow mismatch</strong>
            <p style={{ marginTop: '0.35rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
              Quản trị scope theo user, title scope mapping, và theo dõi mismatch giữa legacy và IAM v2.
            </p>

            <div className="form-grid" style={{ marginTop: '0.45rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className="field">
                <label>User scope override</label>
                <select
                  value={selectedOverrideUserId}
                  onChange={(event) => setSelectedOverrideUserId(event.target.value)}
                >
                  <option value="">-- Chọn user --</option>
                  {iamUsers.map((item) => {
                    const id = String(item.id ?? '');
                    const email = String(item.email ?? '');
                    return (
                      <option key={`scope-user-${id}`} value={id}>
                        {email || id}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="field">
                <label>Scope mode</label>
                <select
                  value={iamScopeOverrideForm.scopeMode}
                  onChange={(event) =>
                    setIamScopeOverrideForm((current) => ({
                      ...current,
                      scopeMode: event.target.value as IamScopeMode
                    }))
                  }
                >
                  {IAM_SCOPE_MODE_OPTIONS.map((item) => (
                    <option key={`scope-mode-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Root org unit (optional)</label>
                <select
                  value={iamScopeOverrideForm.rootOrgUnitId}
                  onChange={(event) =>
                    setIamScopeOverrideForm((current) => ({
                      ...current,
                      rootOrgUnitId: event.target.value
                    }))
                  }
                >
                  <option value="">-- Không chọn --</option>
                  {orgUnitOptions.map((item) => (
                    <option key={`scope-org-${item.id}`} value={item.id}>
                      {item.name} ({item.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Lý do</label>
                <input
                  value={iamScopeOverrideForm.reason}
                  onChange={(event) =>
                    setIamScopeOverrideForm((current) => ({
                      ...current,
                      reason: event.target.value
                    }))
                  }
                  placeholder="Điều chỉnh phạm vi theo vị trí"
                />
              </div>
            </div>

            <div style={{ marginTop: '0.45rem', display: 'inline-flex', gap: '0.45rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void handleSaveIamScopeOverride()}
                disabled={busy || !selectedOverrideUserId}
              >
                Lưu scope override
              </button>
            </div>

            <div style={{ marginTop: '0.65rem', borderTop: '1px dashed #dbe9df', paddingTop: '0.6rem' }}>
              <strong style={{ fontSize: '0.8rem' }}>Title scope mapping</strong>
              <div className="form-grid" style={{ marginTop: '0.45rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div className="field">
                  <label>Title pattern</label>
                  <input
                    value={iamTitleScopeForm.titlePattern}
                    onChange={(event) =>
                      setIamTitleScopeForm((current) => ({
                        ...current,
                        titlePattern: event.target.value
                      }))
                    }
                    placeholder="VD: TRUONG PHONG"
                  />
                </div>
                <div className="field">
                  <label>Scope mode</label>
                  <select
                    value={iamTitleScopeForm.scopeMode}
                    onChange={(event) =>
                      setIamTitleScopeForm((current) => ({
                        ...current,
                        scopeMode: event.target.value as IamScopeMode
                      }))
                    }
                  >
                    {IAM_SCOPE_MODE_OPTIONS.map((item) => (
                      <option key={`title-scope-mode-${item.value}`} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Priority</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={iamTitleScopeForm.priority}
                    onChange={(event) =>
                      setIamTitleScopeForm((current) => ({
                        ...current,
                        priority: (() => {
                          const parsed = parseFiniteNumber(event.target.value);
                          if (parsed === null) {
                            return 0;
                          }
                          if (parsed < 0) {
                            return 0;
                          }
                          if (parsed > 10_000) {
                            return 10_000;
                          }
                          return Math.trunc(parsed);
                        })()
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Lý do</label>
                  <input
                    value={iamTitleScopeForm.reason}
                    onChange={(event) =>
                      setIamTitleScopeForm((current) => ({
                        ...current,
                        reason: event.target.value
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ marginTop: '0.45rem', display: 'inline-flex', gap: '0.45rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleUpsertIamTitleScopeMapping(false)}
                  disabled={busy || !iamTitleScopeForm.titlePattern.trim()}
                >
                  Lưu title mapping
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleUpsertIamTitleScopeMapping(true)}
                  disabled={busy || !iamTitleScopeForm.titlePattern.trim()}
                >
                  Xóa title mapping
                </button>
              </div>
            </div>

            <div style={{ marginTop: '0.65rem', borderTop: '1px dashed #dbe9df', paddingTop: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.8rem' }}>IAM v2 mismatch report</strong>
                <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                  <select
                    value={iamMismatchFilter.moduleKey}
                    onChange={(event) =>
                      setIamMismatchFilter((current) => ({
                        ...current,
                        moduleKey: event.target.value
                      }))
                    }
                  >
                    <option value="">Tất cả module</option>
                    {MODULE_OPTIONS.map((item) => (
                      <option key={`mismatch-module-${item.value}`} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={iamMismatchFilter.action}
                    onChange={(event) =>
                      setIamMismatchFilter((current) => ({
                        ...current,
                        action: event.target.value as '' | PermissionActionKey
                      }))
                    }
                  >
                    <option value="">Tất cả action</option>
                    {PERMISSION_ACTIONS.map((action) => (
                      <option key={`mismatch-action-${action}`} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void loadIamMismatchReport()}
                    disabled={iamMismatchBusy}
                  >
                    {iamMismatchBusy ? 'Đang tải...' : 'Làm mới report'}
                  </button>
                </div>
              </div>

              <p style={{ marginTop: '0.3rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                Tổng mismatch: {iamMismatchReport?.totalMismatches ?? 0} · Nhóm: {iamMismatchReport?.totalGroups ?? 0} · Cập nhật: {formatDateTime(iamMismatchReport?.generatedAt)}
              </p>

              <div className="table-wrap" style={{ marginTop: '0.45rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Action</th>
                      <th>Mismatch</th>
                      <th>Legacy ALLOW</th>
                      <th>IAM ALLOW</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(iamMismatchReport?.items?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--muted)' }}>
                          Chưa có mismatch nào trong bộ nhớ runtime.
                        </td>
                      </tr>
                    ) : (
                      iamMismatchReport?.items.map((item: any) => (
                        <tr key={`mismatch-${item.moduleKey}-${item.action}`}>
                          <td>{item.moduleKey}</td>
                          <td>{item.action}</td>
                          <td>{item.mismatchCount?.toLocaleString('vi-VN')}</td>
                          <td>{item.legacyAllowCount?.toLocaleString('vi-VN')}</td>
                          <td>{item.iamAllowCount?.toLocaleString('vi-VN')}</td>
                          <td>{formatDateTime(item.lastSeenAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div
            data-testid="iam-scope-override-editor-readonly"
            style={{ border: '1px dashed #dbe9df', borderRadius: '8px', padding: '0.55rem', color: 'var(--muted)' }}
          >
            Chỉ tài khoản có quyền quản trị IAM mới truy cập editor scope override.
          </div>
        )}
      </div>
    </section>
  );
}
