import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { CustomerAssignmentAction, CustomerCareStatus, Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────

type DistributionConfig = {
  enabled: boolean;
  strategy: string;
  capFillTarget: number;
  kpiMetric: string;
  kpiPeriod: string;
  eligibleStaffFilter: string;
  eligibleDepartmentIds: string[];
  eligiblePositionIds: string[];
  duplicateCheckFields: string[];
  reclaimIdleEnabled: boolean;
  reclaimIdleAfterHours: number;
  reclaimFailedEnabled: boolean;
  reclaimFailedAfterDays: number;
  rotationMaxRounds: number;
  failedStatuses: string[];
  schedulerIntervalMinutes: number;
};

type StaffWithStats = {
  id: string;
  code: string | null;
  fullName: string;
  pendingCount: number;
  totalAssigned: number;
  kpiScore: number;
};

type DistributionResult = {
  assigned: number;
  reclaimedIdle: number;
  reclaimedFailed: number;
  rotated: number;
  errors: string[];
};

type DuplicateCheckResult = {
  isDuplicate: boolean;
  existingCustomerId?: string;
  existingCustomerName?: string;
  ownerStaffId?: string | null;
  ownerStaffName?: string;
  matchedField?: string;
};

// ─── Service ────────────────────────────────────────────────────────

@Injectable()
export class CustomerDistributionService {
  private readonly logger = new Logger(CustomerDistributionService.name);
  private lastRoundRobinIndex = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  /** Resolve tenant ID from runtime settings or fallback */
  private getTenantId(): string {
    return (this.runtimeSettings as any).tenantId
      ?? process.env.DEFAULT_TENANT_ID
      ?? 'default';
  }

  // ── Public: full cycle ────────────────────────────────────────────

  async runDistributionCycle(): Promise<DistributionResult> {
    const config = await this.getConfig();
    const result: DistributionResult = { assigned: 0, reclaimedIdle: 0, reclaimedFailed: 0, rotated: 0, errors: [] };

    if (!config.enabled) {
      return result;
    }

    try {
      result.assigned = await this.distributeNewCustomers(config);
    } catch (err) {
      result.errors.push(`distribute: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (config.reclaimIdleEnabled) {
      try {
        result.reclaimedIdle = await this.reclaimIdleCustomers(config);
      } catch (err) {
        result.errors.push(`reclaimIdle: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (config.reclaimFailedEnabled) {
      try {
        const rotateResult = await this.reclaimAndRotateFailedCustomers(config);
        result.reclaimedFailed = rotateResult.reclaimed;
        result.rotated = rotateResult.rotated;
      } catch (err) {
        result.errors.push(`reclaimFailed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (result.assigned || result.reclaimedIdle || result.reclaimedFailed) {
      this.logger.log(
        `Distribution cycle: assigned=${result.assigned} reclaimedIdle=${result.reclaimedIdle} reclaimedFailed=${result.reclaimedFailed} rotated=${result.rotated}`
      );
    }

    return result;
  }

  // ── Distribute new customers ──────────────────────────────────────

  async distributeNewCustomers(config?: DistributionConfig): Promise<number> {
    const cfg = config ?? await this.getConfig();
    if (!cfg.enabled) return 0;

    const eligible = await this.getEligibleStaff(cfg);
    if (eligible.length === 0) return 0;

    // Pool = customers with no owner
    const pool = await this.prisma.client.customer.findMany({
      where: { ownerStaffId: null, status: 'MOI_CHUA_TU_VAN' },
      orderBy: { createdAt: 'asc' },
      take: 200, // batch limit
      select: { id: true }
    });

    if (pool.length === 0) return 0;

    let assigned = 0;

    for (const customer of pool) {
      const staffId = this.selectStaff(cfg, eligible);
      if (!staffId) break;

      await this.assignCustomer(
        customer.id,
        null,
        staffId,
        'AUTO_ASSIGNED',
        `Chia tự động (${cfg.strategy})`,
        cfg.strategy,
        0,
        'system-scheduler'
      );

      // Update eligible stats
      const staff = eligible.find((s) => s.id === staffId);
      if (staff) {
        staff.pendingCount += 1;
        staff.totalAssigned += 1;
      }

      assigned++;
    }

    return assigned;
  }

  /** Assign a single customer immediately (called from CRM create hook) */
  async assignNewCustomerImmediate(customerId: string): Promise<string | null> {
    const cfg = await this.getConfig();
    if (!cfg.enabled) return null;

    const eligible = await this.getEligibleStaff(cfg);
    if (eligible.length === 0) return null;

    const staffId = this.selectStaff(cfg, eligible);
    if (!staffId) return null;

    await this.assignCustomer(
      customerId,
      null,
      staffId,
      'AUTO_ASSIGNED',
      `Chia tự động khi tạo KH (${cfg.strategy})`,
      cfg.strategy,
      0,
      'system-auto'
    );

    return staffId;
  }

  // ── Strategy selection ────────────────────────────────────────────

  private selectStaff(config: DistributionConfig, eligible: StaffWithStats[]): string | null {
    if (eligible.length === 0) return null;

    switch (config.strategy) {
      case 'ROUND_ROBIN':
        return this.selectRoundRobin(eligible);
      case 'LEAST_PENDING':
        return this.selectLeastPending(eligible);
      case 'CAP_FILL':
        return this.selectCapFill(eligible, config.capFillTarget);
      case 'KPI_WEIGHTED':
        return this.selectKpiWeighted(eligible);
      default:
        return this.selectRoundRobin(eligible);
    }
  }

  private selectRoundRobin(staff: StaffWithStats[]): string {
    const idx = this.lastRoundRobinIndex % staff.length;
    this.lastRoundRobinIndex = idx + 1;
    return staff[idx].id;
  }

  private selectLeastPending(staff: StaffWithStats[]): string {
    const sorted = [...staff].sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return a.pendingCount - b.pendingCount;
      return (a.code ?? '').localeCompare(b.code ?? '');
    });
    return sorted[0].id;
  }

  private selectCapFill(staff: StaffWithStats[], target: number): string | null {
    const needsFill = staff.filter((s) => s.pendingCount < target);
    if (needsFill.length === 0) return null;
    // Pick the one with the most room
    needsFill.sort((a, b) => a.pendingCount - b.pendingCount);
    return needsFill[0].id;
  }

  private selectKpiWeighted(staff: StaffWithStats[]): string {
    // Sort by KPI descending → pick top
    const sorted = [...staff].sort((a, b) => b.kpiScore - a.kpiScore);
    return sorted[0].id;
  }

  // ── Get eligible staff with stats ─────────────────────────────────

  async getEligibleStaff(config?: DistributionConfig): Promise<StaffWithStats[]> {
    const cfg = config ?? await this.getConfig();

    const where: Prisma.EmployeeWhereInput = { status: 'ACTIVE' };

    if (cfg.eligibleStaffFilter === 'by_department' && cfg.eligibleDepartmentIds.length > 0) {
      where.departmentId = { in: cfg.eligibleDepartmentIds };
    } else if (cfg.eligibleStaffFilter === 'by_position' && cfg.eligiblePositionIds.length > 0) {
      where.positionId = { in: cfg.eligiblePositionIds };
    }

    const employees = await this.prisma.client.employee.findMany({
      where,
      select: { id: true, code: true, fullName: true }
    });

    if (employees.length === 0) return [];

    const employeeIds = employees.map((e) => e.id);

    // Count pending customers per staff
    const pendingCounts = await this.prisma.client.customer.groupBy({
      by: ['ownerStaffId'],
      where: {
        ownerStaffId: { in: employeeIds },
        status: 'MOI_CHUA_TU_VAN'
      },
      _count: { id: true }
    });
    const pendingMap = new Map(pendingCounts.map((r) => [r.ownerStaffId!, r._count.id]));

    // Total assigned
    const totalCounts = await this.prisma.client.customer.groupBy({
      by: ['ownerStaffId'],
      where: { ownerStaffId: { in: employeeIds } },
      _count: { id: true }
    });
    const totalMap = new Map(totalCounts.map((r) => [r.ownerStaffId!, r._count.id]));

    // KPI (revenue-based or close-rate-based)
    const kpiMap = await this.computeKpiScores(employeeIds, cfg);

    return employees.map((emp) => ({
      id: emp.id,
      code: emp.code,
      fullName: emp.fullName,
      pendingCount: pendingMap.get(emp.id) ?? 0,
      totalAssigned: totalMap.get(emp.id) ?? 0,
      kpiScore: kpiMap.get(emp.id) ?? 0
    }));
  }

  private async computeKpiScores(
    employeeIds: string[],
    config: DistributionConfig
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (config.strategy !== 'KPI_WEIGHTED') {
      return result;
    }

    const now = new Date();
    let periodStart: Date;

    switch (config.kpiPeriod) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        periodStart = d;
        break;
      }
      case 'quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
      default: // month
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (config.kpiMetric === 'revenue') {
      const revenues = await this.prisma.client.order.groupBy({
        by: ['employeeId'],
        where: {
          employeeId: { in: employeeIds },
          status: 'ACTIVE',
          createdAt: { gte: periodStart }
        },
        _sum: { totalAmount: true }
      });
      for (const r of revenues) {
        if (r.employeeId) {
          result.set(r.employeeId, Number(r._sum.totalAmount ?? 0));
        }
      }
    } else if (config.kpiMetric === 'close_rate') {
      // Close rate: customers moved to DONG_Y_CHUYEN_THANH_KH / total assigned
      for (const empId of employeeIds) {
        const [closed, total] = await Promise.all([
          this.prisma.client.customer.count({
            where: {
              ownerStaffId: empId,
              status: 'DONG_Y_CHUYEN_THANH_KH',
              updatedAt: { gte: periodStart }
            }
          }),
          this.prisma.client.customer.count({
            where: { ownerStaffId: empId, updatedAt: { gte: periodStart } }
          })
        ]);
        result.set(empId, total > 0 ? (closed / total) * 100 : 0);
      }
    }

    return result;
  }

  // ── Reclaim idle ──────────────────────────────────────────────────

  async reclaimIdleCustomers(config?: DistributionConfig): Promise<number> {
    const cfg = config ?? await this.getConfig();
    if (!cfg.reclaimIdleEnabled) return 0;

    const cutoff = new Date(Date.now() - cfg.reclaimIdleAfterHours * 3600 * 1000);

    // Find customers assigned but with no recent interaction
    const idleCustomers = await this.prisma.client.customer.findMany({
      where: {
        ownerStaffId: { not: null },
        status: 'MOI_CHUA_TU_VAN',
        updatedAt: { lt: cutoff },
        interactions: { none: { createdAt: { gte: cutoff } } }
      },
      select: { id: true, ownerStaffId: true },
      take: 100
    });

    let reclaimed = 0;
    for (const cust of idleCustomers) {
      await this.assignCustomer(
        cust.id,
        cust.ownerStaffId,
        null,
        'RECLAIMED_IDLE',
        `Thu hồi: không chăm sóc sau ${cfg.reclaimIdleAfterHours}h`,
        null,
        0,
        'system-scheduler'
      );
      reclaimed++;
    }

    return reclaimed;
  }

  // ── Reclaim failed + rotation ─────────────────────────────────────

  async reclaimAndRotateFailedCustomers(
    config?: DistributionConfig
  ): Promise<{ reclaimed: number; rotated: number }> {
    const cfg = config ?? await this.getConfig();
    if (!cfg.reclaimFailedEnabled) return { reclaimed: 0, rotated: 0 };

    const cutoff = new Date(Date.now() - cfg.reclaimFailedAfterDays * 24 * 3600 * 1000);
    const failedStatuses = cfg.failedStatuses as CustomerCareStatus[];

    const failedCustomers = await this.prisma.client.customer.findMany({
      where: {
        ownerStaffId: { not: null },
        status: { in: failedStatuses },
        updatedAt: { lt: cutoff }
      },
      select: { id: true, ownerStaffId: true },
      take: 100
    });

    if (failedCustomers.length === 0) return { reclaimed: 0, rotated: 0 };

    const eligible = await this.getEligibleStaff(cfg);
    let reclaimed = 0;
    let rotated = 0;

    for (const cust of failedCustomers) {
      const currentStaffId = cust.ownerStaffId!;

      // Add current staff to blacklist
      await this.addToBlacklist(cust.id, currentStaffId);

      // Get current rotation round
      const lastLog = await this.prisma.client.customerAssignmentLog.findFirst({
        where: { customerId: cust.id },
        orderBy: { createdAt: 'desc' }
      });
      const currentRound = (lastLog?.rotationRound ?? 0) + 1;

      // Check max rounds
      if (cfg.rotationMaxRounds > 0 && currentRound > cfg.rotationMaxRounds) {
        // Exceeded max rounds — return to pool and mark as exhausted
        await this.assignCustomer(
          cust.id,
          currentStaffId,
          null,
          'RETURNED_TO_POOL',
          `Hết vòng quay (${cfg.rotationMaxRounds} lần). Cần admin xử lý.`,
          null,
          currentRound,
          'system-scheduler'
        );
        reclaimed++;
        continue;
      }

      // Find next staff (not in blacklist)
      const nextStaffId = await this.findNextRotationStaff(cust.id, eligible);

      if (!nextStaffId) {
        // No eligible staff left — return to pool
        await this.assignCustomer(
          cust.id,
          currentStaffId,
          null,
          'RETURNED_TO_POOL',
          'Không còn NV nào chưa chăm sóc KH này. Cần admin xử lý.',
          null,
          currentRound,
          'system-scheduler'
        );
        reclaimed++;
        continue;
      }

      // Rotate to next staff
      await this.assignCustomer(
        cust.id,
        currentStaffId,
        nextStaffId,
        'ROTATION',
        `Quay vòng lần ${currentRound}: NV cũ tư vấn thất bại`,
        cfg.strategy,
        currentRound,
        'system-scheduler'
      );
      // Reset status for retry
      await this.prisma.client.customer.update({
        where: { id: cust.id },
        data: { status: 'MOI_CHUA_TU_VAN' }
      });
      rotated++;
    }

    return { reclaimed, rotated };
  }

  private async findNextRotationStaff(
    customerId: string,
    eligible: StaffWithStats[]
  ): Promise<string | null> {
    const blacklisted = await this.prisma.client.customerRotationBlacklist.findMany({
      where: { customerId },
      select: { staffId: true }
    });
    const blackSet = new Set(blacklisted.map((b) => b.staffId));

    const available = eligible.filter((s) => !blackSet.has(s.id));
    if (available.length === 0) return null;

    // Pick least pending among available
    available.sort((a, b) => a.pendingCount - b.pendingCount);
    return available[0].id;
  }

  private async addToBlacklist(customerId: string, staffId: string) {
    const tenantId = this.getTenantId();
    try {
      await this.prisma.client.customerRotationBlacklist.create({
        data: { customerId, staffId, tenant_Id: tenantId }
      });
    } catch {
      // Ignore unique constraint violations (already blacklisted)
    }
  }

  // ── Assign + Log ──────────────────────────────────────────────────

  async assignCustomer(
    customerId: string,
    fromStaffId: string | null,
    toStaffId: string | null,
    action: string,
    reason: string,
    strategyUsed: string | null,
    rotationRound: number,
    triggeredBy: string
  ) {
    const tenantId = this.getTenantId();
    await this.prisma.client.$transaction([
      this.prisma.client.customer.update({
        where: { id: customerId },
        data: { ownerStaffId: toStaffId }
      }),
      this.prisma.client.customerAssignmentLog.create({
        data: {
          tenant_Id: tenantId,
          customerId,
          fromStaffId,
          toStaffId,
          action: action as CustomerAssignmentAction,
          reason,
          strategyUsed,
          rotationRound,
          triggeredBy
        }
      })
    ]);
  }

  /** Manual assign by admin */
  async manualAssign(customerId: string, toStaffId: string, adminId: string) {
    const customer = await this.prisma.client.customer.findFirst({
      where: { id: customerId },
      select: { ownerStaffId: true }
    });

    await this.assignCustomer(
      customerId,
      customer?.ownerStaffId ?? null,
      toStaffId,
      'MANUAL_ASSIGNED',
      'Gán bởi admin',
      null,
      0,
      `admin:${adminId}`
    );
  }

  /** Manual reclaim by admin */
  async manualReclaim(customerId: string, adminId: string) {
    const customer = await this.prisma.client.customer.findFirst({
      where: { id: customerId },
      select: { ownerStaffId: true }
    });

    await this.assignCustomer(
      customerId,
      customer?.ownerStaffId ?? null,
      null,
      'RETURNED_TO_POOL',
      'Thu hồi bởi admin',
      null,
      0,
      `admin:${adminId}`
    );
  }

  // ── Duplicate check ───────────────────────────────────────────────

  async checkDuplicate(
    phone?: string | null,
    email?: string | null
  ): Promise<DuplicateCheckResult> {
    const cfg = await this.getConfig();
    const checkPhone = cfg.duplicateCheckFields.includes('phone') && phone;
    const checkEmail = cfg.duplicateCheckFields.includes('email') && email;

    let existing: any = null;
    let matchedField = '';

    if (checkPhone) {
      existing = await this.prisma.client.customer.findFirst({
        where: { phoneNormalized: phone },
        select: { id: true, fullName: true, ownerStaffId: true }
      });
      if (existing) matchedField = 'phone';
    }

    if (!existing && checkEmail) {
      existing = await this.prisma.client.customer.findFirst({
        where: { emailNormalized: email?.toLowerCase() },
        select: { id: true, fullName: true, ownerStaffId: true }
      });
      if (existing) matchedField = 'email';
    }

    if (!existing) {
      return { isDuplicate: false };
    }

    let ownerName: string | undefined;
    if (existing.ownerStaffId) {
      const employee = await this.prisma.client.employee.findFirst({
        where: { id: existing.ownerStaffId },
        select: { fullName: true }
      });
      ownerName = employee?.fullName ?? undefined;
    }

    return {
      isDuplicate: true,
      existingCustomerId: existing.id,
      existingCustomerName: existing.fullName,
      ownerStaffId: existing.ownerStaffId,
      ownerStaffName: ownerName,
      matchedField
    };
  }

  // ── Dashboard stats ───────────────────────────────────────────────

  async getDistributionStatus() {
    const [pool, totalAssigned, totalWithOwner, recentLogs] = await Promise.all([
      this.prisma.client.customer.count({
        where: { ownerStaffId: null, status: 'MOI_CHUA_TU_VAN' }
      }),
      this.prisma.client.customerAssignmentLog.count(),
      this.prisma.client.customer.count({
        where: { ownerStaffId: { not: null } }
      }),
      this.prisma.client.customerAssignmentLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          customer: { select: { fullName: true, phone: true } }
        }
      })
    ]);

    const pendingByStaff = await this.prisma.client.customer.groupBy({
      by: ['ownerStaffId'],
      where: {
        ownerStaffId: { not: null },
        status: 'MOI_CHUA_TU_VAN'
      },
      _count: { id: true }
    });

    return {
      poolSize: pool,
      totalAssigned,
      totalWithOwner,
      pendingByStaff: pendingByStaff.map((r) => ({
        staffId: r.ownerStaffId,
        count: r._count.id
      })),
      recentLogs
    };
  }

  async getStaffStats() {
    const cfg = await this.getConfig();
    const eligible = await this.getEligibleStaff(cfg);

    // For each staff, also count contacted and failed
    const staffIds = eligible.map((s) => s.id);

    // Count by status for each staff
    const statusCounts = await this.prisma.client.customer.groupBy({
      by: ['ownerStaffId', 'status'],
      where: { ownerStaffId: { in: staffIds } },
      _count: { id: true }
    });

    const statsMap = new Map<string, Record<string, number>>();
    for (const row of statusCounts) {
      if (!row.ownerStaffId) continue;
      if (!statsMap.has(row.ownerStaffId)) {
        statsMap.set(row.ownerStaffId, {});
      }
      statsMap.get(row.ownerStaffId)![row.status] = row._count.id;
    }

    return eligible.map((s) => {
      const counts = statsMap.get(s.id) ?? {};
      return {
        ...s,
        statusBreakdown: counts,
        contactedCount: Object.entries(counts)
          .filter(([k]) => k !== 'MOI_CHUA_TU_VAN')
          .reduce((sum, [, v]) => sum + v, 0),
        failedCount: (counts['KH_TU_CHOI'] ?? 0) +
          (counts['NGUOI_NHA_LAM_THUE_BAO'] ?? 0) +
          (counts['KHONG_NGHE_MAY_LAN_1'] ?? 0) +
          (counts['KHONG_NGHE_MAY_LAN_2'] ?? 0)
      };
    });
  }

  async getAssignmentLogs(params?: {
    customerId?: string;
    staffId?: string;
    action?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.CustomerAssignmentLogWhereInput = {};
    if (params?.customerId) where.customerId = params.customerId;
    if (params?.staffId) {
      where.OR = [{ fromStaffId: params.staffId }, { toStaffId: params.staffId }];
    }
    if (params?.action) where.action = params.action as CustomerAssignmentAction;

    const [data, total] = await Promise.all([
      this.prisma.client.customerAssignmentLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params?.take ?? 50,
        skip: params?.skip ?? 0,
        include: {
          customer: { select: { fullName: true, phone: true } }
        }
      }),
      this.prisma.client.customerAssignmentLog.count({ where })
    ]);

    return { data, total };
  }

  // ── Config helper ─────────────────────────────────────────────────

  async getConfig(): Promise<DistributionConfig> {
    const policy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const cd = (policy as any)?.customerDistribution;
    if (!cd) {
      return {
        enabled: false,
        strategy: 'ROUND_ROBIN',
        capFillTarget: 20,
        kpiMetric: 'revenue',
        kpiPeriod: 'month',
        eligibleStaffFilter: 'all_active',
        eligibleDepartmentIds: [],
        eligiblePositionIds: [],
        duplicateCheckFields: ['phone'],
        reclaimIdleEnabled: false,
        reclaimIdleAfterHours: 24,
        reclaimFailedEnabled: false,
        reclaimFailedAfterDays: 7,
        rotationMaxRounds: 3,
        failedStatuses: [],
        schedulerIntervalMinutes: 15
      };
    }
    return {
      enabled: Boolean(cd.enabled),
      strategy: String(cd.strategy ?? 'ROUND_ROBIN'),
      capFillTarget: Number(cd.capFillTarget ?? 20),
      kpiMetric: String(cd.kpiMetric ?? 'revenue'),
      kpiPeriod: String(cd.kpiPeriod ?? 'month'),
      eligibleStaffFilter: String(cd.eligibleStaffFilter ?? 'all_active'),
      eligibleDepartmentIds: Array.isArray(cd.eligibleDepartmentIds) ? cd.eligibleDepartmentIds : [],
      eligiblePositionIds: Array.isArray(cd.eligiblePositionIds) ? cd.eligiblePositionIds : [],
      duplicateCheckFields: Array.isArray(cd.duplicateCheckFields) ? cd.duplicateCheckFields : ['phone'],
      reclaimIdleEnabled: Boolean(cd.reclaimIdleEnabled),
      reclaimIdleAfterHours: Number(cd.reclaimIdleAfterHours ?? 24),
      reclaimFailedEnabled: Boolean(cd.reclaimFailedEnabled),
      reclaimFailedAfterDays: Number(cd.reclaimFailedAfterDays ?? 7),
      rotationMaxRounds: Number(cd.rotationMaxRounds ?? 3),
      failedStatuses: Array.isArray(cd.failedStatuses) ? cd.failedStatuses : [],
      schedulerIntervalMinutes: Number(cd.schedulerIntervalMinutes ?? 15)
    };
  }
}
