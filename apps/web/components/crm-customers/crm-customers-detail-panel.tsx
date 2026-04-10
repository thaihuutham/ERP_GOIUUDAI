import React, { FormEvent } from 'react';
import {
  Download,
  Upload,
  Plus,
  User,
  Mail,
  Phone,
  Tag,
  Calendar,
  CreditCard,
  Target,
  Globe,
  History,
  Trash2,
  Car,
  Filter,
  Save,
} from 'lucide-react';
import { SidePanel } from '../ui/side-panel';
import { Modal } from '../ui/modal';
import { Badge, statusToBadge } from '../ui/badge';
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
  CUSTOMER_ZALO_NICK_TYPE_OPTIONS,
  CUSTOMER_ZALO_NICK_TYPE_LABELS,
  CUSTOMER_ZALO_NICK_BADGE,
  VEHICLE_KIND_OPTIONS,
  type Customer,
  type CustomerCareStatus,
  type CustomerZaloNickType,
  type ContractProductType,
  type CustomerDetailPayload,
  type DetailCustomerFormState,
  type VehicleFormState,
  type CrmCustomerVehicle
} from './types';
import {
  toNumber,
  toCurrency,
  toDateTime,
  formatTaxonomyLabel,
  customerStatusLabel,
  customerStatusBadge,
  customerZaloNickTypeLabel,
  customerZaloNickTypeBadge,
  formatContractProductLabel,
  formatContractProductList,
  formatContractReference,
  buildAuditObjectHref,
  readSelectedTags,
  normalizeVehicleKind
} from './utils';

export type CrmCustomersDetailPanelProps = {
  selectedCustomer: Customer | null;
  selectCustomer: (customer: Customer | null) => void;
  canUpdate: boolean;
  canDelete: boolean;
  customerDetail: CustomerDetailPayload | null;
  isDetailLoading: boolean;
  detailForm: DetailCustomerFormState;
  setDetailForm: React.Dispatch<React.SetStateAction<DetailCustomerFormState>>;
  isDetailEditing: boolean;
  setIsDetailEditing: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingDetail: boolean;
  handleSaveDetailProfile: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  handleSoftSkipCustomer: () => Promise<void>;
  isSoftSkippingCustomer: boolean;
  detailStageOptions: string[];
  detailSourceOptions: string[];
  customerTagSelectOptions: string[];
  customerVehicles: CrmCustomerVehicle[];
  canManageSelectedCustomerVehicles: boolean;
  canArchiveSelectedCustomerVehicles: boolean;
  isVehicleEditorOpen: boolean;
  setIsVehicleEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openCreateVehicleEditor: () => void;
  openEditVehicleEditor: (v: CrmCustomerVehicle) => void;
  handleArchiveVehicle: (id: string) => Promise<void>;
  vehicleMap: Map<string, CrmCustomerVehicle>;
  vehicleForm: VehicleFormState;
  setVehicleForm: React.Dispatch<React.SetStateAction<VehicleFormState>>;
  isSavingVehicle: boolean;
  handleSaveVehicle: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  vehicleEditorMode: 'CREATE' | 'EDIT';
  vehicleValidationErrors: string[];
  archivingVehicleId: string | null;
  recentContracts: any[];
  contractSummary: any;
  setCustomerDetail: React.Dispatch<React.SetStateAction<any>>;
  setEditingVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  setVehicleEditorMode: React.Dispatch<React.SetStateAction<string>>;
  selectedCustomerPermissionSnapshot: { canUpdate: boolean; canDelete: boolean };
  buildDetailForm: (customer: any) => any;
  buildVehicleFormState: (vehicle: any) => any;
};

export function CrmCustomersDetailPanel({
  selectedCustomer, selectCustomer, canUpdate, canDelete,
  customerDetail, isDetailLoading, detailForm, setDetailForm,
  isDetailEditing, setIsDetailEditing, isSavingDetail, handleSaveDetailProfile,
  handleSoftSkipCustomer, isSoftSkippingCustomer,
  detailStageOptions, detailSourceOptions, customerTagSelectOptions,
  customerVehicles, canManageSelectedCustomerVehicles, canArchiveSelectedCustomerVehicles,
  isVehicleEditorOpen, setIsVehicleEditorOpen, openCreateVehicleEditor, openEditVehicleEditor,
  handleArchiveVehicle, vehicleMap, vehicleForm, setVehicleForm,
  isSavingVehicle, handleSaveVehicle, vehicleEditorMode, vehicleValidationErrors, archivingVehicleId,
  recentContracts, contractSummary,
  setCustomerDetail, setEditingVehicleId, setVehicleEditorMode,
  selectedCustomerPermissionSnapshot, buildDetailForm: buildDetailFormFn, buildVehicleFormState: buildVehicleFormStateFn
}: CrmCustomersDetailPanelProps) {
  const detailCustomer = customerDetail?.customer ?? selectedCustomer;
  return (
<SidePanel
        isOpen={!!selectedCustomer}
        onClose={() => {
          selectCustomer(null);
          setCustomerDetail(null);
          setIsDetailEditing(false);
          setDetailForm(buildDetailFormFn(null));
        }}
        title="Chi tiết khách hàng"
      >
        {selectedCustomer && (
          <div style={{ display: 'grid', gap: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <User size={32} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {isDetailEditing ? (detailForm.fullName || '(Chưa nhập tên)') : detailCustomer?.fullName}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{detailCustomer?.code || 'Mã: (Chưa có)'}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Mail size={14} /> Email</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.email}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="customer@example.com"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.email || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Phone size={14} /> Điện thoại</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.phone}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="09xxxxxxxx"
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.phone || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Target size={14} /> Giai đoạn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.customerStage}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, customerStage: event.target.value }))}
                  >
                    {detailStageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {formatTaxonomyLabel(stage)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.customerStage || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><CreditCard size={14} /> Tổng chi tiêu</label>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--primary)' }}>{toCurrency(detailCustomer?.totalSpent)}</p>
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Globe size={14} /> Nguồn</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.source}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, source: event.target.value }))}
                  >
                    {detailSourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {formatTaxonomyLabel(source)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.source || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ marginBottom: '4px' }}>Trạng thái</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.status}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, status: event.target.value as CustomerCareStatus }))}
                  >
                    {CUSTOMER_STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {CUSTOMER_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>
                    <Badge variant={customerStatusBadge(detailCustomer?.status)}>{customerStatusLabel(detailCustomer?.status)}</Badge>
                  </p>
                )}
              </div>
              <div className="field">
                <label style={{ marginBottom: '4px' }}>Loại nick Zalo</label>
                {isDetailEditing ? (
                  <select
                    value={detailForm.zaloNickType}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, zaloNickType: event.target.value as CustomerZaloNickType }))}
                  >
                    {CUSTOMER_ZALO_NICK_TYPE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {CUSTOMER_ZALO_NICK_TYPE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>
                    <Badge variant={customerZaloNickTypeBadge(detailCustomer?.zaloNickType)}>
                      {customerZaloNickTypeLabel(detailCustomer?.zaloNickType)}
                    </Badge>
                  </p>
                )}
              </div>
              <div className="field">
                <label>Phân khúc</label>
                {isDetailEditing ? (
                  <input
                    value={detailForm.segment}
                    onChange={(event) => setDetailForm((prev) => ({ ...prev, segment: event.target.value }))}
                    placeholder="VIP / Retail / B2B..."
                  />
                ) : (
                  <p style={{ fontSize: '0.9375rem' }}>{detailCustomer?.segment || '--'}</p>
                )}
              </div>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Calendar size={14} /> Cập nhật cuối</label>
                <p style={{ fontSize: '0.9375rem' }}>{toDateTime(detailCustomer?.updatedAt)}</p>
              </div>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}><Tag size={14} /> Thẻ (Tags)</label>
              {isDetailEditing ? (
                <select
                  multiple
                  value={detailForm.tags}
                  onChange={(event) => setDetailForm((prev) => ({ ...prev, tags: readSelectedTags(event) }))}
                  size={Math.min(Math.max(customerTagSelectOptions.length, 3), 8)}
                >
                  {customerTagSelectOptions.map((tag) => (
                    <option key={`detail-tag-${tag}`} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {detailCustomer?.tags?.length ? detailCustomer.tags.map((t) => (
                    <span key={t} className="finance-status-pill finance-status-pill-neutral">{t}</span>
                  )) : <span style={{ color: 'var(--muted)', fontSize: '0.875rem italic' }}>--</span>}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Gia hạn CRM & gói cước</h4>
              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải thông tin hợp đồng...</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Tổng hợp đồng</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.totalContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đang active</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.activeContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Đã hết hạn</p>
                      <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{contractSummary?.expiredContracts ?? 0}</p>
                    </div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>Hết hạn gần nhất</p>
                      <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600 }}>{toDateTime(contractSummary?.nextExpiringAt)}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {(['TELECOM_PACKAGE', 'AUTO_INSURANCE', 'MOTO_INSURANCE', 'DIGITAL_SERVICE'] as ContractProductType[]).map((productType) => (
                      <span key={`product-summary-${productType}`} className="finance-status-pill finance-status-pill-neutral">
                        {formatContractProductLabel(productType)}: {contractSummary?.byProduct?.[productType] ?? 0}
                      </span>
                    ))}
                  </div>

                  {recentContracts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {recentContracts.slice(0, 5).map((contract) => (
                        <div key={contract.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.65rem 0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <strong style={{ fontSize: '0.88rem' }}>{formatContractProductLabel(contract.productType)}</strong>
                            <Badge variant={statusToBadge(contract.status)}>{contract.status || '--'}</Badge>
                          </div>
                          <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                            {formatContractReference(contract, vehicleMap)}
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Hiệu lực: {toDateTime(contract.startsAt)} → {toDateTime(contract.endsAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Khách hàng chưa có hợp đồng CRM.</p>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Car size={16} /> Thông tin xe
                </h4>
                {canManageSelectedCustomerVehicles && (
                  <button className="btn btn-ghost" onClick={openCreateVehicleEditor}>
                    <Plus size={14} /> Thêm xe
                  </button>
                )}
              </div>

              {isDetailLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Đang tải danh sách xe...</p>
              ) : customerVehicles.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {customerVehicles.slice(0, 8).map((vehicle) => (
                    <div key={vehicle.id} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{vehicle.plateNumber || 'Biển số N/A'}</strong>
                        <Badge variant={statusToBadge(vehicle.status)}>{vehicle.status || '--'}</Badge>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem', color: 'var(--muted)' }}>
                        Loại xe: {vehicle.vehicleKind || '--'} · Dòng xe: {vehicle.vehicleType || '--'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Chủ xe: {vehicle.ownerFullName || '--'} · Cập nhật: {toDateTime(vehicle.updatedAt)}
                      </p>
                      {(canManageSelectedCustomerVehicles || canArchiveSelectedCustomerVehicles) && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          {canManageSelectedCustomerVehicles && (
                            <button className="btn btn-ghost" onClick={() => openEditVehicleEditor(vehicle)}>
                              Sửa
                            </button>
                          )}
                          {canArchiveSelectedCustomerVehicles && String(vehicle.status ?? '').toUpperCase() !== 'ARCHIVED' && (
                            <button
                              className="btn btn-danger"
                              onClick={() => handleArchiveVehicle(vehicle as any)}
                              disabled={archivingVehicleId === vehicle.id}
                            >
                              {archivingVehicleId === vehicle.id ? 'Đang lưu trữ...' : 'Lưu trữ'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted)' }}>Chưa có thông tin xe cho khách hàng này.</p>
              )}

              {canManageSelectedCustomerVehicles && isVehicleEditorOpen && (
                <form onSubmit={handleSaveVehicle} style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}>
                  <h5 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600 }}>
                    {(vehicleEditorMode as string) === 'create' || (vehicleEditorMode as string) === 'CREATE' ? 'Thêm xe mới cho khách hàng' : `Cập nhật xe ${vehicleForm.plateNumber || ''}`}
                  </h5>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
                    <div className="field">
                      <label>Chủ xe *</label>
                      <input
                        required
                        value={vehicleForm.ownerFullName}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerFullName: event.target.value }))}
                        placeholder="Nguyễn Văn A"
                      />
                    </div>
                    <div className="field">
                      <label>Biển số *</label>
                      <input
                        required
                        value={vehicleForm.plateNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, plateNumber: event.target.value.toUpperCase() }))}
                        placeholder="30A-12345"
                      />
                    </div>
                    <div className="field">
                      <label>Số khung *</label>
                      <input
                        required
                        value={vehicleForm.chassisNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, chassisNumber: event.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="field">
                      <label>Số máy *</label>
                      <input
                        required
                        value={vehicleForm.engineNumber}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, engineNumber: event.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="field">
                      <label>Nhóm xe *</label>
                      <select
                        value={vehicleForm.vehicleKind}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleKind: normalizeVehicleKind(event.target.value) }))}
                      >
                        <option value="AUTO">Ô tô</option>
                        <option value="MOTO">Xe máy</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Dòng xe *</label>
                      <input
                        required
                        value={vehicleForm.vehicleType}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, vehicleType: event.target.value }))}
                        placeholder="Sedan / SUV / Tay ga..."
                      />
                    </div>
                    <div className="field">
                      <label>Số chỗ</label>
                      <input
                        type="number"
                        min={0}
                        value={vehicleForm.seatCount}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, seatCount: event.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>Tải trọng (kg)</label>
                      <input
                        type="number"
                        min={0}
                        value={vehicleForm.loadKg}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, loadKg: event.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                      <label>Địa chỉ chủ xe</label>
                      <input
                        value={vehicleForm.ownerAddress}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, ownerAddress: event.target.value }))}
                        placeholder="Địa chỉ chủ xe"
                      />
                    </div>
                    <div className="field">
                      <label>Trạng thái</label>
                      <select
                        value={vehicleForm.status}
                        onChange={(event) => setVehicleForm((prev) => ({ ...prev, status: event.target.value as VehicleFormState['status'] }))}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="DRAFT">DRAFT</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" type="submit" disabled={isSavingVehicle}>
                      {isSavingVehicle ? 'Đang lưu...' : (vehicleEditorMode as string) === 'create' || (vehicleEditorMode as string) === 'CREATE' ? 'Thêm xe' : 'Lưu cập nhật'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setIsVehicleEditorOpen(false);
                        setEditingVehicleId(null);
                        setVehicleEditorMode('create');
                        setVehicleForm(buildVehicleFormStateFn(null));
                      }}
                      disabled={isSavingVehicle}
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
              {isDetailEditing ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleSaveDetailProfile as any}
                    disabled={isSavingDetail}
                  >
                    {isSavingDetail ? 'Đang lưu...' : 'Lưu hồ sơ'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setIsDetailEditing(false);
                      setDetailForm(buildDetailFormFn(detailCustomer ?? selectedCustomer));
                    }}
                    disabled={isSavingDetail}
                  >
                    Hủy chỉnh sửa
                  </button>
                </>
              ) : (
                <>
                  {selectedCustomerPermissionSnapshot.canUpdate && (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setDetailForm(buildDetailFormFn(detailCustomer ?? selectedCustomer));
                        setIsDetailEditing(true);
                      }}
                    >
                      Chỉnh sửa hồ sơ
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled>
                    Gửi thông báo
                  </button>
                  {selectedCustomerPermissionSnapshot.canDelete && String(detailCustomer?.status || '').toUpperCase() !== 'SAI_SO_KHONG_TON_TAI_BO_QUA_XOA' && (
                    <button
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                      onClick={handleSoftSkipCustomer}
                      disabled={isSoftSkippingCustomer}
                    >
                      <Trash2 size={16} /> {isSoftSkippingCustomer ? 'Đang cập nhật...' : 'Lưu trữ'}
                    </button>
                  )}
                </>
              )}
              <a
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                href={buildAuditObjectHref('Customer', selectedCustomer.id)}
              >
                <History size={16} /> Lịch sử audit
              </a>
            </div>
          </div>
        )}
      </SidePanel>
  );
}
