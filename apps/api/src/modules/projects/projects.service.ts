import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildCursorListResponse,
  resolvePageLimit,
  resolveSortQuery,
  sliceCursorItems
} from '../../common/pagination/pagination-response';
import { parseStrictDate } from '../../common/validation/date.validation';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProjectBudgetDto,
  CreateProjectDto,
  CreateProjectResourceDto,
  CreateProjectTaskDto,
  CreateProjectTimeEntryDto,
  ProjectForecastDto,
  ProjectsListQueryDto,
  UpdateProjectDto
} from './dto/projects.dto';

const COMPLETED_TASK_STATUSES: GenericStatus[] = [GenericStatus.APPROVED, GenericStatus.ARCHIVED];

@Injectable()
export class ProjectsService {
  private readonly projectSortableFields = ['createdAt', 'code', 'name', 'status', 'startAt', 'endAt', 'id'] as const;
  private readonly taskSortableFields = ['createdAt', 'projectId', 'title', 'assignedTo', 'status', 'dueAt', 'id'] as const;
  private readonly resourceSortableFields = ['createdAt', 'projectId', 'resourceType', 'resourceRef', 'quantity', 'id'] as const;
  private readonly budgetSortableFields = ['createdAt', 'projectId', 'budgetType', 'amount', 'id'] as const;
  private readonly timeEntrySortableFields = ['workDate', 'createdAt', 'projectId', 'employeeId', 'hours', 'id'] as const;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listProjects(query: ProjectsListQueryDto, entityIds?: string[]) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.projectSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'projects'
    });
    const keyword = query.q?.trim();
    const where: Prisma.ProjectWhereInput = {
      ...(Array.isArray(entityIds) ? { id: { in: entityIds } } : {}),
      ...(query.status ? { status: query.status } : {})
    };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.project.findMany({
      where,
      orderBy: this.buildProjectSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async getProject(id: string) {
    return this.ensureProject(id);
  }

  async createProject(payload: CreateProjectDto) {
    return this.prisma.client.project.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: payload.code ?? null,
        name: payload.name,
        description: payload.description ?? null,
        startAt: payload.startAt ? this.parseDate(payload.startAt, 'startAt') : null,
        endAt: payload.endAt ? this.parseDate(payload.endAt, 'endAt') : null,
        baselineStartAt: payload.baselineStartAt ? this.parseDate(payload.baselineStartAt, 'baselineStartAt') : null,
        baselineEndAt: payload.baselineEndAt ? this.parseDate(payload.baselineEndAt, 'baselineEndAt') : null,
        plannedBudget: payload.plannedBudget !== undefined ? new Prisma.Decimal(payload.plannedBudget) : null,
        actualBudget: payload.actualBudget !== undefined ? new Prisma.Decimal(payload.actualBudget) : null,
        forecastPercent: payload.forecastPercent ?? null,
        status: payload.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateProject(id: string, payload: UpdateProjectDto) {
    await this.ensureProject(id);

    await this.prisma.client.project.updateMany({
      where: { id },
      data: {
        code: payload.code,
        name: payload.name,
        description: payload.description,
        startAt: payload.startAt ? this.parseDate(payload.startAt, 'startAt') : undefined,
        endAt: payload.endAt ? this.parseDate(payload.endAt, 'endAt') : undefined,
        baselineStartAt: payload.baselineStartAt ? this.parseDate(payload.baselineStartAt, 'baselineStartAt') : undefined,
        baselineEndAt: payload.baselineEndAt ? this.parseDate(payload.baselineEndAt, 'baselineEndAt') : undefined,
        plannedBudget: payload.plannedBudget !== undefined ? new Prisma.Decimal(payload.plannedBudget) : undefined,
        actualBudget: payload.actualBudget !== undefined ? new Prisma.Decimal(payload.actualBudget) : undefined,
        forecastPercent: payload.forecastPercent,
        status: payload.status
      }
    });

    return this.ensureProject(id);
  }

  async listTasks(projectId: string | undefined, query: ProjectsListQueryDto, status?: GenericStatus | 'ALL') {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.taskSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'projects/tasks'
    });
    const keyword = query.q?.trim();
    const where: Prisma.ProjectTaskWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(status && status !== 'ALL' ? { status } : {})
    };

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { assignedTo: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.projectTask.findMany({
      where,
      orderBy: this.buildTaskSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async createTask(payload: CreateProjectTaskDto) {
    await this.ensureProject(payload.projectId);

    return this.prisma.client.projectTask.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        projectId: payload.projectId,
        title: payload.title,
        assignedTo: payload.assignedTo ?? null,
        weight: payload.weight ?? 1,
        dueAt: payload.dueAt ? this.parseDate(payload.dueAt, 'dueAt') : null,
        status: payload.status ?? GenericStatus.PENDING,
        actualStartAt: new Date()
      }
    });
  }

  async updateTaskStatus(taskId: string, status: GenericStatus) {
    if (!Object.values(GenericStatus).includes(status)) {
      throw new BadRequestException(`Trạng thái task không hợp lệ: ${status}`);
    }

    await this.prisma.client.projectTask.updateMany({
      where: { id: taskId },
      data: {
        status,
        completedAt: COMPLETED_TASK_STATUSES.includes(status) ? new Date() : null
      }
    });

    const task = await this.prisma.client.projectTask.findFirst({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Không tìm thấy task: ${taskId}`);
    }

    const metrics = await this.getProjectMetrics(task.projectId);
    return {
      task,
      progressPercent: metrics.progress.weightedProgressPercent
    };
  }

  async listResources(projectId?: string, query: PaginationQueryDto = {}) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.resourceSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'projects/resources'
    });
    const keyword = query.q?.trim();
    const where: Prisma.ProjectResourceWhereInput = {
      ...(projectId ? { projectId } : {})
    };

    if (keyword) {
      where.OR = [
        { resourceType: { contains: keyword, mode: 'insensitive' } },
        { resourceRef: { contains: keyword, mode: 'insensitive' } },
        { projectId: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.projectResource.findMany({
      where,
      orderBy: this.buildResourceSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async createResource(payload: CreateProjectResourceDto) {
    await this.ensureProject(payload.projectId);

    return this.prisma.client.projectResource.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        projectId: payload.projectId,
        resourceType: payload.resourceType,
        resourceRef: payload.resourceRef ?? null,
        quantity: payload.quantity ?? null
      }
    });
  }

  async listBudgets(projectId?: string, query: PaginationQueryDto = {}) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.budgetSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'projects/budgets'
    });
    const keyword = query.q?.trim();
    const where: Prisma.ProjectBudgetWhereInput = {
      ...(projectId ? { projectId } : {})
    };

    if (keyword) {
      where.OR = [
        { budgetType: { contains: keyword, mode: 'insensitive' } },
        { projectId: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.projectBudget.findMany({
      where,
      orderBy: this.buildBudgetSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async createBudget(payload: CreateProjectBudgetDto) {
    await this.ensureProject(payload.projectId);

    return this.prisma.client.projectBudget.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        projectId: payload.projectId,
        budgetType: payload.budgetType,
        amount: new Prisma.Decimal(payload.amount)
      }
    });
  }

  async listTimeEntries(projectId?: string, query: PaginationQueryDto = {}) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.timeEntrySortableFields,
      defaultSortBy: 'workDate',
      defaultSortDir: 'desc',
      errorLabel: 'projects/time-entries'
    });
    const keyword = query.q?.trim();
    const where: Prisma.TimeEntryWhereInput = {
      ...(projectId ? { projectId } : {})
    };

    if (keyword) {
      where.OR = [
        { employeeId: { contains: keyword, mode: 'insensitive' } },
        { note: { contains: keyword, mode: 'insensitive' } },
        { projectId: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.timeEntry.findMany({
      where,
      orderBy: this.buildTimeEntrySortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async createTimeEntry(payload: CreateProjectTimeEntryDto) {
    await this.ensureEmployee(payload.employeeId);

    if (payload.projectId) {
      await this.ensureProject(payload.projectId);
    }

    return this.prisma.client.timeEntry.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        projectId: payload.projectId ?? null,
        employeeId: payload.employeeId,
        workDate: payload.workDate ? this.parseDate(payload.workDate, 'workDate') : new Date(),
        hours: payload.hours,
        note: payload.note ?? null
      }
    });
  }

  async updateForecast(projectId: string, payload: ProjectForecastDto) {
    await this.ensureProject(projectId);

    await this.prisma.client.project.updateMany({
      where: { id: projectId },
      data: {
        forecastPercent: payload.forecastPercent,
        actualBudget: payload.actualBudget !== undefined ? new Prisma.Decimal(payload.actualBudget) : undefined
      }
    });

    return this.ensureProject(projectId);
  }

  async getProjectMetrics(projectId: string) {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId },
      include: {
        tasks: true,
        budgets: true,
        timeEntries: true
      }
    });

    if (!project) {
      throw new NotFoundException(`Không tìm thấy project: ${projectId}`);
    }

    const weightedTotal = project.tasks.reduce((sum, task) => sum + Math.max(1, task.weight ?? 1), 0);
    const weightedCompleted = project.tasks
      .filter((task) => COMPLETED_TASK_STATUSES.includes(task.status))
      .reduce((sum, task) => sum + Math.max(1, task.weight ?? 1), 0);

    const weightedProgressPercent = weightedTotal > 0
      ? Number(((weightedCompleted / weightedTotal) * 100).toFixed(2))
      : 0;

    const baselineDurationDays = this.diffDays(project.baselineStartAt, project.baselineEndAt);
    const actualEndAt = this.maxDate(project.tasks.map((task) => task.completedAt).filter(Boolean) as Date[])
      ?? project.endAt
      ?? new Date();
    const actualDurationDays = this.diffDays(project.startAt ?? project.baselineStartAt ?? project.createdAt, actualEndAt);
    const scheduleVarianceDays = baselineDurationDays !== null && actualDurationDays !== null
      ? actualDurationDays - baselineDurationDays
      : null;

    const budgetTotals = this.computeBudgetTotals(project.budgets);
    const plannedBudget = Number(project.plannedBudget ?? budgetTotals.planned ?? budgetTotals.total ?? 0);
    const actualBudget = Number(project.actualBudget ?? budgetTotals.actual ?? 0);
    const timeCost = project.timeEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0) * 100, 0);
    const actualCost = Number((actualBudget + timeCost).toFixed(2));
    const burnupPercent = plannedBudget > 0
      ? Number(((actualCost / plannedBudget) * 100).toFixed(2))
      : 0;

    const statusCounts = project.tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      projectId: project.id,
      progress: {
        weightedProgressPercent,
        taskCount: project.tasks.length,
        taskStatusBreakdown: statusCounts
      },
      baseline: {
        baselineStartAt: project.baselineStartAt,
        baselineEndAt: project.baselineEndAt,
        baselineDurationDays,
        actualDurationDays,
        scheduleVarianceDays
      },
      cost: {
        plannedBudget,
        actualBudget,
        timeCost,
        actualCost,
        burnupPercent
      }
    };
  }

  private computeBudgetTotals(rows: Array<{ budgetType: string; amount: Prisma.Decimal | null }>) {
    let planned = 0;
    let actual = 0;
    let total = 0;

    for (const row of rows) {
      const amount = Number(row.amount ?? 0);
      total += amount;

      const type = row.budgetType.toUpperCase();
      if (type.includes('PLAN')) {
        planned += amount;
      }
      if (type.includes('ACTUAL')) {
        actual += amount;
      }
    }

    return {
      planned,
      actual,
      total
    };
  }

  private maxDate(values: Date[]) {
    if (values.length === 0) {
      return null;
    }
    return values.reduce((max, value) => (value.getTime() > max.getTime() ? value : max), values[0]);
  }

  private diffDays(start?: Date | null, end?: Date | null) {
    if (!start || !end) {
      return null;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  }

  private parseDate(value: string, fieldName: string) {
    return parseStrictDate(value, fieldName);
  }

  private buildProjectSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ProjectOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ProjectOrderByWithRelationInput[];
  }

  private buildTaskSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ProjectTaskOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ProjectTaskOrderByWithRelationInput[];
  }

  private buildResourceSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ProjectResourceOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ProjectResourceOrderByWithRelationInput[];
  }

  private buildBudgetSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ProjectBudgetOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ProjectBudgetOrderByWithRelationInput[];
  }

  private buildTimeEntrySortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.TimeEntryOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.TimeEntryOrderByWithRelationInput[];
  }

  private async ensureProject(id: string) {
    const project = await this.prisma.client.project.findFirst({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Không tìm thấy project: ${id}`);
    }
    return project;
  }

  private async ensureEmployee(id: string) {
    const employee = await this.prisma.client.employee.findFirst({ where: { id } });
    if (!employee) {
      throw new BadRequestException(`Không tìm thấy nhân sự: ${id}`);
    }
    return employee;
  }
}
