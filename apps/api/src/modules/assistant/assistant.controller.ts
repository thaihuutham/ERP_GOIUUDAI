import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionAction, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AssistantAuthzService } from './assistant-authz.service';
import { AssistantDispatchService } from './assistant-dispatch.service';
import { AssistantKnowledgeService } from './assistant-knowledge.service';
import { AssistantProxyService } from './assistant-proxy.service';
import { AssistantReportsService } from './assistant-reports.service';
import {
  AssistantDispatchChannelsQueryDto,
  AssistantKnowledgeDocumentsQueryDto,
  AssistantKnowledgeSourcesQueryDto,
  AssistantProxyQueryDto,
  AssistantRunDecisionDto,
  AssistantRunsQueryDto,
  CreateAssistantDispatchChannelDto,
  CreateAssistantKnowledgeSourceDto,
  CreateAssistantRunDto,
  SyncAssistantKnowledgeSourceDto,
  UpdateAssistantDispatchChannelDto
} from './dto/assistant.dto';

@Controller('assistant')
@Roles(UserRole.USER, UserRole.ADMIN)
export class AssistantController {
  constructor(
    @Inject(AssistantAuthzService) private readonly authzService: AssistantAuthzService,
    @Inject(AssistantProxyService) private readonly proxyService: AssistantProxyService,
    @Inject(AssistantKnowledgeService) private readonly knowledgeService: AssistantKnowledgeService,
    @Inject(AssistantReportsService) private readonly reportsService: AssistantReportsService,
    @Inject(AssistantDispatchService) private readonly dispatchService: AssistantDispatchService
  ) {}

  @Get('access/me')
  async getAccessMe() {
    return this.authzService.resolveCurrentAccess();
  }

  @Get('proxy/sales')
  async getSalesProxy(@Query() query: AssistantProxyQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.proxyService.assertCanUseProxy(access);
    return this.proxyService.getSalesSnapshot(query, access);
  }

  @Get('proxy/cskh')
  async getCustomerCareProxy(@Query() query: AssistantProxyQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.proxyService.assertCanUseProxy(access);
    return this.proxyService.getCustomerCareSnapshot(query, access);
  }

  @Get('proxy/hr')
  async getHrProxy(@Query() query: AssistantProxyQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.proxyService.assertCanUseProxy(access);
    return this.proxyService.getHrSnapshot(query, access);
  }

  @Get('proxy/workflow')
  async getWorkflowProxy(@Query() query: AssistantProxyQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.proxyService.assertCanUseProxy(access);
    return this.proxyService.getWorkflowSnapshot(query, access);
  }

  @Get('proxy/finance')
  async getFinanceProxy(@Query() query: AssistantProxyQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.proxyService.assertCanUseProxy(access);
    return this.proxyService.getFinanceSnapshot(query, access);
  }

  @Get('knowledge/sources')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async listKnowledgeSources(@Query() query: AssistantKnowledgeSourcesQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.VIEW);
    return this.knowledgeService.listSources(query);
  }

  @Post('knowledge/sources')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async createKnowledgeSource(@Body() body: CreateAssistantKnowledgeSourceDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.CREATE);
    return this.knowledgeService.createSource(body, access);
  }

  @Post('knowledge/sources/:id/sync')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async syncKnowledgeSource(@Param('id') id: string, @Body() body: SyncAssistantKnowledgeSourceDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.UPDATE);
    return this.knowledgeService.syncSource(id, body, access);
  }

  @Get('knowledge/documents')
  async listKnowledgeDocuments(@Query() query: AssistantKnowledgeDocumentsQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.VIEW);
    return this.knowledgeService.listDocuments(query, access);
  }

  @Post('reports/runs')
  async createRun(@Body() body: CreateAssistantRunDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.CREATE);
    return this.reportsService.createRun(body, access);
  }

  @Get('reports/runs')
  async listRuns(@Query() query: AssistantRunsQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.VIEW);
    return this.reportsService.listRuns(query, access);
  }

  @Get('reports/runs/:id')
  async getRun(@Param('id') id: string) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.VIEW);
    return this.reportsService.getRun(id, access);
  }

  @Post('reports/runs/:id/approve')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async approveRun(@Param('id') id: string, @Body() body: AssistantRunDecisionDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.APPROVE);
    return this.reportsService.approveRun(id, body, access);
  }

  @Post('reports/runs/:id/reject')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async rejectRun(@Param('id') id: string, @Body() body: AssistantRunDecisionDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.APPROVE);
    return this.reportsService.rejectRun(id, body, access);
  }

  @Get('channels')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async listChannels(@Query() query: AssistantDispatchChannelsQueryDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.VIEW);
    return this.dispatchService.listChannels(query);
  }

  @Post('channels')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async createChannel(@Body() body: CreateAssistantDispatchChannelDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.CREATE);
    return this.dispatchService.createChannel(body, access);
  }

  @Patch('channels/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async updateChannel(@Param('id') id: string, @Body() body: UpdateAssistantDispatchChannelDto) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.UPDATE);
    return this.dispatchService.updateChannel(id, body, access);
  }

  @Post('channels/:id/test')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async testChannel(@Param('id') id: string) {
    const access = await this.authzService.resolveCurrentAccess();
    this.authzService.assertModulePermission(access, 'reports', PermissionAction.APPROVE);
    return this.dispatchService.testChannel(id);
  }
}
