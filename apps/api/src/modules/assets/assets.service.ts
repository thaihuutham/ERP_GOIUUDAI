import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AllocateAssetDto,
  AssetLifecycleTransitionDto,
  AssetsListQueryDto,
  CreateAssetDto,
  CreateMaintenanceScheduleDto,
  DepreciationPreviewQueryDto,
  PostDepreciationDto,
  ReturnAssetDto,
  UpdateAssetDto
} from './dto/assets.dto';

const ASSET_LIFECYCLE = {
  PROCURE: 'PROCURE',
  IN_USE: 'IN_USE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED'
} as const;

@Injectable()
export class AssetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAssets(query: AssetsListQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.AssetWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {})
    };

    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { assetCode: { contains: keyword, mode: 'insensitive' } },
        { category: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    return this.prisma.client.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 200)
    });
  }

  async getAsset(id: string) {
    return this.ensureAsset(id);
  }

  async createAsset(payload: CreateAssetDto) {
    return this.prisma.client.asset.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        assetCode: payload.assetCode ?? null,
        name: payload.name,
        category: payload.category ?? null,
        purchaseAt: payload.purchaseAt ? this.parseDate(payload.purchaseAt, 'purchaseAt') : null,
        value: payload.value !== undefined ? new Prisma.Decimal(payload.value) : null,
        lifecycleStatus: payload.lifecycleStatus ?? ASSET_LIFECYCLE.PROCURE,
        usefulLifeMonths: payload.usefulLifeMonths ?? null,
        depreciationMethod: payload.depreciationMethod ?? 'STRAIGHT_LINE',
        salvageValue: payload.salvageValue !== undefined ? new Prisma.Decimal(payload.salvageValue) : null,
        depreciationStartAt: payload.depreciationStartAt ? this.parseDate(payload.depreciationStartAt, 'depreciationStartAt') : null,
        status: payload.status ?? GenericStatus.ACTIVE
      }
    });
  }

  async updateAsset(id: string, payload: UpdateAssetDto) {
    await this.ensureAsset(id);

    await this.prisma.client.asset.updateMany({
      where: { id },
      data: {
        assetCode: payload.assetCode,
        name: payload.name,
        category: payload.category,
        purchaseAt: payload.purchaseAt ? this.parseDate(payload.purchaseAt, 'purchaseAt') : undefined,
        value: payload.value !== undefined ? new Prisma.Decimal(payload.value) : undefined,
        lifecycleStatus: payload.lifecycleStatus,
        usefulLifeMonths: payload.usefulLifeMonths,
        depreciationMethod: payload.depreciationMethod,
        salvageValue: payload.salvageValue !== undefined ? new Prisma.Decimal(payload.salvageValue) : undefined,
        depreciationStartAt: payload.depreciationStartAt ? this.parseDate(payload.depreciationStartAt, 'depreciationStartAt') : undefined,
        status: payload.status
      }
    });

    return this.ensureAsset(id);
  }

  async allocateAsset(id: string, payload: AllocateAssetDto) {
    const asset = await this.ensureAsset(id);

    if (asset.lifecycleStatus === ASSET_LIFECYCLE.RETIRED || asset.status === GenericStatus.INACTIVE) {
      throw new BadRequestException('Tài sản đã ngừng sử dụng, không thể cấp phát.');
    }

    await this.ensureEmployee(payload.employeeId);

    const allocation = await this.prisma.client.assetAllocation.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        assetId: id,
        employeeId: payload.employeeId,
        note: payload.note ?? null,
        status: GenericStatus.ACTIVE,
        allocatedAt: new Date()
      }
    });

    await this.prisma.client.asset.updateMany({
      where: { id },
      data: {
        status: GenericStatus.PENDING,
        lifecycleStatus: ASSET_LIFECYCLE.IN_USE
      }
    });

    return {
      allocation,
      asset: await this.ensureAsset(id)
    };
  }

  async returnAsset(id: string, payload: ReturnAssetDto) {
    const activeAllocation = await this.prisma.client.assetAllocation.findFirst({
      where: {
        assetId: id,
        status: GenericStatus.ACTIVE
      },
      orderBy: { allocatedAt: 'desc' }
    });

    if (!activeAllocation) {
      throw new NotFoundException('Tài sản chưa có bản ghi cấp phát đang hoạt động.');
    }

    await this.prisma.client.assetAllocation.updateMany({
      where: { id: activeAllocation.id },
      data: {
        status: GenericStatus.ARCHIVED,
        returnedAt: new Date(),
        note: payload.notes ? `${activeAllocation.note ?? ''}\n${payload.notes}`.trim() : activeAllocation.note
      }
    });

    await this.prisma.client.asset.updateMany({
      where: { id },
      data: {
        status: GenericStatus.ACTIVE,
        lifecycleStatus: ASSET_LIFECYCLE.IN_USE
      }
    });

    return this.ensureAsset(id);
  }

  async transitionLifecycle(id: string, payload: AssetLifecycleTransitionDto) {
    const asset = await this.ensureAsset(id);
    const action = payload.action.trim().toUpperCase();

    const current = asset.lifecycleStatus ?? ASSET_LIFECYCLE.PROCURE;
    const transition = this.resolveLifecycleTransition(current, action);
    if (!transition) {
      throw new BadRequestException(`Lifecycle transition không hợp lệ: ${current} -> ${action}`);
    }

    await this.prisma.client.asset.updateMany({
      where: { id },
      data: {
        lifecycleStatus: transition.next,
        status: transition.status,
        retiredAt: transition.next === ASSET_LIFECYCLE.RETIRED ? new Date() : null
      }
    });

    return this.ensureAsset(id);
  }

  async listAllocations(query: PaginationQueryDto, assetId?: string) {
    return this.prisma.client.assetAllocation.findMany({
      where: assetId ? { assetId } : {},
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            assetCode: true,
            lifecycleStatus: true
          }
        }
      },
      orderBy: { allocatedAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 300)
    });
  }

  async listMaintenanceSchedules(assetId: string, query: PaginationQueryDto) {
    await this.ensureAsset(assetId);
    return this.prisma.client.assetMaintenanceSchedule.findMany({
      where: { assetId },
      orderBy: { nextDueAt: 'asc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 300)
    });
  }

  async createMaintenanceSchedule(assetId: string, payload: CreateMaintenanceScheduleDto) {
    await this.ensureAsset(assetId);

    return this.prisma.client.assetMaintenanceSchedule.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        assetId,
        title: payload.title,
        frequencyDays: payload.frequencyDays ?? null,
        nextDueAt: this.parseDate(payload.nextDueAt, 'nextDueAt'),
        note: payload.note ?? null,
        status: GenericStatus.PENDING
      }
    });
  }

  async completeMaintenanceSchedule(scheduleId: string) {
    const schedule = await this.prisma.client.assetMaintenanceSchedule.findFirst({ where: { id: scheduleId } });
    if (!schedule) {
      throw new NotFoundException(`Không tìm thấy maintenance schedule: ${scheduleId}`);
    }

    const now = new Date();
    const nextDueAt = schedule.frequencyDays && schedule.frequencyDays > 0
      ? new Date(now.getTime() + schedule.frequencyDays * 24 * 60 * 60 * 1000)
      : schedule.nextDueAt;

    await this.prisma.client.assetMaintenanceSchedule.updateMany({
      where: { id: scheduleId },
      data: {
        lastDoneAt: now,
        nextDueAt,
        status: GenericStatus.ACTIVE
      }
    });

    await this.prisma.client.asset.updateMany({
      where: { id: schedule.assetId },
      data: {
        lifecycleStatus: ASSET_LIFECYCLE.IN_USE,
        status: GenericStatus.ACTIVE
      }
    });

    return this.prisma.client.assetMaintenanceSchedule.findFirst({ where: { id: scheduleId } });
  }

  async depreciationPreview(assetId: string, query: DepreciationPreviewQueryDto) {
    const asset = await this.ensureAsset(assetId);
    const months = query.months ?? 1;
    const plan = await this.computeDepreciationPlan(asset);

    const projectedAmount = Math.min(plan.remainingDepreciable, plan.monthlyAmount * months);
    const projectedBookValue = Math.max(plan.salvageValue, plan.bookValue - projectedAmount);

    return {
      assetId,
      months,
      monthlyAmount: plan.monthlyAmount,
      bookValue: plan.bookValue,
      salvageValue: plan.salvageValue,
      remainingDepreciable: plan.remainingDepreciable,
      projectedAmount,
      projectedBookValue
    };
  }

  async listDepreciationEntries(assetId: string, query: PaginationQueryDto) {
    await this.ensureAsset(assetId);
    return this.prisma.client.assetDepreciationEntry.findMany({
      where: { assetId },
      orderBy: { postedAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 300)
    });
  }

  async postDepreciation(assetId: string, payload: PostDepreciationDto) {
    const asset = await this.ensureAsset(assetId);
    const plan = await this.computeDepreciationPlan(asset);

    let amount = payload.amount ?? plan.monthlyAmount;
    amount = Math.min(amount, plan.remainingDepreciable);

    if (amount <= 0) {
      throw new BadRequestException('Không còn giá trị khấu hao để ghi nhận.');
    }

    const period = payload.period ?? this.toYearMonth(new Date());
    const bookValue = Math.max(plan.salvageValue, plan.bookValue - amount);

    const entry = await this.prisma.client.assetDepreciationEntry.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        assetId,
        period,
        amount: new Prisma.Decimal(amount),
        bookValue: new Prisma.Decimal(bookValue),
        postedAt: new Date(),
        note: payload.note ?? null
      }
    });

    return {
      entry,
      asset: await this.ensureAsset(assetId),
      remainingDepreciable: Math.max(0, plan.remainingDepreciable - amount),
      bookValue
    };
  }

  private resolveLifecycleTransition(current: string, action: string) {
    const map: Record<string, { from: string[]; next: string; status: GenericStatus }> = {
      ACTIVATE: {
        from: [ASSET_LIFECYCLE.PROCURE, ASSET_LIFECYCLE.MAINTENANCE],
        next: ASSET_LIFECYCLE.IN_USE,
        status: GenericStatus.ACTIVE
      },
      SEND_MAINTENANCE: {
        from: [ASSET_LIFECYCLE.IN_USE],
        next: ASSET_LIFECYCLE.MAINTENANCE,
        status: GenericStatus.PENDING
      },
      RETURN_MAINTENANCE: {
        from: [ASSET_LIFECYCLE.MAINTENANCE],
        next: ASSET_LIFECYCLE.IN_USE,
        status: GenericStatus.ACTIVE
      },
      RETIRE: {
        from: [ASSET_LIFECYCLE.PROCURE, ASSET_LIFECYCLE.IN_USE, ASSET_LIFECYCLE.MAINTENANCE],
        next: ASSET_LIFECYCLE.RETIRED,
        status: GenericStatus.INACTIVE
      }
    };

    const rule = map[action];
    if (!rule || !rule.from.includes(current)) {
      return null;
    }

    return rule;
  }

  private async computeDepreciationPlan(asset: Awaited<ReturnType<AssetsService['ensureAsset']>>) {
    const value = Number(asset.value ?? 0);
    const salvageValue = Number(asset.salvageValue ?? 0);
    const usefulLifeMonths = Number(asset.usefulLifeMonths ?? 0);

    if (value <= 0 || usefulLifeMonths <= 0) {
      throw new BadRequestException('Thiếu giá trị tài sản hoặc usefulLifeMonths để tính khấu hao.');
    }

    if (salvageValue >= value) {
      throw new BadRequestException('salvageValue phải nhỏ hơn value.');
    }

    const sum = await this.prisma.client.assetDepreciationEntry.aggregate({
      where: { assetId: asset.id },
      _sum: {
        amount: true
      }
    });

    const postedAmount = Number(sum._sum.amount ?? 0);
    const depreciableBase = value - salvageValue;
    const remainingDepreciable = Math.max(0, depreciableBase - postedAmount);
    const monthlyAmount = depreciableBase / usefulLifeMonths;
    const bookValue = Math.max(salvageValue, value - postedAmount);

    return {
      value,
      salvageValue,
      usefulLifeMonths,
      postedAmount,
      remainingDepreciable,
      monthlyAmount,
      bookValue
    };
  }

  private async ensureAsset(id: string) {
    const asset = await this.prisma.client.asset.findFirst({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Không tìm thấy tài sản: ${id}`);
    }
    return asset;
  }

  private async ensureEmployee(id: string) {
    const employee = await this.prisma.client.employee.findFirst({ where: { id } });
    if (!employee) {
      throw new BadRequestException(`Không tìm thấy nhân sự: ${id}`);
    }
    return employee;
  }

  private parseDate(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for ${fieldName}`);
    }
    return parsed;
  }

  private toYearMonth(date: Date) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }
}
