import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
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
  UpdateWorkflowInstanceDto,
  WorkflowDecisionDto,
  WorkflowsListQueryDto
} from './dto/workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(@Inject(WorkflowsService) private readonly workflowsService: WorkflowsService) {}

  @Get('definitions')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  listDefinitions(@Query() query: WorkflowsListQueryDto) {
    return this.workflowsService.listDefinitions(query);
  }

  @Post('definitions')
  @Roles(UserRole.ADMIN)
  createDefinition(@Body() body: CreateWorkflowDefinitionDto) {
    return this.workflowsService.createDefinition(body);
  }

  @Patch('definitions/:id')
  @Roles(UserRole.ADMIN)
  updateDefinition(@Param('id') id: string, @Body() body: UpdateWorkflowDefinitionDto) {
    return this.workflowsService.updateDefinition(id, body);
  }

  @Get('instances')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInstances(@Query() query: WorkflowsListQueryDto) {
    return this.workflowsService.listInstances(query);
  }

  @Get('instances/:id')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getInstanceDetail(@Param('id') id: string) {
    return this.workflowsService.getInstanceDetail(id);
  }

  @Post('instances')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createInstance(@Body() body: CreateWorkflowInstanceDto) {
    return this.workflowsService.createInstance(body);
  }

  @Patch('instances/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateInstance(@Param('id') id: string, @Body() body: UpdateWorkflowInstanceDto) {
    return this.workflowsService.updateInstance(id, body);
  }

  @Post('instances/submit')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  submitInstance(@Body() body: SubmitWorkflowDto) {
    return this.workflowsService.submitInstance(body);
  }

  @Post('instances/:id/approve')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  approveInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.approveInstance(id, body);
  }

  @Post('instances/:id/reject')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  rejectInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.rejectInstance(id, body);
  }

  @Post('instances/:id/cancel')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  cancelInstance(@Param('id') id: string, @Body() body: WorkflowDecisionDto) {
    return this.workflowsService.cancelInstance(id, body);
  }

  @Post('instances/:id/reassign')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  reassignInstance(@Param('id') id: string, @Body() body: ReassignWorkflowDto) {
    return this.workflowsService.reassignInstance(id, body);
  }

  @Post('instances/:id/delegate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  delegateInstance(@Param('id') id: string, @Body() body: DelegateWorkflowDto) {
    return this.workflowsService.delegateInstance(id, body);
  }

  @Post('instances/:id/escalate')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
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
}
