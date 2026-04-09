import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditRead } from '../../common/audit/audit.decorators';
import { AuditService } from './audit.service';

@Controller('audit')
@Roles(UserRole.USER, UserRole.ADMIN)
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get('logs')
  @AuditRead({ action: 'AUDIT_LOG_LIST', entityType: 'AuditLog' })
  listLogs(@Query() query: Record<string, unknown>) {
    return this.auditService.listLogs({
      entityType: query.entityType ? String(query.entityType) : undefined,
      entityId: query.entityId ? String(query.entityId) : undefined,
      action: query.action ? String(query.action) : undefined,
      operationType: query.operationType ? String(query.operationType) : undefined,
      module: query.module ? String(query.module) : undefined,
      actorId: query.actorId ? String(query.actorId) : undefined,
      requestId: query.requestId ? String(query.requestId) : undefined,
      from: query.from ? String(query.from) : undefined,
      to: query.to ? String(query.to) : undefined,
      q: query.q ? String(query.q) : undefined,
      includeArchived: query.includeArchived === undefined ? undefined : String(query.includeArchived),
      cursor: query.cursor ? String(query.cursor) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      sortBy: query.sortBy ? String(query.sortBy) : undefined,
      sortDir: query.sortDir ? String(query.sortDir) : undefined
    });
  }

  @Get('objects/:entityType/:entityId/history')
  @AuditRead({ action: 'AUDIT_OBJECT_HISTORY', entityType: 'AuditLogObjectHistory', entityIdParam: 'entityId' })
  getObjectHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() query: Record<string, unknown>
  ) {
    return this.auditService.getObjectHistory(entityType, entityId, {
      action: query.action ? String(query.action) : undefined,
      operationType: query.operationType ? String(query.operationType) : undefined,
      module: query.module ? String(query.module) : undefined,
      actorId: query.actorId ? String(query.actorId) : undefined,
      requestId: query.requestId ? String(query.requestId) : undefined,
      from: query.from ? String(query.from) : undefined,
      to: query.to ? String(query.to) : undefined,
      q: query.q ? String(query.q) : undefined,
      includeArchived: query.includeArchived === undefined ? undefined : String(query.includeArchived),
      cursor: query.cursor ? String(query.cursor) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      sortBy: query.sortBy ? String(query.sortBy) : undefined,
      sortDir: query.sortDir ? String(query.sortDir) : undefined
    });
  }

  @Get('actions')
  @AuditRead({ action: 'AUDIT_ACTIONS_LIST', entityType: 'AuditActionTaxonomy' })
  getActions() {
    return this.auditService.getActions();
  }
}
