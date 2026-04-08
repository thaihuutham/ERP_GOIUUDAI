import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../src/modules/projects/projects.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      project: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      projectTask: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      projectResource: {
        findMany: vi.fn(),
        create: vi.fn()
      },
      projectBudget: {
        findMany: vi.fn(),
        create: vi.fn()
      },
      timeEntry: {
        findMany: vi.fn(),
        create: vi.fn()
      },
      employee: {
        findFirst: vi.fn()
      }
    }
  };
}

describe('ProjectsService', () => {
  it('lists projects with cursor pagination + sortable metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.project.findMany.mockResolvedValue([
      { id: 'proj_3', name: 'Project C' },
      { id: 'proj_2', name: 'Project B' },
      { id: 'proj_1', name: 'Project A' }
    ]);

    const service = new ProjectsService(prisma as any);
    const result = await service.listProjects({
      limit: 2,
      sortBy: 'name',
      sortDir: 'asc'
    } as any);

    expect(prisma.client.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'proj_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'name',
      sortDir: 'asc'
    });
  });

  it('lists project resources with cursor pagination + sortable metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.projectResource.findMany.mockResolvedValue([
      { id: 'res_3', projectId: 'proj_1', resourceType: 'staff' },
      { id: 'res_2', projectId: 'proj_1', resourceType: 'asset' },
      { id: 'res_1', projectId: 'proj_2', resourceType: 'vendor' }
    ]);

    const service = new ProjectsService(prisma as any);
    const result = await service.listResources(undefined, {
      limit: 2,
      sortBy: 'createdAt',
      sortDir: 'desc'
    } as any);

    expect(prisma.client.projectResource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'res_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'createdAt',
      sortDir: 'desc'
    });
  });

  it('computes weighted progress, schedule variance and burnup metrics', async () => {
    const prisma = makePrismaMock();

    prisma.client.project.findFirst.mockResolvedValue({
      id: 'proj_1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: null,
      baselineStartAt: new Date('2026-01-01T00:00:00.000Z'),
      baselineEndAt: new Date('2026-01-11T00:00:00.000Z'),
      plannedBudget: 1000,
      actualBudget: 300,
      tasks: [
        {
          id: 'task_1',
          status: GenericStatus.APPROVED,
          weight: 2,
          completedAt: new Date('2026-01-08T00:00:00.000Z')
        },
        {
          id: 'task_2',
          status: GenericStatus.PENDING,
          weight: 1,
          completedAt: null
        }
      ],
      budgets: [],
      timeEntries: [{ hours: 2 }]
    });

    const service = new ProjectsService(prisma as any);
    const metrics = await service.getProjectMetrics('proj_1');

    expect(metrics.progress.weightedProgressPercent).toBe(66.67);
    expect(metrics.baseline.scheduleVarianceDays).toBe(-3);
    expect(metrics.cost.actualCost).toBe(500);
    expect(metrics.cost.burnupPercent).toBe(50);
  });

  it('updates task status and returns refreshed progress', async () => {
    const prisma = makePrismaMock();
    prisma.client.projectTask.findFirst.mockResolvedValue({
      id: 'task_3',
      projectId: 'proj_2',
      status: GenericStatus.APPROVED,
      weight: 1,
      completedAt: new Date('2026-02-05T00:00:00.000Z')
    });

    prisma.client.project.findFirst.mockResolvedValue({
      id: 'proj_2',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      startAt: new Date('2026-02-01T00:00:00.000Z'),
      endAt: null,
      baselineStartAt: null,
      baselineEndAt: null,
      plannedBudget: 0,
      actualBudget: 0,
      tasks: [
        {
          id: 'task_3',
          status: GenericStatus.APPROVED,
          weight: 1,
          completedAt: new Date('2026-02-05T00:00:00.000Z')
        }
      ],
      budgets: [],
      timeEntries: []
    });

    const service = new ProjectsService(prisma as any);
    const result = await service.updateTaskStatus('task_3', GenericStatus.APPROVED);

    expect(prisma.client.projectTask.updateMany).toHaveBeenCalled();
    expect(result.progressPercent).toBe(100);
  });
});
