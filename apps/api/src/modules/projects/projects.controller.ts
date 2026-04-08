import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, GenericStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  CreateProjectBudgetDto,
  CreateProjectDto,
  CreateProjectResourceDto,
  CreateProjectTaskDto,
  CreateProjectTimeEntryDto,
  ProjectForecastDto,
  ProjectsListQueryDto,
  UpdateProjectDto,
  UpdateTaskStatusDto
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get()
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  async listProjects(@Query() query: ProjectsListQueryDto, @Req() req?: { query?: Record<string, unknown> }) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.PROJECT, req?.query);
    const result = await this.projectsService.listProjects(query, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.PROJECT, result);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async createProject(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const project = await this.projectsService.createProject(mutation.base as unknown as CreateProjectDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PROJECT, (project as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PROJECT, project);
  }

  @Get('tasks')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listTasks(
    @Query() query: PaginationQueryDto,
    @Query('projectId') projectId?: string,
    @Query('status') status?: GenericStatus | 'ALL'
  ) {
    return this.projectsService.listTasks(projectId, query, status);
  }

  @Post('tasks')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createTask(@Body() body: CreateProjectTaskDto) {
    return this.projectsService.createTask(body);
  }

  @Post('tasks/:id/status')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateTaskStatus(@Param('id') id: string, @Body() body: UpdateTaskStatusDto) {
    return this.projectsService.updateTaskStatus(id, body.status);
  }

  @Get('resources')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listResources(@Query() query: PaginationQueryDto, @Query('projectId') projectId?: string) {
    return this.projectsService.listResources(projectId, query);
  }

  @Post('resources')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createResource(@Body() body: CreateProjectResourceDto) {
    return this.projectsService.createResource(body);
  }

  @Get('budgets')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listBudgets(@Query() query: PaginationQueryDto, @Query('projectId') projectId?: string) {
    return this.projectsService.listBudgets(projectId, query);
  }

  @Post('budgets')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createBudget(@Body() body: CreateProjectBudgetDto) {
    return this.projectsService.createBudget(body);
  }

  @Get('time-entries')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listTimeEntries(@Query() query: PaginationQueryDto, @Query('projectId') projectId?: string) {
    return this.projectsService.listTimeEntries(projectId, query);
  }

  @Post('time-entries')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  createTimeEntry(@Body() body: CreateProjectTimeEntryDto) {
    return this.projectsService.createTimeEntry(body);
  }

  @Get(':id/metrics')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  metrics(@Param('id') id: string) {
    return this.projectsService.getProjectMetrics(id);
  }

  @Patch(':id/forecast')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateForecast(@Param('id') id: string, @Body() body: ProjectForecastDto) {
    return this.projectsService.updateForecast(id, body);
  }

  @Get(':id')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  async getProject(@Param('id') id: string) {
    const project = await this.projectsService.getProject(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.PROJECT, project);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  async updateProject(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const project = await this.projectsService.updateProject(id, mutation.base as unknown as UpdateProjectDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.PROJECT, id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.PROJECT, project);
  }
}
