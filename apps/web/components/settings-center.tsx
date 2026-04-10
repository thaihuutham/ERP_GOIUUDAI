'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SYSTEM_PROFILE } from '../lib/system-profile';
import { GroupedSidebar } from './settings-center/grouped-sidebar';
import { DomainTabs } from './settings-center/domain-tabs';
import { AdvancedToggle } from './settings-center/advanced-toggle';

import {
  DOMAIN_LABEL,
  ACCESS_SECURITY_ROLE_PLAYBOOK,
  ROLE_LABEL_MAP,
  getFieldValue as getFieldValueFn,
  formatDateTime,
} from './settings-center/domain-config';

import { useSettingsState } from './settings/use-settings-state';
import { SettingsFieldRenderer } from './settings/settings-field-renderer';
import { SettingsDomainActions } from './settings/settings-domain-actions';
import { SettingsRightSidebar } from './settings/settings-right-sidebar';
import { SettingsConnectionPanel } from './settings/settings-connection-panel';
import { OrgStructurePanel } from './settings/org-structure-panel';
import { HrAccountsPanel } from './settings/hr-accounts-panel';
import { AccessSecurityPanel } from './settings/access-security-panel';

export function SettingsCenter() {
  const s = useSettingsState();

  const selectedDomainState = s.center?.domainStates.find((item) => item.domain === s.selectedDomain);

  const renderOrgTreeNodes = (nodes: Record<string, unknown>[], depth = 0): ReactNode[] => {
    return nodes.flatMap((node) => {
      const id = String(node.id ?? '');
      const name = String(node.name ?? '');
      const type = String(node.type ?? '');
      const children = Array.isArray(node.children) ? (node.children as Record<string, unknown>[]) : [];
      return [
        (
          <div
            key={`${id}-${depth}`}
            style={{
              paddingLeft: `${depth * 1.2}rem`,
              borderLeft: depth > 0 ? '1px dashed #d6e6dc' : 'none',
              marginLeft: depth > 0 ? '0.35rem' : '0',
              marginTop: '0.25rem'
            }}
          >
            <strong style={{ fontSize: '0.82rem' }}>{name || id}</strong>
            <span style={{ marginLeft: '0.4rem', color: 'var(--muted)', fontSize: '0.75rem' }}>{type}</span>
          </div>
        ),
        ...renderOrgTreeNodes(children, depth + 1)
      ];
    });
  };

  return (
    <article className="module-workbench" style={{ background: 'transparent' }}>
      <header className="module-header" style={{ background: 'transparent', borderBottom: 'none', padding: '0 0 1.5rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800 }}>Trung tâm cấu hình hệ thống</h1>
            <p style={{ color: 'var(--muted)', marginTop: '0.4rem' }}>
              Cấu hình tập trung cho {SYSTEM_PROFILE.companyName}: tối giản thao tác, chuẩn hóa dữ liệu, tăng tự động hóa và AI giám sát.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <Link href="/modules/settings/custom-fields" className="btn btn-ghost">
                Mở trang Trường tùy chỉnh
              </Link>
              <Link href="/modules/settings/appearance" className="btn btn-ghost">
                Giao diện hệ thống
              </Link>
            </div>
          </div>
          <AdvancedToggle
            value={s.advancedMode}
            onChange={(next) => { s.setAdvancedTouchedByUser(true); s.setAdvancedMode(next); }}
          />
        </div>
      </header>

      <section className="settings-center-layout">
        <GroupedSidebar
          groups={s.sidebarGroups}
          labels={DOMAIN_LABEL}
          selectedDomain={s.selectedDomain}
          onSelectDomain={s.setSelectedDomain}
          domainStates={s.center?.domainStates}
          searchValue={s.settingsSearch}
          onSearchChange={s.setSettingsSearch}
        />

        <main className="settings-center-main">
          {/* ── Domain header ─────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.8rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>{s.domaintitle}</h3>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>{s.domaindescription}</p>
              <p style={{ margin: '0.35rem 0 0 0', color: selectedDomainState?.ok ? '#1b8748' : '#d97706', fontSize: '0.8rem', fontWeight: 600 }}>
                Trạng thái miền cấu hình: {selectedDomainState?.ok ? 'Ổn định' : 'Cần rà soát'}
              </p>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
                Runtime: {selectedDomainState?.runtimeApplied ? 'Đã áp dụng' : 'Chưa áp dụng'} · Cập nhật lúc: {formatDateTime(selectedDomainState?.runtimeLoadedAt)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void s.reloadAll(s.selectedDomain)} disabled={s.busy}>Làm mới</button>
          </div>

          <DomainTabs tabs={s.domainTabs} activeTab={s.resolvedActiveDomainTab} onChange={s.setActiveDomainTab} />

          {/* ── Role playbook (access_security) ── */}
          {s.selectedDomain === 'access_security' && (
            <section className="settings-role-playbook">
              <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Luồng thao tác theo vai trò</h4>
              <div className="settings-role-playbook-grid">
                {ACCESS_SECURITY_ROLE_PLAYBOOK.map((playbook) => {
                  const isCurrentRole = s.normalizedRole === playbook.role;
                  return (
                    <article key={`playbook-${playbook.role}`} className={`settings-role-playbook-item${isCurrentRole ? ' is-current' : ''}`}>
                      <strong>{ROLE_LABEL_MAP[playbook.role] ?? playbook.role}</strong>
                      <p>{playbook.title}</p>
                      <ul>{playbook.steps.map((step) => (<li key={`${playbook.role}-${step}`}>{step}</li>))}</ul>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Section cards with field renderer ── */}
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {s.sectionViewModels.map(({ section, sectionKey }) => {
              const isCollapsed = s.sectionCollapseState[sectionKey] ?? false;
              return (
                <section key={section.id} className={`settings-section-card${isCollapsed ? ' is-collapsed' : ''}`}>
                  <div className="settings-section-head">
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{section.title}</h4>
                      <p style={{ margin: '0.22rem 0 0 0', color: 'var(--muted)', fontSize: '0.74rem' }}>{section.fields.length} trường cấu hình</p>
                    </div>
                    <button type="button" className="btn btn-ghost" aria-expanded={!isCollapsed} onClick={() => s.setSectionCollapseState((current) => ({ ...current, [sectionKey]: !isCollapsed }))}>
                      {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    </button>
                  </div>
                  {section.description && (<p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{section.description}</p>)}
                  {!isCollapsed && (
                    <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                      <SettingsFieldRenderer
                        advancedMode={s.advancedMode}
                        fields={section.fields}
                        getFieldValue={(field) => getFieldValueFn(field, s.draftData)}
                        updateField={s.updateField}
                        fieldErrorMap={s.fieldErrorMap}
                        salesTaxonomy={s.salesTaxonomy}
                        crmTagRegistry={s.crmTagRegistry}
                        busy={s.busy}
                        salesTaxonomyBusy={s.salesTaxonomyBusy}
                        crmTagRegistryBusy={s.crmTagRegistryBusy}
                        hrAppendixFieldPickerOptions={s.hrAppendixFieldPickerOptions}
                        isSalesTaxonomyType={s.isSalesTaxonomyType}
                        isCrmTagRegistryType={s.isCrmTagRegistryType}
                        handleCreateSalesTaxonomy={s.handleCreateSalesTaxonomy}
                        handleRenameSalesTaxonomy={s.handleRenameSalesTaxonomy}
                        handleDeleteSalesTaxonomy={s.handleDeleteSalesTaxonomy}
                        handleCreateCrmTagRegistry={s.handleCreateCrmTagRegistry}
                        handleRenameCrmTagRegistry={s.handleRenameCrmTagRegistry}
                        handleDeleteCrmTagRegistry={s.handleDeleteCrmTagRegistry}
                      />
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* ── Domain-specific panels ─────────── */}
          {s.selectedDomain === 'org_profile' && s.activeTabConfig?.showOrgStructure === true && (
            <OrgStructurePanel
              orgUnitForm={s.orgUnitForm}
              setOrgUnitForm={s.setOrgUnitForm}
              orgUnitOptions={s.orgUnitOptions}
              managerEmployeeOptions={s.managerEmployeeOptions}
              handleCreateOrgUnit={s.handleCreateOrgUnit}
              orgMoveForm={s.orgMoveForm}
              setOrgMoveForm={s.setOrgMoveForm}
              handleMoveOrgUnit={s.handleMoveOrgUnit}
              orgManagerForm={s.orgManagerForm}
              setOrgManagerForm={s.setOrgManagerForm}
              handleAssignOrgManager={s.handleAssignOrgManager}
              orgTree={s.orgTree}
              renderOrgTreeNodes={renderOrgTreeNodes}
              busy={s.busy}
            />
          )}

          {s.selectedDomain === 'hr_policies' && s.activeTabConfig?.showHrAccounts === true && (
            <HrAccountsPanel
              accountForm={s.accountForm}
              setAccountForm={s.setAccountForm}
              positionOptions={s.positionOptions}
              orgUnitOptions={s.orgUnitOptions}
              handleCreateIamUser={s.handleCreateIamUser}
              busy={s.busy}
              selectedIamUserIds={s.selectedIamUserIds}
              setSelectedIamUserIds={s.setSelectedIamUserIds}
              handleBulkResetIamPassword={s.handleBulkResetIamPassword}
              iamUsers={s.iamUsers}
              handleResetIamPassword={s.handleResetIamPassword}
            />
          )}

          {s.selectedDomain === 'access_security' && s.activeTabConfig?.showAccessMatrix === true && (
            <AccessSecurityPanel
              canManagePositionCatalog={s.canManagePositionCatalog}
              canManageIamAdmin={s.canManageIamAdmin}
              busy={s.busy}
              showPositionForm={s.showPositionForm}
              positionFormMode={s.positionFormMode}
              positionForm={s.positionForm as any}
              setPositionForm={s.setPositionForm as any}
              handleOpenCreatePosition={s.handleOpenCreatePosition}
              handleCancelPositionForm={s.handleCancelPositionForm}
              handleSubmitPositionForm={s.handleSubmitPositionForm}
              positionSearch={s.positionSearch}
              setPositionSearch={s.setPositionSearch}
              filteredPositions={s.filteredPositions}
              positions={s.positions}
              handleOpenEditPosition={s.handleOpenEditPosition}
              handleDeletePosition={s.handleDeletePosition}
              selectedOverrideUserId={s.selectedOverrideUserId}
              setSelectedOverrideUserId={s.setSelectedOverrideUserId}
              iamUsers={s.iamUsers}
              overrideMatrix={s.overrideMatrix as any}
              setOverrideMatrix={s.setOverrideMatrix as any}
              handleSaveUserOverrides={s.handleSaveUserOverrides}
              iamScopeOverrideForm={s.iamScopeOverrideForm as any}
              setIamScopeOverrideForm={s.setIamScopeOverrideForm as any}
              orgUnitOptions={s.orgUnitOptions}
              handleSaveIamScopeOverride={s.handleSaveIamScopeOverride}
              iamTitleScopeForm={s.iamTitleScopeForm as any}
              setIamTitleScopeForm={s.setIamTitleScopeForm as any}
              handleUpsertIamTitleScopeMapping={s.handleUpsertIamTitleScopeMapping}
              iamMismatchFilter={s.iamMismatchFilter as any}
              setIamMismatchFilter={s.setIamMismatchFilter as any}
              loadIamMismatchReport={s.loadIamMismatchReport}
              iamMismatchBusy={s.iamMismatchBusy}
              iamMismatchReport={s.iamMismatchReport}
              updateMatrixCell={s.updateMatrixCell as any}
            />
          )}

          {/* ── Connection panel ──────────────── */}
          <SettingsConnectionPanel
            selectedDomain={s.selectedDomain}
            submissionData={s.submissionData}
            testResult={s.testResult}
          />

          {/* ── Domain actions ────────────────── */}
          <SettingsDomainActions
            fieldChanges={s.fieldChanges}
            reasonTemplate={s.reasonTemplate}
            reasonNote={s.reasonNote}
            onReasonTemplateChange={s.setReasonTemplate}
            onReasonNoteChange={s.setReasonNote}
            onValidate={s.handleValidate}
            onSave={s.handleSave}
            onTestConnection={s.handleTestConnection}
            onCreateSnapshot={s.handleCreateSnapshot}
            busy={s.busy}
            showTestConnection={s.selectedDomain === 'integrations' || s.selectedDomain === 'search_performance'}
            error={s.error}
            message={s.message}
            globalValidationErrors={s.globalValidationErrors}
          />
        </main>

        {/* ── Right sidebar ───────────────────── */}
        <SettingsRightSidebar
          center={s.center}
          role={s.role}
          validationErrors={s.validationErrors}
          validationWarnings={s.validationWarnings}
          selectedSnapshotId={s.selectedSnapshotId}
          onSelectSnapshot={s.setSelectedSnapshotId}
          onRestoreSnapshot={s.handleRestoreSnapshot}
          busy={s.busy}
        />
      </section>
    </article>
  );
}
