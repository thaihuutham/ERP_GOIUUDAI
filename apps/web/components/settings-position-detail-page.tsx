'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest, normalizeListPayload } from '../lib/api-client';
import { useAccessPolicy } from './access-policy-context';

type PermissionActionKey = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';
type PermissionEffectValue = '' | 'ALLOW' | 'DENY';
type PermissionRuleRow = {
  moduleKey: string;
  action: PermissionActionKey;
  effect: 'ALLOW' | 'DENY';
};
type PermissionMatrix = Record<string, Record<PermissionActionKey, PermissionEffectValue>>;

type PositionSummaryItem = {
  id: string;
  code: string;
  title: string;
  level: string;
  status: string;
  departmentName: string;
  employeeCount: number;
  permissionRuleCount: number;
};

type PositionEmployeeItem = {
  id: string;
  code: string;
  fullName: string;
  email: string;
  department: string;
  status: string;
};

const PERMISSION_ACTIONS: PermissionActionKey[] = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'];
const PERMISSION_MODULE_KEYS = [
  'crm',
  'sales',
  'catalog',
  'hr',
  'finance',
  'scm',
  'assets',
  'projects',
  'workflows',
  'reports',
  'audit',
  'settings',
  'notifications',
  'search',
  'integrations'
] as const;

const REASON_TEMPLATES = [
  'Cập nhật ma trận quyền theo vị trí',
  'Điều chỉnh theo thay đổi tổ chức',
  'Rà soát bảo mật định kỳ'
] as const;

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createEmptyPermissionMatrix(): PermissionMatrix {
  return PERMISSION_MODULE_KEYS.reduce<PermissionMatrix>((acc, moduleKey) => {
    const actions = {} as Record<PermissionActionKey, PermissionEffectValue>;
    for (const action of PERMISSION_ACTIONS) {
      actions[action] = '';
    }
    acc[moduleKey] = actions;
    return acc;
  }, {});
}

function mapRulesToMatrix(rules: PermissionRuleRow[]): PermissionMatrix {
  const matrix = createEmptyPermissionMatrix();
  for (const rule of rules) {
    const moduleKey = String(rule.moduleKey ?? '').trim().toLowerCase();
    const action = String(rule.action ?? '').trim().toUpperCase() as PermissionActionKey;
    const effect = String(rule.effect ?? '').trim().toUpperCase() as PermissionEffectValue;
    if (!(moduleKey in matrix)) {
      continue;
    }
    if (!PERMISSION_ACTIONS.includes(action)) {
      continue;
    }
    if (effect !== 'ALLOW' && effect !== 'DENY') {
      continue;
    }
    matrix[moduleKey][action] = effect;
  }
  return matrix;
}

function mapMatrixToRules(matrix: PermissionMatrix): PermissionRuleRow[] {
  const rules: PermissionRuleRow[] = [];
  for (const moduleKey of PERMISSION_MODULE_KEYS) {
    const row = matrix[moduleKey];
    if (!row) {
      continue;
    }
    for (const action of PERMISSION_ACTIONS) {
      const effect = row[action];
      if (effect !== 'ALLOW' && effect !== 'DENY') {
        continue;
      }
      rules.push({
        moduleKey,
        action,
        effect
      });
    }
  }
  return rules;
}

function normalizePositionRows(payload: Record<string, unknown>): PositionSummaryItem[] {
  return normalizeListPayload(payload)
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      code: String(item.code ?? '').trim(),
      title: String(item.title ?? item.name ?? '').trim(),
      level: String(item.level ?? '').trim(),
      status: String(item.status ?? 'ACTIVE').trim(),
      departmentName: String(item.departmentName ?? '').trim(),
      employeeCount: toNumber(item.employeeCount),
      permissionRuleCount: toNumber(item.permissionRuleCount)
    }))
    .filter((item) => item.id && item.title);
}

function normalizePositionEmployees(payload: Record<string, unknown>): PositionEmployeeItem[] {
  return normalizeListPayload(payload)
    .map((item) => {
      const department = toRecord(item.department);
      return {
        id: String(item.id ?? '').trim(),
        code: String(item.code ?? '').trim(),
        fullName: String(item.fullName ?? '').trim(),
        email: String(item.email ?? '').trim(),
        department: String(department.name ?? '').trim(),
        status: String(item.status ?? 'ACTIVE').trim()
      };
    })
    .filter((item) => item.id && item.fullName);
}

export function SettingsPositionDetailPage({ positionId }: { positionId: string }) {
  const { canAction } = useAccessPolicy();
  const [position, setPosition] = useState<PositionSummaryItem | null>(null);
  const [positionMatrix, setPositionMatrix] = useState<PermissionMatrix>(() => createEmptyPermissionMatrix());
  const [positionEmployees, setPositionEmployees] = useState<PositionEmployeeItem[]>([]);
  const [positionEmployeesLoaded, setPositionEmployeesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'permissions' | 'employees'>('permissions');
  const [reasonTemplate, setReasonTemplate] = useState<string>(REASON_TEMPLATES[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [employeesBusy, setEmployeesBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSavePermissions = canAction('settings', 'UPDATE');

  const reason = useMemo(() => {
    const note = reasonNote.trim();
    if (!note) {
      return reasonTemplate;
    }
    return `${reasonTemplate}: ${note}`;
  }, [reasonTemplate, reasonNote]);

  const loadPositionMeta = async () => {
    const payload = await apiRequest<Record<string, unknown>>('/settings/positions', {
      query: { limit: 300 }
    });
    const rows = normalizePositionRows(payload);
    const found = rows.find((item) => item.id === positionId) ?? null;
    setPosition(found);
  };

  const loadPositionPermissions = async () => {
    const payload = await apiRequest<Record<string, unknown>>(`/settings/permissions/positions/${positionId}`);
    const rules = Array.isArray(payload.rules) ? (payload.rules as PermissionRuleRow[]) : [];
    setPositionMatrix(mapRulesToMatrix(rules));
  };

  const loadPositionEmployees = async () => {
    setEmployeesBusy(true);
    try {
      const payload = await apiRequest<Record<string, unknown>>(`/settings/positions/${positionId}/employees`, {
        query: { limit: 300 }
      });
      setPositionEmployees(normalizePositionEmployees(payload));
      setPositionEmployeesLoaded(true);
    } finally {
      setEmployeesBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        await Promise.all([loadPositionMeta(), loadPositionPermissions()]);
      } catch (loadError) {
        if (mounted) {
          const text = loadError instanceof Error ? loadError.message : 'Không tải được chi tiết vị trí.';
          setError(text);
        }
      } finally {
        if (mounted) {
          setBusy(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [positionId]);

  useEffect(() => {
    if (activeTab !== 'employees' || positionEmployeesLoaded) {
      return;
    }
    void loadPositionEmployees().catch((employeeError) => {
      const text = employeeError instanceof Error ? employeeError.message : 'Không tải được danh sách nhân viên.';
      setError(text);
    });
  }, [activeTab, positionEmployeesLoaded]);

  const handleSavePermissions = async () => {
    if (!canSavePermissions) {
      setError('Chỉ ADMIN được phép lưu ma trận quyền.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(`/settings/permissions/positions/${positionId}`, {
        method: 'PUT',
        body: {
          reason,
          rules: mapMatrixToRules(positionMatrix)
        }
      });
      setMessage('Đã lưu ma trận quyền cho vị trí.');
      await loadPositionMeta();
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : 'Lưu ma trận quyền thất bại.';
      setError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 1rem 0' }}>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800 }}>Chi tiết vị trí công việc</h1>
          <p style={{ marginTop: '0.35rem', color: 'var(--muted)' }}>
            Xem và quản lý quyền theo vị trí trên một trang riêng, không cần quay lại màn hình danh sách dài.
          </p>
        </div>
        <Link href="/modules/settings" className="btn btn-ghost">
          Quay lại Trung tâm cấu hình
        </Link>
      </header>

      <section style={{ border: '1px solid #dbe9df', borderRadius: '12px', padding: '0.85rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>{position?.title ?? `Vị trí #${positionId}`}</h3>
            <p style={{ margin: '0.3rem 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
              Mã: {position?.code || '--'} · Cấp: {position?.level || '--'} · Bộ phận: {position?.departmentName || '--'} · Trạng thái: {position?.status || '--'}
            </p>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
              Nhân sự: {position ? position.employeeCount.toLocaleString('vi-VN') : '--'} · Rule quyền: {position ? position.permissionRuleCount.toLocaleString('vi-VN') : '--'}
            </p>
          </div>
          <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'flex-start' }}>
            <button
              type="button"
              className={activeTab === 'permissions' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setActiveTab('permissions')}
            >
              Chi tiết quyền
            </button>
            <button
              type="button"
              className={activeTab === 'employees' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setActiveTab('employees')}
            >
              Danh sách nhân viên
            </button>
          </div>
        </div>

        {activeTab === 'permissions' ? (
          <>
            <div className="table-wrap" style={{ marginTop: '0.65rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    {PERMISSION_ACTIONS.map((action) => (
                      <th key={`position-detail-action-${action}`}>{action}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MODULE_KEYS.map((moduleKey) => (
                    <tr key={`position-detail-module-${moduleKey}`}>
                      <td>{moduleKey}</td>
                      {PERMISSION_ACTIONS.map((action) => (
                        <td key={`position-detail-${moduleKey}-${action}`}>
                          <select
                            value={positionMatrix[moduleKey]?.[action] ?? ''}
                            disabled={!canSavePermissions}
                            onChange={(event) =>
                              setPositionMatrix((current) => ({
                                ...current,
                                [moduleKey]: {
                                  ...(current[moduleKey] ?? {}),
                                  [action]: event.target.value as PermissionEffectValue
                                }
                              }))
                            }
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

            {canSavePermissions ? (
              <section style={{ marginTop: '0.7rem', border: '1px dashed #dbe9df', borderRadius: '8px', padding: '0.55rem' }}>
                <div className="field">
                  <label htmlFor="position-reason-template">Lý do thay đổi</label>
                  <select
                    id="position-reason-template"
                    value={reasonTemplate}
                    onChange={(event) => setReasonTemplate(event.target.value)}
                  >
                    {REASON_TEMPLATES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginTop: '0.45rem' }}>
                  <label htmlFor="position-reason-note">Ghi chú thêm</label>
                  <input
                    id="position-reason-note"
                    value={reasonNote}
                    onChange={(event) => setReasonNote(event.target.value)}
                    placeholder="Ví dụ: Điều chỉnh theo tổ chức mới quý 2"
                  />
                </div>
                <div style={{ marginTop: '0.55rem', display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Chỉ lưu các ô đã chọn ALLOW/DENY.</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSavePermissions}
                    disabled={busy}
                  >
                    Lưu quyền theo vị trí
                  </button>
                </div>
              </section>
            ) : (
              <p style={{ marginTop: '0.7rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
                Bạn đang ở chế độ xem theo policy hiện tại.
              </p>
            )}
          </>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.65rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã NV</th>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Bộ phận</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {employeesBusy ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)' }}>
                      Đang tải danh sách nhân viên...
                    </td>
                  </tr>
                ) : positionEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)' }}>
                      Chưa có nhân viên thuộc vị trí này.
                    </td>
                  </tr>
                ) : (
                  positionEmployees.map((employee) => (
                    <tr key={`position-detail-employee-${employee.id}`}>
                      <td>{employee.code || '--'}</td>
                      <td>{employee.fullName}</td>
                      <td>{employee.email || '--'}</td>
                      <td>{employee.department || '--'}</td>
                      <td>{employee.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {error && <div className="banner banner-error" style={{ marginTop: '0.8rem' }}>{error}</div>}
        {message && <div className="banner banner-success" style={{ marginTop: '0.8rem' }}>{message}</div>}
      </section>
    </article>
  );
}
