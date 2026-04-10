import type { Dispatch, SetStateAction } from 'react';

export interface OrgUnitForm {
  name: string;
  type: string;
  parentId: string;
  managerEmployeeId: string;
}

export interface OrgMoveForm {
  unitId: string;
  parentId: string;
}

export interface OrgManagerForm {
  unitId: string;
  managerEmployeeId: string;
}

interface OrgStructurePanelProps {
  orgUnitForm: OrgUnitForm;
  setOrgUnitForm: Dispatch<SetStateAction<OrgUnitForm>>;
  orgUnitOptions: any[];
  managerEmployeeOptions: any[];
  handleCreateOrgUnit: () => void;
  orgMoveForm: OrgMoveForm;
  setOrgMoveForm: Dispatch<SetStateAction<OrgMoveForm>>;
  handleMoveOrgUnit: () => void;
  orgManagerForm: OrgManagerForm;
  setOrgManagerForm: Dispatch<SetStateAction<OrgManagerForm>>;
  handleAssignOrgManager: () => void;
  orgTree: any[];
  renderOrgTreeNodes: (nodes: any[]) => import('react').ReactNode;
  busy: boolean;
}

export function OrgStructurePanel({
  orgUnitForm,
  setOrgUnitForm,
  orgUnitOptions,
  managerEmployeeOptions,
  handleCreateOrgUnit,
  orgMoveForm,
  setOrgMoveForm,
  handleMoveOrgUnit,
  orgManagerForm,
  setOrgManagerForm,
  handleAssignOrgManager,
  orgTree,
  renderOrgTreeNodes,
  busy,
}: OrgStructurePanelProps) {
  return (
    <section style={{ border: '1px solid #e5f0e8', borderRadius: '10px', padding: '0.75rem', marginTop: '0.9rem' }}>
      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Sơ đồ tổ chức doanh nghiệp</h4>
      <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Quản lý cây tổ chức chuẩn COMPANY &gt; BRANCH &gt; DEPARTMENT &gt; TEAM.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.65rem' }}>
        <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
          <strong style={{ fontSize: '0.82rem' }}>Tạo node mới</strong>
          <div className="form-grid" style={{ marginTop: '0.45rem' }}>
            <div className="field">
              <label>Tên đơn vị</label>
              <input
                value={orgUnitForm.name}
                onChange={(event) => setOrgUnitForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ví dụ: Chi nhánh Hà Nội"
              />
            </div>
            <div className="field">
              <label>Loại node</label>
              <select
                value={orgUnitForm.type}
                onChange={(event) => setOrgUnitForm((current) => ({ ...current, type: event.target.value }))}
              >
                <option value="COMPANY">COMPANY</option>
                <option value="BRANCH">BRANCH</option>
                <option value="DEPARTMENT">DEPARTMENT</option>
                <option value="TEAM">TEAM</option>
              </select>
            </div>
            <div className="field">
              <label>Parent node</label>
              <select
                value={orgUnitForm.parentId}
                onChange={(event) => setOrgUnitForm((current) => ({ ...current, parentId: event.target.value }))}
              >
                <option value="">-- Root --</option>
                {orgUnitOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Manager (managerEmployeeId)</label>
              <select
                value={orgUnitForm.managerEmployeeId}
                onChange={(event) => setOrgUnitForm((current) => ({ ...current, managerEmployeeId: event.target.value }))}
              >
                <option value="">-- Chưa gán --</option>
                {managerEmployeeOptions.map((item) => (
                  <option key={`create-manager-${item.employeeId}`} value={item.employeeId}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleCreateOrgUnit} disabled={busy}>
              Tạo node
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
          <strong style={{ fontSize: '0.82rem' }}>Di chuyển node</strong>
          <div className="form-grid" style={{ marginTop: '0.45rem' }}>
            <div className="field">
              <label>Node cần chuyển</label>
              <select
                value={orgMoveForm.unitId}
                onChange={(event) => setOrgMoveForm((current) => ({ ...current, unitId: event.target.value }))}
              >
                <option value="">-- Chọn node --</option>
                {orgUnitOptions.map((item) => (
                  <option key={`move-${item.id}`} value={item.id}>
                    {item.name} ({item.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Parent mới</label>
              <select
                value={orgMoveForm.parentId}
                onChange={(event) => setOrgMoveForm((current) => ({ ...current, parentId: event.target.value }))}
              >
                <option value="">-- Chọn parent mới --</option>
                {orgUnitOptions.map((item) => (
                  <option key={`parent-${item.id}`} value={item.id}>
                    {item.name} ({item.type})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleMoveOrgUnit} disabled={busy}>
              Di chuyển node
            </button>
          </div>

          <div style={{ marginTop: '0.65rem', borderTop: '1px dashed #dbe9df', paddingTop: '0.55rem' }}>
            <strong style={{ fontSize: '0.82rem' }}>Gán quản lý cho org unit</strong>
            <div className="form-grid" style={{ marginTop: '0.45rem' }}>
              <div className="field">
                <label>Org unit</label>
                <select
                  value={orgManagerForm.unitId}
                  onChange={(event) => setOrgManagerForm((current) => ({ ...current, unitId: event.target.value }))}
                >
                  <option value="">-- Chọn node --</option>
                  {orgUnitOptions.map((item) => (
                    <option key={`manager-unit-${item.id}`} value={item.id}>
                      {item.name} ({item.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Manager (managerEmployeeId)</label>
                <select
                  value={orgManagerForm.managerEmployeeId}
                  onChange={(event) => setOrgManagerForm((current) => ({ ...current, managerEmployeeId: event.target.value }))}
                >
                  <option value="">-- Bỏ gán manager --</option>
                  {managerEmployeeOptions.map((item) => (
                    <option key={`manager-option-${item.employeeId}`} value={item.employeeId}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAssignOrgManager} disabled={busy}>
                Cập nhật manager
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem', border: '1px solid #e8efea', borderRadius: '8px', padding: '0.55rem' }}>
        <strong style={{ fontSize: '0.82rem' }}>Cây tổ chức hiện tại</strong>
        <div style={{ marginTop: '0.3rem' }}>
          {orgTree.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Chưa có dữ liệu org tree.</p>
          ) : (
            renderOrgTreeNodes(orgTree)
          )}
        </div>
      </div>
    </section>
  );
}
