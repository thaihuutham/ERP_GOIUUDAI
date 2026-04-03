import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  CreateApprovalDto,
  CreateWorkflowDefinitionDto,
  CreateWorkflowInstanceDto,
  DelegateWorkflowDto,
  EscalateWorkflowDto,
  ReassignWorkflowDto,
  SubmitWorkflowDto,
  UpdateApprovalDto,
  UpdateWorkflowDefinitionDto,
  WorkflowDefinitionSimulateDto,
  UpdateWorkflowInstanceDto,
  WorkflowDecisionDto,
  WorkflowsListQueryDto
} from './dto/workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    @Inject(WorkflowsService) private readonly workflowsService: WorkflowsService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get('definitions')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async listDefinitions(@Query() query: WorkflowsListQueryDto, @Req() req?: { query?: Record<string, unknown> }) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.WORKFLOW_DEFINITION, req?.query);
    const result = await this.workflowsService.listDefinitions(query, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.WORKFLOW_DEFINITION, result);
  }

  @Post('definitions')
  @Roles(UserRole.ADMIN)
  async createDefinition(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const definition = await this.workflowsService.createDefinition(mutation.base as unknown as CreateWorkflowDefinitionDto);
    await this.customFields.applyEntityMutation(
      CustomFieldEntityType.WORKFLOW_DEFINITION,
      (definition as Record<string, unknown>)?.id,
      mutation
    );
    return this.customFields.wrapEntity(CustomFieldEntityType.WORKFLOW_DEFINITION, definition);
  }

  @Patch('definitions/:id')
  @Roles(UserRole.ADMIN)
  async updateDefinition(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const definition = await this.workflowsService.updateDefinition(id, mutation.base as unknown as UpdateWorkflowDefinitionDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.WORKFLOW_DEFINITION, id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.WORKFLOW_DEFINITION, definition);
  }

  @Post('definitions/:id/validate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  validateDefinition(@Param('id') id: string) {
    return this.workflowsService.validateDefinition(id);
  }

  @Post('definitions/:id/simulate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  simulateDefinition(@Param('id') id: string, @Body() body: WorkflowDefinitionSimulateDto) {
    return this.workflowsService.simulateDefinition(id, body);
  }

  @Post('definitions/:id/publish')
  @Roles(UserRole.ADMIN)
  async publishDefinition(@Param('id') id: string) {
    const definition = await this.workflowsService.publishDefinition(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.WORKFLOW_DEFINITION, definition);
  }

  @Post('definitions/:id/archive')
  @Roles(UserRole.ADMIN)
  async archiveDefinition(@Param('id') id: string) {
    const definition = await this.workflowsService.archiveDefinition(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.WORKFLOW_DEFINITION, definition);
  }

  @Get('instances')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInstances(@Query() query: WorkflowsListQueryDto) {
    return this.workflowsService.listInstances(query);
  }

  @Get('inbox')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInbox(@Query() query: WorkflowsListQueryDto, @Req() req: { user?: Record<string, unknown> }) {
    const actorId = this.resolveActorId(req);
    return this.workflowsService.listInbox({
      ...query,
      approverId: query.approverId ?? actorId ?? undefined
    });
  }

  @Get('requests')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listRequests(@Query() query: WorkflowsListQueryDto, @Req() req: { user?: Record<string, unknown> }) {
    const actorId = this.resolveActorId(req);
    return this.workflowsService.listRequests({
      ...query,
      requesterId: query.requesterId ?? actorId ?? undefined
    });
  }

  @Get('instances/:id')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_WORKFLOW_INSTANCE_DETAIL', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  getInstanceDetail(@Param('id') id: string) {
    return this.workflowsService.getInstanceDetail(id);
  }

  @Post('instances')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance' })
  createInstance(@Body() body: CreateWorkflowInstanceDto) {
    return this.workflowsService.createInstance(body);
  }

  @Patch('instances/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  updateInstance(@Param('id') id: string, @Body() body: UpdateWorkflowInstanceDto) {
    return this.workflowsService.updateInstance(id, body);
  }

  @Post('instances/submit')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'SUBMIT_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance' })
  submitInstance(@Body() body: SubmitWorkflowDto) {
    return this.workflowsService.submitInstance(body);
  }

  @Post('instances/:id/approve')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  approveInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.approveInstance(id, body);
  }

  @Post('instances/:id/reject')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'REJECT_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  rejectInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.rejectInstance(id, body);
  }

  @Post('instances/:id/cancel')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CANCEL_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  cancelInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.cancelInstance(id, body);
  }

  @Post('instances/:id/reassign')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'REASSIGN_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  reassignInstance(@Param('id') id: string, @Body() body: ReassignWorkflowDto) {
    return this.workflowsService.reassignInstance(id, body);
  }

  @Post('instances/:id/delegate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'DELEGATE_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  delegateInstance(@Param('id') id: string, @Body() body: DelegateWorkflowDto) {
    return this.workflowsService.delegateInstance(id, body);
  }

  @Post('instances/:id/escalate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ESCALATE_WORKFLOW_INSTANCE', entityType: 'WorkflowInstance', entityIdParam: 'id' })
  escalateInstance(@Param('id') id: string, @Body() body: EscalateWorkflowDto) {
    return this.workflowsService.escalateInstance(id, body);
  }

  @Get('instances/:id/approvals')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInstanceApprovals(@Param('id') id: string) {
    return this.workflowsService.listInstanceApprovals(id);
  }

  @Get('instances/:id/timeline')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInstanceTimeline(@Param('id') id: string) {
    return this.workflowsService.listInstanceTimeline(id);
  }

  @Get('approvals')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  listApprovals(@Query() query: WorkflowsListQueryDto) {
    return this.workflowsService.listApprovals(query);
  }

  @Post('approvals')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createApproval(@Body() body: CreateApprovalDto) {
    return this.workflowsService.createApproval(body);
  }

  @Patch('approvals/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateApproval(@Param('id') id: string, @Body() body: UpdateApprovalDto) {
    return this.workflowsService.updateApproval(id, body);
  }

  @Post('tasks/:id/approve')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_WORKFLOW_TASK', entityType: 'Approval', entityIdParam: 'id' })
  approveTask(@Param('id') id: string, @Body() body: WorkflowDecisionDto, @Req() req: { user?: Record<string, unknown> }) {
    return this.workflowsService.approveTask(id, {
      ...body,
      actorId: body.actorId ?? this.resolveActorId(req) ?? undefined
    });
  }

  @Post('tasks/:id/reject')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'REJECT_WORKFLOW_TASK', entityType: 'Approval', entityIdParam: 'id' })
  rejectTask(@Param('id') id: string, @Body() body: WorkflowDecisionDto, @Req() req: { user?: Record<string, unknown> }) {
    return this.workflowsService.rejectTask(id, {
      ...body,
      actorId: body.actorId ?? this.resolveActorId(req) ?? undefined
    });
  }

  @Post('tasks/:id/delegate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'DELEGATE_WORKFLOW_TASK', entityType: 'Approval', entityIdParam: 'id' })
  delegateTask(@Param('id') id: string, @Body() body: DelegateWorkflowDto, @Req() req: { user?: Record<string, unknown> }) {
    return this.workflowsService.delegateTask(id, {
      ...body,
      actorId: body.actorId ?? this.resolveActorId(req) ?? undefined
    });
  }

  @Post('tasks/:id/reassign')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'REASSIGN_WORKFLOW_TASK', entityType: 'Approval', entityIdParam: 'id' })
  reassignTask(@Param('id') id: string, @Body() body: ReassignWorkflowDto, @Req() req: { user?: Record<string, unknown> }) {
    return this.workflowsService.reassignTask(id, {
      ...body,
      actorId: body.actorId ?? this.resolveActorId(req) ?? undefined
    });
  }

  private resolveActorId(req: { user?: Record<string, unknown> }) {
    const user = req.user;
    if (!user || typeof user !== 'object') {
      return null;
    }
    const actorId = user.userId ?? user.sub;
    return typeof actorId === 'string' && actorId.trim() ? actorId.trim() : null;
  }
}
