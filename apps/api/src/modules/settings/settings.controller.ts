import { Body, Controller, Delete, Get, Inject, Param, Patch, Put, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import { SettingsEnterpriseService } from './settings-enterprise.service';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(SettingsEnterpriseService) private readonly settingsEnterpriseService: SettingsEnterpriseService
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  listRawSettings() {
    return this.settingsService.listRawSettings();
  }

  @Get('config')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getConfig() {
    return this.settingsService.getConfig();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  upsertSetting(@Body() body: Record<string, unknown>) {
    return this.settingsService.upsertSetting(body);
  }

  @Put('config')
  @Roles(UserRole.ADMIN)
  saveConfig(@Body() body: Record<string, unknown>) {
    return this.settingsService.saveConfig(body);
  }

  @Get('bhtot/sync/config')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getBhtotSyncConfig() {
    return this.settingsService.getBhtotSyncConfig();
  }

  @Put('bhtot/sync/config')
  @Roles(UserRole.ADMIN)
  saveBhtotSyncConfig(@Body() body: Record<string, unknown>) {
    return this.settingsService.saveBhtotSyncConfig(body);
  }

  @Get('bhtot/sync/status')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getBhtotSyncStatus() {
    return this.settingsService.getBhtotSyncStatus();
  }

  @Post('bhtot/sync/run')
  @Roles(UserRole.ADMIN)
  runBhtotSync() {
    return this.settingsService.runBhtotOneWaySync();
  }

  @Get('search/status')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  getSearchStatus() {
    return this.settingsService.getSearchStatus();
  }

  @Post('search/reindex')
  @Roles(UserRole.ADMIN)
  runSearchReindex(@Body() body: Record<string, unknown>) {
    return this.settingsService.runSearchReindex(body);
  }

  @Get('center')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_SETTINGS_CENTER', entityType: 'SettingsCenter' })
  getSettingsCenter() {
    return this.settingsService.getSettingsCenter();
  }

  @Get('layout')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_SETTINGS_LAYOUT', entityType: 'SettingsLayout' })
  getSettingsLayout() {
    return this.settingsService.getSettingsLayout();
  }

  @Get('sales-taxonomy')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_SALES_TAXONOMY', entityType: 'SalesTaxonomy' })
  getSalesTaxonomy() {
    return this.settingsService.getSalesTaxonomyOverview();
  }

  @Post('sales-taxonomy/:type')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_SALES_TAXONOMY_VALUE', entityType: 'SalesTaxonomy', entityIdParam: 'type' })
  createSalesTaxonomyItem(@Param('type') type: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.createSalesTaxonomyItem(type, body);
  }

  @Patch('sales-taxonomy/:type/:value')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_SALES_TAXONOMY_VALUE', entityType: 'SalesTaxonomy', entityIdParam: 'value' })
  renameSalesTaxonomyItem(
    @Param('type') type: string,
    @Param('value') value: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.settingsService.renameSalesTaxonomyItem(type, value, body);
  }

  @Delete('sales-taxonomy/:type/:value')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'DELETE_SALES_TAXONOMY_VALUE', entityType: 'SalesTaxonomy', entityIdParam: 'value' })
  deleteSalesTaxonomyItem(
    @Param('type') type: string,
    @Param('value') value: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.settingsService.deleteSalesTaxonomyItem(type, value, body);
  }

  @Get('crm-tags')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_CRM_TAG_REGISTRY', entityType: 'CrmTagRegistry' })
  getCrmTagRegistry() {
    return this.settingsService.getCrmTagRegistryOverview();
  }

  @Post('crm-tags/:type')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_CRM_TAG_VALUE', entityType: 'CrmTagRegistry', entityIdParam: 'type' })
  createCrmTagRegistryItem(@Param('type') type: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.createCrmTagRegistryItem(type, body);
  }

  @Patch('crm-tags/:type/:value')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_CRM_TAG_VALUE', entityType: 'CrmTagRegistry', entityIdParam: 'value' })
  renameCrmTagRegistryItem(
    @Param('type') type: string,
    @Param('value') value: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.settingsService.renameCrmTagRegistryItem(type, value, body);
  }

  @Delete('crm-tags/:type/:value')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'DELETE_CRM_TAG_VALUE', entityType: 'CrmTagRegistry', entityIdParam: 'value' })
  deleteCrmTagRegistryItem(
    @Param('type') type: string,
    @Param('value') value: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.settingsService.deleteCrmTagRegistryItem(type, value, body);
  }

  @Get('runtime')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getRuntimeSettings() {
    return this.settingsService.getRuntimeSettings();
  }

  @Get('domains/:domain')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_SETTINGS_DOMAIN', entityType: 'SettingsDomain', entityIdParam: 'domain' })
  getDomainSettings(@Param('domain') domain: string) {
    return this.settingsService.getDomainSettings(domain);
  }

  @Put('domains/:domain')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  updateDomainSettings(@Param('domain') domain: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.updateDomainSettings(domain, body);
  }

  @Post('domains/:domain/validate')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  validateDomainSettings(@Param('domain') domain: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.validateDomainSettings(domain, body);
  }

  @Post('domains/:domain/test-connection')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  testDomainConnection(@Param('domain') domain: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.testDomainConnection(domain, body);
  }

  @Get('audit')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listSettingsAudit(
    @Query('domain') domain?: string,
    @Query('actor') actor?: string,
    @Query('limit') limit?: string
  ) {
    return this.settingsService.listSettingsAudit({
      domain,
      actor,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Post('snapshots')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  createSettingsSnapshot(@Body() body: Record<string, unknown>) {
    return this.settingsService.createSettingsSnapshot(body);
  }

  @Get('snapshots')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listSettingsSnapshots(@Query('limit') limit?: string) {
    return this.settingsService.listSettingsSnapshots(limit ? Number(limit) : undefined);
  }

  @Post('snapshots/:id/restore')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  restoreSettingsSnapshot(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.settingsService.restoreSettingsSnapshot(id, body);
  }

  @Post('data-governance/maintenance/run')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'RUN_DATA_GOVERNANCE_MAINTENANCE', entityType: 'DataGovernanceJob' })
  runDataGovernanceMaintenance(@Body() body: Record<string, unknown>) {
    return this.settingsService.runDataGovernanceMaintenance(body);
  }

  @Post('data-governance/backup/run')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'RUN_DATA_GOVERNANCE_BACKUP', entityType: 'DataGovernanceJob' })
  runDataGovernanceBackup(@Body() body: Record<string, unknown>) {
    return this.settingsService.runDataGovernanceBackup(body);
  }

  @Get('iam/users')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_IAM_USERS', entityType: 'IamUser' })
  listIamUsers(@Query() query: Record<string, unknown>) {
    return this.settingsEnterpriseService.listIamUsers(query);
  }

  @Post('iam/users')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createIamUser(@Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.createIamUser(body);
  }

  @Patch('iam/users/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateIamUser(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.updateIamUser(id, body);
  }

  @Post('iam/users/:id/reset-password')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  resetIamUserPassword(@Param('id') id: string) {
    return this.settingsEnterpriseService.resetIamUserPassword(id);
  }

  @Put('iam/users/:userId/scope-override')
  @Roles(UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_IAM_USER_SCOPE_OVERRIDE', entityType: 'IamUserScopeOverride', entityIdParam: 'userId' })
  updateIamUserScopeOverride(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.updateUserScopeOverride(userId, body);
  }

  @Put('iam/title-scope-mapping')
  @Roles(UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_IAM_TITLE_SCOPE_MAPPING', entityType: 'IamTitleScopeMapping' })
  updateIamTitleScopeMapping(@Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.updateTitleScopeMapping(body);
  }

  @Get('organization/tree')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getOrganizationTree() {
    return this.settingsEnterpriseService.getOrganizationTree();
  }

  @Post('organization/units')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createOrganizationUnit(@Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.createOrganizationUnit(body);
  }

  @Patch('organization/units/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateOrganizationUnit(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.updateOrganizationUnit(id, body);
  }

  @Post('organization/units/:id/move')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  moveOrganizationUnit(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.moveOrganizationUnit(id, body);
  }

  @Get('positions')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listPositions(@Query() query: Record<string, unknown>) {
    return this.settingsEnterpriseService.listPositions(query);
  }

  @Post('positions')
  @Roles(UserRole.ADMIN)
  createPosition(@Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.createPosition(body);
  }

  @Patch('positions/:positionId')
  @Roles(UserRole.ADMIN)
  updatePosition(@Param('positionId') positionId: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.updatePosition(positionId, body);
  }

  @Delete('positions/:positionId')
  @Roles(UserRole.ADMIN)
  deletePosition(@Param('positionId') positionId: string) {
    return this.settingsEnterpriseService.deletePosition(positionId);
  }

  @Get('positions/:positionId/employees')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listPositionEmployees(@Param('positionId') positionId: string, @Query() query: Record<string, unknown>) {
    return this.settingsEnterpriseService.listPositionEmployees(positionId, query);
  }

  @Get('permissions/positions/:positionId')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getPositionPermissions(@Param('positionId') positionId: string) {
    return this.settingsEnterpriseService.getPositionPermissions(positionId);
  }

  @Put('permissions/positions/:positionId')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  putPositionPermissions(@Param('positionId') positionId: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.putPositionPermissions(positionId, body);
  }

  @Put('permissions/users/:userId/overrides')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_USER_PERMISSION_OVERRIDES', entityType: 'PermissionPolicy', entityIdParam: 'userId' })
  putUserPermissionOverrides(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    return this.settingsEnterpriseService.putUserPermissionOverrides(userId, body);
  }

  @Get('permissions/iam-v2/mismatch-report')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_IAM_V2_MISMATCH_REPORT', entityType: 'PermissionPolicy' })
  getIamV2MismatchReport(@Query() query: Record<string, unknown>) {
    return this.settingsEnterpriseService.getIamMismatchReport(query);
  }

  @Get('permissions/effective')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_EFFECTIVE_PERMISSIONS', entityType: 'PermissionPolicy' })
  getEffectivePermissions(@Query() query: Record<string, unknown>) {
    return this.settingsEnterpriseService.getEffectivePermissions(query);
  }
}
