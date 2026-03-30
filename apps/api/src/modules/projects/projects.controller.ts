import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Get()
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listProjects(@Query() query: ProjectsListQueryDto) {
    return this.projectsService.listProjects(query);
  }

  @Post()
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createProject(@Body() body: CreateProjectDto) {
    return this.projectsService.createProject(body);
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
  listResources(@Query('projectId') projectId?: string) {
    return this.projectsService.listResources(projectId);
  }

  @Post('resources')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createResource(@Body() body: CreateProjectResourceDto) {
    return this.projectsService.createResource(body);
  }

  @Get('budgets')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listBudgets(@Query('projectId') projectId?: string) {
    return this.projectsService.listBudgets(projectId);
  }

  @Post('budgets')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createBudget(@Body() body: CreateProjectBudgetDto) {
    return this.projectsService.createBudget(body);
  }

  @Get('time-entries')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listTimeEntries(@Query('projectId') projectId?: string) {
    return this.projectsService.listTimeEntries(projectId);
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
  getProject(@Param('id') id: string) {
    return this.projectsService.getProject(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateProject(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projectsService.updateProject(id, body);
  }
}
