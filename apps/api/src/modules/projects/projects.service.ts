import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listProjects(query: ProjectsListQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.ProjectWhereInput = {
      ...(query.status ? { status: query.status } : {})
    };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { code: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    return this.prisma.client.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
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
    const where: Prisma.ProjectTaskWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(status && status !== 'ALL' ? { status } : {})
    };

    return this.prisma.client.projectTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
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

  async listResources(projectId?: string) {
    return this.prisma.client.projectResource.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' }
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

  async listBudgets(projectId?: string) {
    return this.prisma.client.projectBudget.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' }
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

  async listTimeEntries(projectId?: string) {
    return this.prisma.client.timeEntry.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { workDate: 'desc' }
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
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for ${fieldName}`);
    }
    return parsed;
  }

  private take(limit?: number) {
    if (!limit || limit <= 0) {
      return 100;
    }
    return Math.min(limit, 250);
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
