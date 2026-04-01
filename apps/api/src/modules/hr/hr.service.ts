import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmploymentType,
  GenericStatus,
  HrGoalTrackingMode,
  PayrollComponentType,
  PayrollFormulaType,
  UserRole,
  Prisma,
  RecruitmentApplicationStatus,
  RecruitmentInterviewStatus,
  RecruitmentOfferStatus,
  RecruitmentSource,
  RecruitmentStage
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AuthUser } from '../../common/auth/auth-user.type';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';

const DEFAULT_MONTHLY_BASE_SALARY = 10_000_000;
const STANDARD_WORKING_DAYS_PER_MONTH = 22;
const DEFAULT_PIT_PERSONAL_DEDUCTION = 11_000_000;
const DEFAULT_PIT_DEPENDENT_DEDUCTION = 4_400_000;
const DEFAULT_PIT_TAX_RATE = 0.1;
const DEFAULT_OFFER_CURRENCY = 'VND';
const RECRUITMENT_STAGE_FLOW: RecruitmentStage[] = [
  RecruitmentStage.APPLIED,
  RecruitmentStage.SCREENING,
  RecruitmentStage.INTERVIEW,
  RecruitmentStage.ASSESSMENT,
  RecruitmentStage.OFFER,
  RecruitmentStage.HIRED
];

type HrPayload = Record<string, unknown>;

type PayrollLineDraft = {
  componentCode: string | null;
  componentName: string;
  componentType: PayrollComponentType;
  amount: number;
  isTaxable: boolean;
  note?: string;
};

type PersonalIncomeTaxDraft = {
  employeeId: string;
  payrollId: string | null;
  taxProfileId: string | null;
  taxMonth: number;
  taxYear: number;
  grossTaxable: number;
  deduction: number;
  taxableIncome: number;
  taxRate: number;
  taxAmount: number;
  note?: string;
};

type RecruitmentPipelineFilters = {
  stage?: string;
  status?: string;
  requisitionId?: string;
  recruiterId?: string;
  source?: string;
};

type GoalScope = 'self' | 'team' | 'department' | 'company';

type GoalTrackerFilters = {
  scope?: string;
  employeeId?: string;
  period?: string;
  status?: GenericStatus;
  trackingMode?: string;
  departmentId?: string;
  orgUnitId?: string;
};

type GoalAccessContext = {
  scope: GoalScope;
  role: UserRole | 'ANONYMOUS';
  authEnabled: boolean;
  requesterEmployeeId: string | null;
  allowedEmployeeIds: string[] | null;
  requesterDepartmentId: string | null;
  requesterDepartment: string | null;
  requestedEmployeeId: string | null;
  requestedDepartmentId: string | null;
  requestedOrgUnitId: string | null;
};

const GOAL_AUTO_STALE_MS = 10_000;

@Injectable()
export class HrService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Optional() @Inject(WorkflowsService) private readonly workflowsService?: WorkflowsService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService
  ) {}

  async listEmployees(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.EmployeeWhereInput = keyword
      ? {
          OR: [
            { fullName: { contains: keyword, mode: 'insensitive' } },
            { email: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword } },
            { department: { contains: keyword, mode: 'insensitive' } },
            { position: { contains: keyword, mode: 'insensitive' } },
            { code: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    return this.prisma.client.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit, 250)
    });
  }

  async createEmployee(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    const fullName = payload.fullName ?? payload.name;
    if (!fullName) {
      throw new BadRequestException('Thiếu tên nhân viên.');
    }

    const defaultShiftId = await this.resolveDefaultShiftId(hrPolicy.shiftDefault);

    return this.prisma.client.employee.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        fullName: String(fullName),
        email: this.toNullableString(payload.email),
        phone: this.toNullableString(payload.phone),
        dateOfBirth: this.toDate(payload.dateOfBirth),
        gender: this.toNullableString(payload.gender),
        nationalId: this.toNullableString(payload.nationalId),
        address: this.toNullableString(payload.address),
        bankAccountNo: this.toNullableString(payload.bankAccountNo),
        bankName: this.toNullableString(payload.bankName),
        taxCode: this.toNullableString(payload.taxCode),
        department: this.toNullableString(payload.department),
        departmentId: this.toNullableString(payload.departmentId),
        position: this.toNullableString(payload.position ?? payload.role),
        positionId: this.toNullableString(payload.positionId),
        managerId: this.toNullableString(payload.managerId),
        workShiftId: this.toNullableString(payload.workShiftId) ?? defaultShiftId ?? null,
        joinDate: this.toDate(payload.joinDate),
        employmentType: this.normalizeEmploymentType(payload.employmentType),
        baseSalary: this.toDecimal(payload.baseSalary),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updateEmployee(id: string, payload: HrPayload) {
    await this.ensureEmployeeExists(id);

    await this.prisma.client.employee.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        fullName: this.toUpdateString(payload.fullName ?? payload.name),
        email: this.toNullableString(payload.email),
        phone: this.toNullableString(payload.phone),
        dateOfBirth: this.toDate(payload.dateOfBirth),
        gender: this.toNullableString(payload.gender),
        nationalId: this.toNullableString(payload.nationalId),
        address: this.toNullableString(payload.address),
        bankAccountNo: this.toNullableString(payload.bankAccountNo),
        bankName: this.toNullableString(payload.bankName),
        taxCode: this.toNullableString(payload.taxCode),
        department: this.toNullableString(payload.department),
        departmentId: this.toNullableString(payload.departmentId),
        position: this.toNullableString(payload.position ?? payload.role),
        positionId: this.toNullableString(payload.positionId),
        managerId: this.toNullableString(payload.managerId),
        workShiftId: this.toNullableString(payload.workShiftId),
        joinDate: this.toDate(payload.joinDate),
        employmentType: payload.employmentType ? this.normalizeEmploymentType(payload.employmentType) : undefined,
        baseSalary: this.toDecimal(payload.baseSalary),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.employee.findFirst({ where: { id } });
  }

  async archiveEmployee(id: string) {
    const employee = await this.ensureEmployeeExists(id);
    if (employee.status !== GenericStatus.ARCHIVED) {
      await this.prisma.client.employee.updateMany({
        where: { id },
        data: {
          status: GenericStatus.ARCHIVED
        }
      });
    }
    return this.prisma.client.employee.findFirst({ where: { id } });
  }

  async listDepartments(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.DepartmentWhereInput = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    return this.prisma.client.department.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createDepartment(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const name = this.toNullableString(payload.name);
    if (!name) {
      throw new BadRequestException('Thiếu tên phòng ban.');
    }

    return this.prisma.client.department.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        name,
        managerEmployeeId: this.toNullableString(payload.managerEmployeeId),
        description: this.toNullableString(payload.description),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updateDepartment(id: string, payload: HrPayload) {
    await this.ensureDepartmentExists(id);

    await this.prisma.client.department.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        name: this.toUpdateString(payload.name),
        managerEmployeeId: this.toNullableString(payload.managerEmployeeId),
        description: this.toNullableString(payload.description),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.department.findFirst({ where: { id } });
  }

  async listPositions(query: PaginationQueryDto, departmentId?: string) {
    const keyword = query.q?.trim();
    const where: Prisma.PositionWhereInput = {
      ...(departmentId ? { departmentId } : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: 'insensitive' } },
              { title: { contains: keyword, mode: 'insensitive' } },
              { level: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    return this.prisma.client.position.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createPosition(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const title = this.toNullableString(payload.title);
    if (!title) {
      throw new BadRequestException('Thiếu tên chức danh.');
    }

    return this.prisma.client.position.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        title,
        departmentId: this.toNullableString(payload.departmentId),
        level: this.toNullableString(payload.level),
        description: this.toNullableString(payload.description),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updatePosition(id: string, payload: HrPayload) {
    await this.ensurePositionExists(id);

    await this.prisma.client.position.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        title: this.toUpdateString(payload.title),
        departmentId: this.toNullableString(payload.departmentId),
        level: this.toNullableString(payload.level),
        description: this.toNullableString(payload.description),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.position.findFirst({ where: { id } });
  }

  async listWorkShifts(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.WorkShiftWhereInput = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    return this.prisma.client.workShift.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createWorkShift(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const name = this.toNullableString(payload.name);
    const startTime = this.normalizeTime(payload.startTime);
    const endTime = this.normalizeTime(payload.endTime);
    if (!name || !startTime || !endTime) {
      throw new BadRequestException('Thiếu tên ca hoặc giờ bắt đầu/kết thúc.');
    }

    return this.prisma.client.workShift.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        name,
        startTime,
        endTime,
        breakMinutes: this.toInt(payload.breakMinutes, 60),
        overtimeThresholdMinutes: this.toInt(payload.overtimeThresholdMinutes, 30),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updateWorkShift(id: string, payload: HrPayload) {
    await this.ensureWorkShiftExists(id);

    await this.prisma.client.workShift.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        name: this.toUpdateString(payload.name),
        startTime: this.normalizeTime(payload.startTime),
        endTime: this.normalizeTime(payload.endTime),
        breakMinutes: this.toInt(payload.breakMinutes),
        overtimeThresholdMinutes: this.toInt(payload.overtimeThresholdMinutes),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.workShift.findFirst({ where: { id } });
  }

  async listLeavePolicies(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.LeavePolicyWhereInput = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
            { leaveType: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    return this.prisma.client.leavePolicy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createLeavePolicy(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const name = this.toNullableString(payload.name);
    const leaveType = this.toNullableString(payload.leaveType);
    if (!name || !leaveType) {
      throw new BadRequestException('Thiếu tên policy hoặc loại nghỉ.');
    }

    return this.prisma.client.leavePolicy.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        name,
        leaveType,
        isPaid: this.toBoolean(payload.isPaid, true),
        annualQuotaDays: this.toDecimal(payload.annualQuotaDays),
        carryOverLimitDays: this.toDecimal(payload.carryOverLimitDays),
        maxConsecutiveDays: this.toInt(payload.maxConsecutiveDays),
        requiresAttachment: this.toBoolean(payload.requiresAttachment, false),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updateLeavePolicy(id: string, payload: HrPayload) {
    await this.ensureLeavePolicyExists(id);

    await this.prisma.client.leavePolicy.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        name: this.toUpdateString(payload.name),
        leaveType: this.toUpdateString(payload.leaveType),
        isPaid: this.toBoolean(payload.isPaid),
        annualQuotaDays: this.toDecimal(payload.annualQuotaDays),
        carryOverLimitDays: this.toDecimal(payload.carryOverLimitDays),
        maxConsecutiveDays: this.toInt(payload.maxConsecutiveDays),
        requiresAttachment: this.toBoolean(payload.requiresAttachment),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.leavePolicy.findFirst({ where: { id } });
  }

  async listEmployeeContracts(query: PaginationQueryDto, employeeId?: string) {
    const where: Prisma.EmployeeContractWhereInput = employeeId ? { employeeId } : {};
    return this.prisma.client.employeeContract.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      take: this.take(query.limit)
    });
  }

  async createEmployeeContract(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    const contractType = this.toNullableString(payload.contractType);
    const startDate = this.toDate(payload.startDate);
    if (!employeeId || !contractType || !startDate) {
      throw new BadRequestException('Thiếu employeeId, contractType hoặc startDate.');
    }

    await this.ensureEmployeeExists(employeeId);

    return this.prisma.client.employeeContract.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        contractNo: this.toNullableString(payload.contractNo),
        contractType,
        startDate,
        endDate: this.toDate(payload.endDate),
        baseSalary: this.toDecimal(payload.baseSalary),
        allowance: this.toDecimal(payload.allowance),
        insuranceSalary: this.toDecimal(payload.insuranceSalary),
        status: this.normalizeStatus(payload.status),
        note: this.toNullableString(payload.note)
      }
    });
  }

  async updateEmployeeContract(id: string, payload: HrPayload) {
    await this.ensureEmployeeContractExists(id);

    await this.prisma.client.employeeContract.updateMany({
      where: { id },
      data: {
        contractNo: this.toNullableString(payload.contractNo),
        contractType: this.toUpdateString(payload.contractType),
        startDate: this.toDate(payload.startDate),
        endDate: this.toDate(payload.endDate),
        baseSalary: this.toDecimal(payload.baseSalary),
        allowance: this.toDecimal(payload.allowance),
        insuranceSalary: this.toDecimal(payload.insuranceSalary),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined,
        note: this.toNullableString(payload.note)
      }
    });

    return this.prisma.client.employeeContract.findFirst({ where: { id } });
  }

  async listPayrollComponents(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.PayrollComponentWhereInput = keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    return this.prisma.client.payrollComponent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createPayrollComponent(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const name = this.toNullableString(payload.name);
    if (!name) {
      throw new BadRequestException('Thiếu tên thành phần lương.');
    }

    return this.prisma.client.payrollComponent.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(payload.code),
        name,
        componentType: this.normalizePayrollComponentType(payload.componentType),
        formulaType: this.normalizePayrollFormulaType(payload.formulaType),
        defaultValue: this.toDecimal(payload.defaultValue),
        isTaxable: this.toBoolean(payload.isTaxable, false),
        status: this.normalizeStatus(payload.status),
        note: this.toNullableString(payload.note)
      }
    });
  }

  async updatePayrollComponent(id: string, payload: HrPayload) {
    await this.ensurePayrollComponentExists(id);

    await this.prisma.client.payrollComponent.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        name: this.toUpdateString(payload.name),
        componentType: payload.componentType
          ? this.normalizePayrollComponentType(payload.componentType)
          : undefined,
        formulaType: payload.formulaType ? this.normalizePayrollFormulaType(payload.formulaType) : undefined,
        defaultValue: this.toDecimal(payload.defaultValue),
        isTaxable: this.toBoolean(payload.isTaxable),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined,
        note: this.toNullableString(payload.note)
      }
    });

    return this.prisma.client.payrollComponent.findFirst({ where: { id } });
  }

  async archivePayrollComponent(id: string) {
    const component = await this.ensurePayrollComponentExists(id);
    if (component.status !== GenericStatus.ARCHIVED) {
      await this.prisma.client.payrollComponent.updateMany({
        where: { id },
        data: {
          status: GenericStatus.ARCHIVED
        }
      });
    }
    return this.prisma.client.payrollComponent.findFirst({ where: { id } });
  }

  async listAttendance(query: PaginationQueryDto, employeeId?: string, status?: string, date?: string) {
    const where: Prisma.AttendanceWhereInput = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }
    if (status) {
      where.status = status;
    }
    if (date) {
      const d = new Date(date);
      const start = this.startOfDay(d);
      const end = this.endOfDay(d);
      where.workDate = { gte: start, lte: end };
    }

    return this.prisma.client.attendance.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 300)
    });
  }

  async checkIn(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    const employee = await this.ensureEmployeeExists(employeeId);

    const workDateValue = this.toDate(payload.workDate) ?? new Date();
    const workDate = this.startOfDay(workDateValue);
    const workDateEnd = this.endOfDay(workDateValue);

    const existing = await this.prisma.client.attendance.findFirst({
      where: {
        employeeId,
        workDate: { gte: workDate, lte: workDateEnd }
      }
    });

    if (existing) {
      throw new BadRequestException('Nhân viên đã chấm công trong ngày này.');
    }

    const now = new Date();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    const defaultShiftId = await this.resolveDefaultShiftId(hrPolicy.shiftDefault);
    const workShiftId = this.toNullableString(payload.workShiftId) ?? employee.workShiftId ?? defaultShiftId ?? null;
    const shift = workShiftId ? await this.prisma.client.workShift.findFirst({ where: { id: workShiftId } }) : null;

    const scheduledStartAt = shift ? this.timeOnDate(workDate, shift.startTime) : this.timeOnDate(workDate, '08:30');
    const scheduledEndAt = shift ? this.timeOnDate(workDate, shift.endTime) : this.timeOnDate(workDate, '17:30');
    const normalizedScheduledEndAt =
      scheduledStartAt && scheduledEndAt && scheduledEndAt <= scheduledStartAt
        ? new Date(scheduledEndAt.getTime() + 24 * 60 * 60 * 1000)
        : scheduledEndAt;

    const lateMinutes =
      scheduledStartAt && now > scheduledStartAt
        ? Math.max(0, Math.floor((now.getTime() - scheduledStartAt.getTime()) / 60000))
        : 0;

    return this.prisma.client.attendance.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        workDate,
        workShiftId,
        checkInAt: now,
        scheduledStartAt,
        scheduledEndAt: normalizedScheduledEndAt,
        lateMinutes,
        status: lateMinutes > 0 ? 'late' : 'present',
        note: this.toNullableString(payload.note)
      }
    });
  }

  async checkOut(payload: HrPayload) {
    const employeeId = this.toNullableString(payload.employeeId);
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId.');
    }

    const workDateValue = this.toDate(payload.workDate) ?? new Date();
    const start = this.startOfDay(workDateValue);
    const end = this.endOfDay(workDateValue);
    const now = new Date();

    const attendance = await this.prisma.client.attendance.findFirst({
      where: {
        employeeId,
        workDate: { gte: start, lte: end }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!attendance) {
      throw new NotFoundException('Không tìm thấy bản ghi chấm công trong ngày.');
    }

    const workedMinutes = attendance.checkInAt
      ? Math.max(0, Math.floor((now.getTime() - attendance.checkInAt.getTime()) / 60000))
      : 0;

    const overtimeMinutes = attendance.scheduledEndAt
      ? Math.max(0, Math.floor((now.getTime() - attendance.scheduledEndAt.getTime()) / 60000))
      : 0;

    let resolvedStatus = attendance.status ?? 'present';
    if (workedMinutes > 0 && workedMinutes < 240) {
      resolvedStatus = 'half_day';
    }

    await this.prisma.client.attendance.updateMany({
      where: { id: attendance.id },
      data: {
        checkOutAt: now,
        overtimeMinutes,
        status: resolvedStatus,
        note: this.toNullableString(payload.note) ?? attendance.note
      }
    });

    return this.prisma.client.attendance.findFirst({ where: { id: attendance.id } });
  }

  async listLeaveRequests(query: PaginationQueryDto, employeeId?: string, status?: GenericStatus) {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    return this.prisma.client.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createLeaveRequest(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    const employeeId = this.toNullableString(payload.employeeId);
    const startDate = this.toDate(payload.startDate);
    const endDate = this.toDate(payload.endDate);
    const leavePolicyId = this.toNullableString(payload.leavePolicyId);

    if (!employeeId || !startDate || !endDate) {
      throw new BadRequestException('Thiếu dữ liệu đơn nghỉ phép.');
    }

    if (startDate > endDate) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
    }

    await this.ensureEmployeeExists(employeeId);

    const policy = leavePolicyId
      ? await this.prisma.client.leavePolicy.findFirst({ where: { id: leavePolicyId } })
      : null;

    const leaveType = this.toNullableString(payload.leaveType ?? policy?.leaveType ?? 'ANNUAL');
    if (!leaveType) {
      throw new BadRequestException('Thiếu leaveType hoặc leavePolicyId hợp lệ.');
    }

    const durationDays = this.calcLeaveDays(startDate, endDate);

    if (policy?.maxConsecutiveDays && durationDays > policy.maxConsecutiveDays) {
      throw new BadRequestException(
        `Số ngày nghỉ (${durationDays}) vượt quá giới hạn policy (${policy.maxConsecutiveDays}).`
      );
    }

    if (policy?.annualQuotaDays) {
      const year = startDate.getFullYear();
      const balance = await this.getLeaveBalanceSummary(employeeId, leaveType, year, policy.id);
      if (durationDays > balance.remainingDays) {
        throw new BadRequestException(
          `Không đủ số ngày nghỉ còn lại. Còn ${balance.remainingDays.toFixed(2)} ngày.`
        );
      }
    } else {
      const year = startDate.getFullYear();
      const balance = await this.getLeaveBalanceSummary(employeeId, leaveType, year);
      const fallbackQuota = Number(hrPolicy.leave.annualDefaultDays ?? 12) + Number(hrPolicy.leave.maxCarryOverDays ?? 0);
      const remaining = Math.max(0, fallbackQuota - balance.usedDays);
      if (durationDays > remaining) {
        throw new BadRequestException(
          `Không đủ số ngày nghỉ còn lại theo HR policy mặc định. Còn ${remaining.toFixed(2)} ngày.`
        );
      }
    }

    return this.prisma.client.leaveRequest.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        leavePolicyId,
        leaveType,
        startDate,
        endDate,
        durationDays: new Prisma.Decimal(durationDays.toFixed(2)),
        reason: this.toNullableString(payload.reason),
        attachmentUrl: this.toNullableString(payload.attachmentUrl),
        status: GenericStatus.PENDING
      }
    });
  }

  async approveLeaveRequest(id: string, approverId?: string) {
    const tenantId = this.prisma.getTenantId();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    await this.assertApproverRole(approverId, hrPolicy.approverChain.leaveApproverRole, 'duyệt đơn nghỉ phép');
    const req = await this.prisma.client.leaveRequest.findFirst({ where: { id } });
    if (!req) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép.');
    }

    await this.prisma.client.leaveRequest.updateMany({
      where: { id },
      data: {
        status: GenericStatus.APPROVED,
        approvedBy: approverId ?? 'system'
      }
    });

    await this.prisma.client.notification.create({
      data: {
        tenant_Id: tenantId,
        userId: req.employeeId,
        title: 'Đơn nghỉ phép đã được duyệt',
        content: 'Yêu cầu nghỉ phép của bạn đã được phê duyệt.'
      }
    });

    await this.prisma.client.hrEvent.create({
      data: {
        tenant_Id: tenantId,
        employeeId: req.employeeId,
        eventType: 'LEAVE_APPROVED',
        effectiveAt: new Date(),
        payload: {
          leaveRequestId: req.id,
          leaveType: req.leaveType,
          startDate: req.startDate.toISOString(),
          endDate: req.endDate.toISOString()
        },
        createdBy: approverId ?? 'system'
      }
    });

    return this.prisma.client.leaveRequest.findFirst({ where: { id } });
  }

  async rejectLeaveRequest(id: string, approverId?: string) {
    const tenantId = this.prisma.getTenantId();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    await this.assertApproverRole(approverId, hrPolicy.approverChain.leaveApproverRole, 'từ chối đơn nghỉ phép');
    const req = await this.prisma.client.leaveRequest.findFirst({ where: { id } });
    if (!req) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép.');
    }

    await this.prisma.client.leaveRequest.updateMany({
      where: { id },
      data: {
        status: GenericStatus.REJECTED,
        approvedBy: approverId ?? 'system'
      }
    });

    await this.prisma.client.notification.create({
      data: {
        tenant_Id: tenantId,
        userId: req.employeeId,
        title: 'Đơn nghỉ phép bị từ chối',
        content: 'Yêu cầu nghỉ phép của bạn không được phê duyệt.'
      }
    });

    return this.prisma.client.leaveRequest.findFirst({ where: { id } });
  }

  async getLeaveBalance(employeeId: string, year?: number) {
    await this.ensureEmployeeExists(employeeId);
    const targetYear = year && Number.isFinite(year) ? Number(year) : new Date().getFullYear();

    const policies = await this.prisma.client.leavePolicy.findMany({
      where: { status: GenericStatus.ACTIVE },
      orderBy: { leaveType: 'asc' }
    });

    const result = await Promise.all(
      policies.map(async (policy) => {
        const summary = await this.getLeaveBalanceSummary(employeeId, policy.leaveType, targetYear, policy.id);
        return {
          leavePolicyId: policy.id,
          code: policy.code,
          name: policy.name,
          leaveType: policy.leaveType,
          isPaid: policy.isPaid,
          annualQuotaDays: summary.quotaDays,
          usedDays: summary.usedDays,
          remainingDays: summary.remainingDays,
          carryOverLimitDays: this.toNumber(policy.carryOverLimitDays)
        };
      })
    );

    return {
      employeeId,
      year: targetYear,
      balances: result
    };
  }

  async generatePayroll(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    const { month, year } = this.resolvePayrollPeriod(payload.month, payload.year, hrPolicy.payroll.cutoffDay);
    const employeeId = this.toNullableString(payload.employeeId);

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const employees = employeeId
      ? await this.prisma.client.employee.findMany({ where: { id: employeeId } })
      : await this.prisma.client.employee.findMany({
          where: { status: { not: GenericStatus.INACTIVE } }
        });

    if (!employees.length) {
      throw new BadRequestException('Không tìm thấy nhân viên để tạo bảng lương.');
    }

    const employeeIds = employees.map((employee) => employee.id);

    const [attendanceRows, approvedLeaves, policies, contracts, components] = await Promise.all([
      this.prisma.client.attendance.findMany({
        where: {
          employeeId: { in: employeeIds },
          workDate: { gte: periodStart, lte: periodEnd }
        }
      }),
      this.prisma.client.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: GenericStatus.APPROVED,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart }
        }
      }),
      this.prisma.client.leavePolicy.findMany({ where: { status: GenericStatus.ACTIVE } }),
      this.prisma.client.employeeContract.findMany({
        where: {
          employeeId: { in: employeeIds },
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
          status: { in: [GenericStatus.ACTIVE, GenericStatus.APPROVED] }
        },
        orderBy: { startDate: 'desc' }
      }),
      this.prisma.client.payrollComponent.findMany({ where: { status: GenericStatus.ACTIVE } })
    ]);

    const existingPayrolls = await this.prisma.client.payroll.findMany({
      where: {
        payMonth: month,
        payYear: year,
        employeeId: { in: employeeIds }
      },
      select: { id: true }
    });
    const existingPayrollIds = existingPayrolls.map((row) => row.id);
    if (existingPayrollIds.length > 0) {
      await this.prisma.client.payrollLineItem.deleteMany({ where: { payrollId: { in: existingPayrollIds } } });
      await this.prisma.client.payroll.deleteMany({
        where: {
          id: { in: existingPayrollIds }
        }
      });
    }

    const policyById = new Map(policies.map((policy) => [policy.id, policy]));

    let createdCount = 0;

    for (const employee of employees) {
      const employeeAttendance = attendanceRows.filter((row) => row.employeeId === employee.id);
      const employeeLeaves = approvedLeaves.filter((row) => row.employeeId === employee.id);

      const activeContract = contracts.find((contract) => contract.employeeId === employee.id);
      const baseSalary =
        this.toNumber(activeContract?.baseSalary) ?? this.toNumber(employee.baseSalary) ?? DEFAULT_MONTHLY_BASE_SALARY;
      const dailyRate = baseSalary / STANDARD_WORKING_DAYS_PER_MONTH;

      const workingDays = employeeAttendance.reduce((acc, row) => {
        if (row.status === 'half_day') return acc + 0.5;
        if (row.status === 'present' || row.status === 'late') return acc + 1;
        return acc;
      }, 0);

      const lateDays = employeeAttendance.filter((row) => row.status === 'late').length;
      const overtimeMinutes = employeeAttendance.reduce((acc, row) => acc + Number(row.overtimeMinutes ?? 0), 0);
      const overtimeHours = overtimeMinutes / 60;

      let paidLeaveDays = 0;
      let unpaidLeaveDays = 0;

      for (const leave of employeeLeaves) {
        const overlapDays = this.calcLeaveOverlapDays(periodStart, periodEnd, leave.startDate, leave.endDate);
        if (overlapDays <= 0) continue;

        const linkedPolicy = leave.leavePolicyId ? policyById.get(leave.leavePolicyId) : null;
        const typeLower = (leave.leaveType ?? '').toLowerCase();
        const isPaidByTypeHeuristic = !typeLower.includes('unpaid') && !typeLower.includes('khong_luong');
        const isPaid = linkedPolicy?.isPaid ?? isPaidByTypeHeuristic;
        if (isPaid) {
          paidLeaveDays += overlapDays;
        } else {
          unpaidLeaveDays += overlapDays;
        }
      }

      const payrollLines: PayrollLineDraft[] = [];
      payrollLines.push({
        componentCode: 'BASE_SALARY',
        componentName: 'Luong co ban',
        componentType: PayrollComponentType.EARNING,
        amount: baseSalary,
        isTaxable: true
      });

      if (overtimeHours > 0) {
        const overtimePay = overtimeHours * (dailyRate / 8) * 1.5;
        payrollLines.push({
          componentCode: 'OVERTIME',
          componentName: 'Luong tang ca',
          componentType: PayrollComponentType.EARNING,
          amount: overtimePay,
          isTaxable: true
        });
      }

      if (lateDays > 0) {
        payrollLines.push({
          componentCode: 'LATE_FINE',
          componentName: 'Khau tru di muon',
          componentType: PayrollComponentType.DEDUCTION,
          amount: lateDays * 50_000,
          isTaxable: false
        });
      }

      if (unpaidLeaveDays > 0) {
        payrollLines.push({
          componentCode: 'UNPAID_LEAVE',
          componentName: 'Khau tru nghi khong luong',
          componentType: PayrollComponentType.DEDUCTION,
          amount: unpaidLeaveDays * dailyRate,
          isTaxable: false
        });
      }

      for (const component of components) {
        const defaultValue = this.toNumber(component.defaultValue) ?? 0;
        if (defaultValue <= 0) continue;

        const amount =
          component.formulaType === PayrollFormulaType.PERCENT_BASE
            ? (baseSalary * defaultValue) / 100
            : defaultValue;

        payrollLines.push({
          componentCode: component.code,
          componentName: component.name,
          componentType: component.componentType,
          amount,
          isTaxable: component.isTaxable,
          note: component.note ?? undefined
        });
      }

      const grossSalary = payrollLines
        .filter((line) => line.componentType === PayrollComponentType.EARNING)
        .reduce((acc, line) => acc + line.amount, 0);

      const deduction = payrollLines
        .filter((line) => line.componentType === PayrollComponentType.DEDUCTION)
        .reduce((acc, line) => acc + line.amount, 0);

      const netSalary = Math.max(0, grossSalary - deduction);

      const payroll = await this.prisma.client.payroll.create({
        data: {
          tenant_Id: tenantId,
          employeeId: employee.id,
          payMonth: month,
          payYear: year,
          periodStart,
          periodEnd,
          workingDays,
          paidLeaveDays,
          unpaidLeaveDays,
          overtimeHours,
          grossSalary,
          deduction,
          netSalary,
          status: GenericStatus.DRAFT,
          note: this.toNullableString(payload.note)
        }
      });

      if (payrollLines.length > 0) {
        await this.prisma.client.payrollLineItem.createMany({
          data: payrollLines.map((line) => ({
            tenant_Id: tenantId,
            payrollId: payroll.id,
            employeeId: employee.id,
            componentCode: line.componentCode,
            componentName: line.componentName,
            componentType: line.componentType,
            amount: new Prisma.Decimal(line.amount.toFixed(2)),
            isTaxable: line.isTaxable,
            note: line.note ?? null
          }))
        });
      }

      createdCount += 1;
    }

    return {
      month,
      year,
      cycle: hrPolicy.payroll.cycle,
      count: createdCount
    };
  }

  async listPayrolls(query: PaginationQueryDto, month?: string, year?: string, employeeId?: string) {
    const where: Prisma.PayrollWhereInput = {};
    if (month) where.payMonth = Number(month);
    if (year) where.payYear = Number(year);
    if (employeeId) where.employeeId = employeeId;

    return this.prisma.client.payroll.findMany({
      where,
      orderBy: [{ payYear: 'desc' }, { payMonth: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 400)
    });
  }

  async listPayrollLineItems(payrollId: string) {
    return this.prisma.client.payrollLineItem.findMany({
      where: { payrollId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async payPayroll(id: string, approverId?: string) {
    const hrPolicy = await this.runtimeSettings.getHrPolicyRuntime();
    await this.assertApproverRole(approverId, hrPolicy.approverChain.payrollApproverRole, 'khóa/chi trả payroll');
    await this.prisma.client.payroll.updateMany({
      where: { id },
      data: {
        status: GenericStatus.APPROVED,
        paidAt: new Date(),
        lockedAt: new Date()
      }
    });
    return this.prisma.client.payroll.findFirst({ where: { id } });
  }

  async archivePayroll(id: string) {
    const payroll = await this.prisma.client.payroll.findFirst({ where: { id } });
    if (!payroll) {
      throw new NotFoundException('Không tìm thấy bảng lương.');
    }
    if (payroll.status !== GenericStatus.ARCHIVED) {
      await this.prisma.client.payroll.updateMany({
        where: { id },
        data: {
          status: GenericStatus.ARCHIVED,
          lockedAt: payroll.lockedAt ?? new Date()
        }
      });
    }
    return this.prisma.client.payroll.findFirst({ where: { id } });
  }

  private async resolveDefaultShiftId(shiftCode: string) {
    const normalized = this.toNullableString(shiftCode);
    if (!normalized) {
      return null;
    }

    const shift = await this.prisma.client.workShift.findFirst({
      where: {
        OR: [{ code: normalized }, { name: normalized }],
        status: GenericStatus.ACTIVE
      }
    });
    return shift?.id ?? null;
  }

  private resolvePayrollPeriod(monthInput: unknown, yearInput: unknown, cutoffDay: number) {
    const month = Number(monthInput);
    const year = Number(yearInput);
    if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12 && year >= 2000 && year <= 9999) {
      return { month: Math.trunc(month), year: Math.trunc(year) };
    }

    const now = new Date();
    const today = now.getDate();
    const resolved = new Date(now);
    if (today <= Number(cutoffDay || 25)) {
      resolved.setMonth(resolved.getMonth() - 1);
    }

    return {
      month: resolved.getMonth() + 1,
      year: resolved.getFullYear()
    };
  }

  private async assertApproverRole(approverId: string | undefined, expectedRole: string, actionLabel: string) {
    const expected = String(expectedRole || '').trim().toUpperCase();
    if (!expected || !(Object.values(UserRole) as string[]).includes(expected)) {
      return;
    }

    const candidate = String(approverId || '').trim();
    if (!candidate) {
      throw new BadRequestException(`Thiếu approverId cho thao tác ${actionLabel}.`);
    }

    if (candidate.toUpperCase().startsWith('ROLE:')) {
      const roleToken = candidate.toUpperCase().slice('ROLE:'.length);
      if (roleToken !== expected) {
        throw new BadRequestException(`Approver role '${roleToken}' không khớp policy '${expected}' cho thao tác ${actionLabel}.`);
      }
      return;
    }

    const user = await this.prisma.client.user.findFirst({ where: { id: candidate } });
    const actualRole = String(user?.role ?? '').toUpperCase();
    if (actualRole !== expected) {
      throw new BadRequestException(`Approver '${candidate}' không thuộc role '${expected}' theo HR policy.`);
    }
  }

  async getRecruitmentPipeline(query: PaginationQueryDto, filters: RecruitmentPipelineFilters = {}) {
    await this.syncPendingRecruitmentOfferApprovals();

    const where = this.buildRecruitmentApplicationWhere(query, filters, true);
    const rows = await this.prisma.client.recruitmentApplication.findMany({
      where,
      include: {
        candidate: true,
        requisition: true,
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 3
        },
        interviews: {
          orderBy: { scheduledAt: 'asc' },
          take: 5
        }
      },
      orderBy: [{ stageEnteredAt: 'asc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 400)
    });

    const now = new Date();
    const byStage = new Map<RecruitmentStage, Array<Record<string, unknown>>>();
    for (const stage of RECRUITMENT_STAGE_FLOW) {
      byStage.set(stage, []);
    }

    const requisitionMap = new Map<string, { id: string; title: string | null; recruiterId: string | null }>();
    const recruiterSet = new Set<string>();
    const sourceSet = new Set<RecruitmentSource>();
    const statusTotals: Record<RecruitmentApplicationStatus, number> = {
      [RecruitmentApplicationStatus.ACTIVE]: 0,
      [RecruitmentApplicationStatus.REJECTED]: 0,
      [RecruitmentApplicationStatus.WITHDRAWN]: 0,
      [RecruitmentApplicationStatus.HIRED]: 0
    };

    for (const row of rows) {
      statusTotals[row.status] += 1;
      sourceSet.add(row.candidate.source);
      if (row.recruiterId) {
        recruiterSet.add(row.recruiterId);
      }
      if (row.requisition.recruiterId) {
        recruiterSet.add(row.requisition.recruiterId);
      }
      requisitionMap.set(row.requisition.id, {
        id: row.requisition.id,
        title: row.requisition.title ?? null,
        recruiterId: row.requisition.recruiterId ?? null
      });

      const latestOffer = row.offers[0] ?? null;
      const upcomingInterview = row.interviews.find(
        (interview) => interview.status === RecruitmentInterviewStatus.SCHEDULED && interview.scheduledAt >= now
      );
      const card = {
        id: row.id,
        stage: row.currentStage,
        status: row.status,
        recruiterId: row.recruiterId ?? row.requisition.recruiterId ?? null,
        appliedAt: row.appliedAt,
        stageEnteredAt: row.stageEnteredAt,
        timeInStageDays: this.calcDurationDays(row.stageEnteredAt, now),
        lastActivityAt: row.lastActivityAt,
        candidate: {
          id: row.candidate.id,
          fullName: row.candidate.fullName,
          email: row.candidate.email,
          phone: row.candidate.phone,
          source: row.candidate.source,
          cvExternalUrl: row.candidate.cvExternalUrl
        },
        requisition: {
          id: row.requisition.id,
          title: row.requisition.title,
          department: row.requisition.department,
          recruiterId: row.requisition.recruiterId
        },
        latestOffer: latestOffer
          ? {
              id: latestOffer.id,
              status: latestOffer.status,
              offeredSalary: this.toNumber(latestOffer.offeredSalary),
              currency: latestOffer.currency,
              proposedStartDate: latestOffer.proposedStartDate,
              approvedAt: latestOffer.approvedAt,
              acceptedAt: latestOffer.acceptedAt
            }
          : null,
        upcomingInterviewAt: upcomingInterview?.scheduledAt ?? null,
        convertedEmployeeId: row.convertedEmployeeId ?? null,
        canConvert: Boolean(
          !row.convertedEmployeeId
            && row.offers.some((offer) => offer.status === RecruitmentOfferStatus.ACCEPTED && Boolean(offer.approvedAt))
        )
      };

      const bucket = byStage.get(row.currentStage);
      if (bucket) {
        bucket.push(card);
      }
    }

    const stages = RECRUITMENT_STAGE_FLOW.map((stage) => ({
      stage,
      count: byStage.get(stage)?.length ?? 0,
      items: byStage.get(stage) ?? []
    }));

    return {
      filters: {
        q: query.q?.trim() ?? '',
        stage: filters.stage ?? null,
        status: filters.status ?? RecruitmentApplicationStatus.ACTIVE,
        requisitionId: filters.requisitionId ?? null,
        recruiterId: filters.recruiterId ?? null,
        source: filters.source ?? null
      },
      stages,
      totals: {
        all: rows.length,
        active: statusTotals[RecruitmentApplicationStatus.ACTIVE],
        rejected: statusTotals[RecruitmentApplicationStatus.REJECTED],
        withdrawn: statusTotals[RecruitmentApplicationStatus.WITHDRAWN],
        hired: statusTotals[RecruitmentApplicationStatus.HIRED]
      },
      filterOptions: {
        requisitions: Array.from(requisitionMap.values()).sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''))),
        recruiters: Array.from(recruiterSet.values()).sort((a, b) => a.localeCompare(b)),
        sources: Array.from(sourceSet.values()).sort()
      }
    };
  }

  async getRecruitmentMetrics(filters: RecruitmentPipelineFilters = {}) {
    await this.syncPendingRecruitmentOfferApprovals();
    const where = this.buildRecruitmentApplicationWhere({} as PaginationQueryDto, filters, false);
    const rows = await this.prisma.client.recruitmentApplication.findMany({
      where,
      select: {
        id: true,
        currentStage: true,
        status: true,
        appliedAt: true,
        stageEnteredAt: true
      }
    });

    const total = rows.length;
    const stageCounts: Record<RecruitmentStage, number> = {
      [RecruitmentStage.APPLIED]: 0,
      [RecruitmentStage.SCREENING]: 0,
      [RecruitmentStage.INTERVIEW]: 0,
      [RecruitmentStage.ASSESSMENT]: 0,
      [RecruitmentStage.OFFER]: 0,
      [RecruitmentStage.HIRED]: 0
    };
    const statusCounts: Record<RecruitmentApplicationStatus, number> = {
      [RecruitmentApplicationStatus.ACTIVE]: 0,
      [RecruitmentApplicationStatus.REJECTED]: 0,
      [RecruitmentApplicationStatus.WITHDRAWN]: 0,
      [RecruitmentApplicationStatus.HIRED]: 0
    };
    const now = new Date();
    const averageTimeInStageDays: Record<RecruitmentStage, number> = {
      [RecruitmentStage.APPLIED]: 0,
      [RecruitmentStage.SCREENING]: 0,
      [RecruitmentStage.INTERVIEW]: 0,
      [RecruitmentStage.ASSESSMENT]: 0,
      [RecruitmentStage.OFFER]: 0,
      [RecruitmentStage.HIRED]: 0
    };

    const stageTimeBuffer = new Map<RecruitmentStage, number[]>();
    for (const stage of RECRUITMENT_STAGE_FLOW) {
      stageTimeBuffer.set(stage, []);
    }

    for (const row of rows) {
      stageCounts[row.currentStage] += 1;
      statusCounts[row.status] += 1;
      if (row.status === RecruitmentApplicationStatus.ACTIVE) {
        stageTimeBuffer.get(row.currentStage)?.push(this.calcDurationDays(row.stageEnteredAt, now));
      }
    }

    for (const stage of RECRUITMENT_STAGE_FLOW) {
      const values = stageTimeBuffer.get(stage) ?? [];
      averageTimeInStageDays[stage] = values.length
        ? Number((values.reduce((sum, current) => sum + current, 0) / values.length).toFixed(2))
        : 0;
    }

    const rateBase = total > 0 ? total : 1;
    const reachedStageCount = (stage: RecruitmentStage) =>
      rows.filter((row) => this.getRecruitmentStageIndex(row.currentStage) >= this.getRecruitmentStageIndex(stage)).length;

    return {
      totals: {
        applications: total,
        active: statusCounts[RecruitmentApplicationStatus.ACTIVE],
        rejected: statusCounts[RecruitmentApplicationStatus.REJECTED],
        withdrawn: statusCounts[RecruitmentApplicationStatus.WITHDRAWN],
        hired: statusCounts[RecruitmentApplicationStatus.HIRED]
      },
      countsByStage: stageCounts,
      countsByStatus: statusCounts,
      conversionRates: {
        screeningRate: Number((reachedStageCount(RecruitmentStage.SCREENING) / rateBase).toFixed(4)),
        interviewRate: Number((reachedStageCount(RecruitmentStage.INTERVIEW) / rateBase).toFixed(4)),
        assessmentRate: Number((reachedStageCount(RecruitmentStage.ASSESSMENT) / rateBase).toFixed(4)),
        offerRate: Number((reachedStageCount(RecruitmentStage.OFFER) / rateBase).toFixed(4)),
        hiredRate: Number((statusCounts[RecruitmentApplicationStatus.HIRED] / rateBase).toFixed(4))
      },
      averageTimeInStageDays
    };
  }

  async getRecruitmentApplicationDetail(id: string) {
    await this.syncPendingRecruitmentOfferApprovals(id);
    const row = await this.prisma.client.recruitmentApplication.findFirst({
      where: { id },
      include: {
        candidate: true,
        requisition: true,
        stageHistories: {
          orderBy: { createdAt: 'desc' }
        },
        interviews: {
          orderBy: { scheduledAt: 'desc' }
        },
        offers: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ ứng tuyển.');
    }

    const canConvert = Boolean(
      !row.convertedEmployeeId
        && row.offers.some((offer) => offer.status === RecruitmentOfferStatus.ACCEPTED && Boolean(offer.approvedAt))
    );

    return {
      ...row,
      canMoveToHired: canConvert,
      canConvert
    };
  }

  async createRecruitmentApplication(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const requisition = await this.resolveRecruitmentRequisition(payload);
    const candidate = await this.resolveRecruitmentCandidate(payload);

    const duplicate = await this.prisma.client.recruitmentApplication.findFirst({
      where: {
        requisitionId: requisition.id,
        candidateId: candidate.id
      }
    });
    if (duplicate) {
      throw new BadRequestException('Ứng viên đã có hồ sơ ở vị trí tuyển dụng này.');
    }

    const stage = this.normalizeRecruitmentStage(payload.stage ?? payload.currentStage, RecruitmentStage.APPLIED);
    const status = this.normalizeRecruitmentApplicationStatus(payload.status, RecruitmentApplicationStatus.ACTIVE);
    const now = new Date();
    const normalizedStage = status === RecruitmentApplicationStatus.HIRED ? RecruitmentStage.HIRED : stage;

    const application = await this.prisma.client.recruitmentApplication.create({
      data: {
        tenant_Id: tenantId,
        requisitionId: requisition.id,
        candidateId: candidate.id,
        recruiterId: this.toNullableString(payload.recruiterId) ?? requisition.recruiterId ?? null,
        currentStage: normalizedStage,
        status,
        appliedAt: this.toDate(payload.appliedAt) ?? now,
        stageEnteredAt: now,
        lastActivityAt: now,
        hiredAt: status === RecruitmentApplicationStatus.HIRED ? now : null,
        note: this.toNullableString(payload.note)
      }
    });

    await this.prisma.client.recruitmentStageHistory.create({
      data: {
        tenant_Id: tenantId,
        applicationId: application.id,
        toStage: application.currentStage,
        toStatus: application.status,
        actionType: 'CREATED',
        reason: this.toNullableString(payload.reason),
        actorId: this.toNullableString(payload.actorId)
      }
    });

    return this.getRecruitmentApplicationDetail(application.id);
  }

  async updateRecruitmentApplicationStage(id: string, payload: HrPayload) {
    await this.syncPendingRecruitmentOfferApprovals(id);
    const application = await this.ensureRecruitmentApplicationExists(id);
    const targetStage = this.normalizeRecruitmentStage(payload.toStage ?? payload.stage);
    if (!targetStage) {
      throw new BadRequestException('Thiếu stage đích.');
    }

    await this.assertRecruitmentStageTransition(application, targetStage);
    const now = new Date();
    const nextStatus = targetStage === RecruitmentStage.HIRED
      ? RecruitmentApplicationStatus.HIRED
      : application.status;

    await this.prisma.client.recruitmentApplication.updateMany({
      where: { id },
      data: {
        currentStage: targetStage,
        status: nextStatus,
        stageEnteredAt: now,
        lastActivityAt: now,
        hiredAt: targetStage === RecruitmentStage.HIRED ? now : application.hiredAt
      }
    });

    await this.prisma.client.recruitmentStageHistory.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        applicationId: id,
        fromStage: application.currentStage,
        toStage: targetStage,
        fromStatus: application.status,
        toStatus: nextStatus,
        actionType: 'STAGE_CHANGED',
        reason: this.toNullableString(payload.reason),
        actorId: this.toNullableString(payload.actorId)
      }
    });

    return this.getRecruitmentApplicationDetail(id);
  }

  async updateRecruitmentApplicationStatus(id: string, payload: HrPayload) {
    await this.syncPendingRecruitmentOfferApprovals(id);
    const application = await this.ensureRecruitmentApplicationExists(id);
    const nextStatus = this.normalizeRecruitmentApplicationStatus(payload.status);
    if (!nextStatus) {
      throw new BadRequestException('Thiếu status hồ sơ ứng tuyển.');
    }

    if (nextStatus === application.status) {
      return this.getRecruitmentApplicationDetail(id);
    }

    const now = new Date();
    if (nextStatus === RecruitmentApplicationStatus.REJECTED || nextStatus === RecruitmentApplicationStatus.WITHDRAWN) {
      if (application.status !== RecruitmentApplicationStatus.ACTIVE) {
        throw new BadRequestException('Chỉ hồ sơ ACTIVE mới được reject/withdraw.');
      }

      await this.prisma.client.recruitmentApplication.updateMany({
        where: { id },
        data: {
          status: nextStatus,
          lastActivityAt: now,
          rejectedReason: nextStatus === RecruitmentApplicationStatus.REJECTED ? this.toNullableString(payload.reason) : null,
          withdrawnReason: nextStatus === RecruitmentApplicationStatus.WITHDRAWN ? this.toNullableString(payload.reason) : null
        }
      });

      await this.prisma.client.recruitmentStageHistory.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          applicationId: id,
          fromStatus: application.status,
          toStatus: nextStatus,
          actionType: 'STATUS_CHANGED',
          reason: this.toNullableString(payload.reason),
          actorId: this.toNullableString(payload.actorId)
        }
      });

      return this.getRecruitmentApplicationDetail(id);
    }

    if (nextStatus === RecruitmentApplicationStatus.ACTIVE) {
      if (
        application.status !== RecruitmentApplicationStatus.REJECTED &&
        application.status !== RecruitmentApplicationStatus.WITHDRAWN
      ) {
        throw new BadRequestException('Chỉ hồ sơ REJECTED/WITHDRAWN mới được reopen.');
      }
      const reopenStage = this.normalizeRecruitmentStage(payload.reopenStage ?? payload.stage, application.currentStage);
      if (reopenStage === RecruitmentStage.HIRED) {
        throw new BadRequestException('Không thể reopen về stage HIRED.');
      }

      await this.prisma.client.recruitmentApplication.updateMany({
        where: { id },
        data: {
          status: RecruitmentApplicationStatus.ACTIVE,
          currentStage: reopenStage,
          stageEnteredAt: now,
          lastActivityAt: now,
          rejectedReason: null,
          withdrawnReason: null
        }
      });

      await this.prisma.client.recruitmentStageHistory.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          applicationId: id,
          fromStatus: application.status,
          toStatus: RecruitmentApplicationStatus.ACTIVE,
          toStage: reopenStage,
          actionType: 'REOPENED',
          reason: this.toNullableString(payload.reason),
          actorId: this.toNullableString(payload.actorId)
        }
      });

      return this.getRecruitmentApplicationDetail(id);
    }

    if (nextStatus === RecruitmentApplicationStatus.HIRED) {
      if (application.status !== RecruitmentApplicationStatus.ACTIVE) {
        throw new BadRequestException('Chỉ hồ sơ ACTIVE mới được chuyển HIRED.');
      }
      if (application.currentStage !== RecruitmentStage.OFFER && application.currentStage !== RecruitmentStage.HIRED) {
        throw new BadRequestException('Chỉ hồ sơ ở stage OFFER mới được chuyển HIRED.');
      }
      await this.ensureAcceptedOfferForApplication(application.id);

      await this.prisma.client.recruitmentApplication.updateMany({
        where: { id },
        data: {
          status: RecruitmentApplicationStatus.HIRED,
          currentStage: RecruitmentStage.HIRED,
          hiredAt: now,
          stageEnteredAt: now,
          lastActivityAt: now
        }
      });

      await this.prisma.client.recruitmentStageHistory.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          applicationId: id,
          fromStage: application.currentStage,
          toStage: RecruitmentStage.HIRED,
          fromStatus: application.status,
          toStatus: RecruitmentApplicationStatus.HIRED,
          actionType: 'STATUS_CHANGED',
          reason: this.toNullableString(payload.reason),
          actorId: this.toNullableString(payload.actorId)
        }
      });

      return this.getRecruitmentApplicationDetail(id);
    }

    throw new BadRequestException('Status cập nhật chưa được hỗ trợ.');
  }

  async createRecruitmentInterview(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const applicationId = this.toNullableString(payload.applicationId);
    if (!applicationId) {
      throw new BadRequestException('Thiếu applicationId.');
    }

    const scheduledAt = this.toDate(payload.scheduledAt);
    if (!scheduledAt) {
      throw new BadRequestException('Thiếu lịch phỏng vấn (scheduledAt).');
    }
    await this.ensureRecruitmentApplicationExists(applicationId);

    const interview = await this.prisma.client.recruitmentInterview.create({
      data: {
        tenant_Id: tenantId,
        applicationId,
        stage: this.normalizeRecruitmentStage(payload.stage, RecruitmentStage.INTERVIEW),
        interviewerId: this.toNullableString(payload.interviewerId),
        interviewerName: this.toNullableString(payload.interviewerName),
        scheduledAt,
        durationMinutes: this.toInt(payload.durationMinutes, 60) ?? 60,
        mode: this.toNullableString(payload.mode),
        location: this.toNullableString(payload.location),
        meetingUrl: this.toNullableString(payload.meetingUrl),
        feedback: this.toNullableString(payload.feedback),
        score: this.toFloat(payload.score),
        status: this.normalizeRecruitmentInterviewStatus(payload.status, RecruitmentInterviewStatus.SCHEDULED)
      }
    });

    await this.touchRecruitmentApplication(applicationId);
    return interview;
  }

  async updateRecruitmentInterview(id: string, payload: HrPayload) {
    const interview = await this.ensureRecruitmentInterviewExists(id);
    await this.prisma.client.recruitmentInterview.updateMany({
      where: { id },
      data: {
        stage: payload.stage ? this.normalizeRecruitmentStage(payload.stage, interview.stage) : undefined,
        interviewerId: this.toNullableString(payload.interviewerId),
        interviewerName: this.toNullableString(payload.interviewerName),
        scheduledAt: this.toDate(payload.scheduledAt),
        durationMinutes: this.toInt(payload.durationMinutes),
        mode: this.toNullableString(payload.mode),
        location: this.toNullableString(payload.location),
        meetingUrl: this.toNullableString(payload.meetingUrl),
        feedback: this.toNullableString(payload.feedback),
        score: this.toFloat(payload.score),
        status: payload.status
          ? this.normalizeRecruitmentInterviewStatus(payload.status, interview.status)
          : undefined
      }
    });

    await this.touchRecruitmentApplication(interview.applicationId);
    return this.prisma.client.recruitmentInterview.findFirst({ where: { id } });
  }

  async createRecruitmentOffer(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const applicationId = this.toNullableString(payload.applicationId);
    if (!applicationId) {
      throw new BadRequestException('Thiếu applicationId.');
    }
    await this.ensureRecruitmentApplicationExists(applicationId);

    const status = this.normalizeRecruitmentOfferStatus(payload.status, RecruitmentOfferStatus.DRAFT);
    const now = new Date();
    const timestamps = this.resolveRecruitmentOfferStatusTimestamps(status, now, null);

    const offer = await this.prisma.client.recruitmentOffer.create({
      data: {
        tenant_Id: tenantId,
        applicationId,
        offeredPosition: this.toNullableString(payload.offeredPosition),
        offeredLevel: this.toNullableString(payload.offeredLevel),
        offeredSalary: this.toDecimal(payload.offeredSalary),
        currency: this.toNullableString(payload.currency) ?? DEFAULT_OFFER_CURRENCY,
        proposedStartDate: this.toDate(payload.proposedStartDate),
        note: this.toNullableString(payload.note),
        status,
        workflowDefinitionId: this.toNullableString(payload.workflowDefinitionId),
        createdBy: this.toNullableString(payload.createdBy),
        updatedBy: this.toNullableString(payload.updatedBy),
        ...timestamps
      }
    });

    await this.touchRecruitmentApplication(applicationId);
    return offer;
  }

  async updateRecruitmentOffer(id: string, payload: HrPayload) {
    const existing = await this.ensureRecruitmentOfferExists(id);
    const nextStatus = payload.status
      ? this.normalizeRecruitmentOfferStatus(payload.status, existing.status)
      : existing.status;
    const now = new Date();

    if (
      nextStatus === RecruitmentOfferStatus.ACCEPTED &&
      existing.status !== RecruitmentOfferStatus.APPROVED &&
      existing.status !== RecruitmentOfferStatus.ACCEPTED
    ) {
      throw new BadRequestException('Chỉ offer đã APPROVED mới được đánh dấu ACCEPTED.');
    }

    const timestamps = this.resolveRecruitmentOfferStatusTimestamps(nextStatus, now, existing);

    await this.prisma.client.recruitmentOffer.updateMany({
      where: { id },
      data: {
        offeredPosition: this.toNullableString(payload.offeredPosition),
        offeredLevel: this.toNullableString(payload.offeredLevel),
        offeredSalary: this.toDecimal(payload.offeredSalary),
        currency: this.toNullableString(payload.currency),
        proposedStartDate: this.toDate(payload.proposedStartDate),
        note: this.toNullableString(payload.note),
        status: nextStatus,
        updatedBy: this.toNullableString(payload.updatedBy),
        ...timestamps
      }
    });

    await this.touchRecruitmentApplication(existing.applicationId);
    return this.prisma.client.recruitmentOffer.findFirst({ where: { id } });
  }

  async submitRecruitmentOfferApproval(id: string, payload: HrPayload) {
    if (!this.workflowsService) {
      throw new BadRequestException('Workflows module chưa sẵn sàng cho duyệt offer.');
    }

    await this.syncPendingRecruitmentOfferApprovals();
    const offer = await this.ensureRecruitmentOfferExists(id);
    if (offer.status !== RecruitmentOfferStatus.DRAFT && offer.status !== RecruitmentOfferStatus.REJECTED) {
      throw new BadRequestException('Chỉ offer DRAFT/REJECTED mới được submit approval.');
    }

    const definitionId = this.toNullableString(payload.definitionId) ?? null;
    const workflowDefinition = await this.resolveRecruitmentOfferWorkflowDefinition(definitionId);
    const requestedBy = this.toUpdateString(payload.requestedBy ?? payload.actorId);

    const instance = await this.workflowsService.submitInstance({
      definitionId: workflowDefinition.id,
      targetType: 'HR_RECRUITMENT_OFFER',
      targetId: offer.id,
      requestedBy,
      contextJson: {
        offerId: offer.id,
        applicationId: offer.applicationId,
        amount: this.toNumber(offer.offeredSalary) ?? 0,
        currency: offer.currency ?? DEFAULT_OFFER_CURRENCY
      }
    });

    const now = new Date();
    await this.prisma.client.recruitmentOffer.updateMany({
      where: { id: offer.id },
      data: {
        status: RecruitmentOfferStatus.PENDING_APPROVAL,
        workflowInstanceId: instance.id,
        workflowDefinitionId: workflowDefinition.id,
        offeredAt: offer.offeredAt ?? now
      }
    });

    await this.touchRecruitmentApplication(offer.applicationId, now);
    return this.prisma.client.recruitmentOffer.findFirst({ where: { id: offer.id } });
  }

  async convertRecruitmentApplicationToEmployee(id: string, payload: HrPayload) {
    await this.syncPendingRecruitmentOfferApprovals(id);
    const application = await this.prisma.client.recruitmentApplication.findFirst({
      where: { id },
      include: {
        candidate: true,
        requisition: true,
        offers: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!application) {
      throw new NotFoundException('Không tìm thấy hồ sơ ứng tuyển.');
    }
    if (application.convertedEmployeeId) {
      throw new BadRequestException('Hồ sơ đã được convert sang nhân sự.');
    }

    const acceptedOffer = application.offers.find(
      (offer) => offer.status === RecruitmentOfferStatus.ACCEPTED && Boolean(offer.approvedAt)
    );
    if (!acceptedOffer) {
      throw new BadRequestException('Chỉ convert khi offer đã APPROVED và ứng viên ACCEPTED.');
    }

    if (application.currentStage !== RecruitmentStage.OFFER && application.currentStage !== RecruitmentStage.HIRED) {
      throw new BadRequestException('Hồ sơ phải ở stage OFFER trước khi convert.');
    }

    const joinDate = this.toDate(payload.joinDate) ?? acceptedOffer.proposedStartDate ?? new Date();
    const employee = await this.prisma.client.employee.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: this.toNullableString(payload.code),
        fullName: this.toNullableString(payload.fullName) ?? application.candidate.fullName,
        email: this.toNullableString(payload.email) ?? application.candidate.email,
        phone: this.toNullableString(payload.phone) ?? application.candidate.phone,
        department: this.toNullableString(payload.department) ?? application.requisition.department,
        position: this.toNullableString(payload.position) ?? acceptedOffer.offeredPosition ?? application.requisition.title,
        positionId: this.toNullableString(payload.positionId) ?? application.requisition.positionId,
        joinDate,
        employmentType: this.normalizeEmploymentType(payload.employmentType),
        baseSalary: this.toDecimal(payload.baseSalary) ?? acceptedOffer.offeredSalary,
        status: GenericStatus.ACTIVE
      }
    });

    const now = new Date();
    await this.prisma.client.recruitmentApplication.updateMany({
      where: { id: application.id },
      data: {
        status: RecruitmentApplicationStatus.HIRED,
        currentStage: RecruitmentStage.HIRED,
        hiredAt: now,
        convertedEmployeeId: employee.id,
        stageEnteredAt: now,
        lastActivityAt: now
      }
    });

    await this.prisma.client.recruitmentStageHistory.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        applicationId: application.id,
        fromStage: application.currentStage,
        toStage: RecruitmentStage.HIRED,
        fromStatus: application.status,
        toStatus: RecruitmentApplicationStatus.HIRED,
        actionType: 'CONVERTED_TO_EMPLOYEE',
        reason: this.toNullableString(payload.reason),
        actorId: this.toNullableString(payload.actorId)
      }
    });

    return {
      employee,
      application: await this.getRecruitmentApplicationDetail(application.id)
    };
  }

  async listRecruitment(query: PaginationQueryDto) {
    return this.prisma.client.recruitment.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createRecruitment(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const jobTitle = this.toNullableString(payload.jobTitle);
    if (!jobTitle) {
      throw new BadRequestException('Thiếu vị trí tuyển dụng.');
    }

    return this.prisma.client.recruitment.create({
      data: {
        tenant_Id: tenantId,
        jobTitle,
        candidateName: this.toNullableString(payload.candidateName),
        stage: this.toNullableString(payload.stage),
        status: this.normalizeStatus(payload.status, GenericStatus.PENDING)
      }
    });
  }

  async updateRecruitment(id: string, payload: HrPayload) {
    await this.ensureRecruitmentExists(id);

    await this.prisma.client.recruitment.updateMany({
      where: { id },
      data: {
        jobTitle: this.toUpdateString(payload.jobTitle),
        candidateName: this.toNullableString(payload.candidateName),
        stage: this.toNullableString(payload.stage),
        status: payload.status ? this.normalizeStatus(payload.status, GenericStatus.PENDING) : undefined
      }
    });

    return this.prisma.client.recruitment.findFirst({ where: { id } });
  }

  async archiveRecruitment(id: string) {
    const recruitment = await this.ensureRecruitmentExists(id);
    if (recruitment.status !== GenericStatus.ARCHIVED) {
      await this.prisma.client.recruitment.updateMany({
        where: { id },
        data: {
          status: GenericStatus.ARCHIVED
        }
      });
    }
    return this.prisma.client.recruitment.findFirst({ where: { id } });
  }

  async listTraining(query: PaginationQueryDto) {
    return this.prisma.client.training.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createTraining(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const title = this.toNullableString(payload.title);
    if (!title) {
      throw new BadRequestException('Thiếu tên khóa đào tạo.');
    }

    return this.prisma.client.training.create({
      data: {
        tenant_Id: tenantId,
        title,
        employeeId: this.toNullableString(payload.employeeId),
        completedAt: this.toDate(payload.completedAt),
        status: this.normalizeStatus(payload.status, GenericStatus.PENDING)
      }
    });
  }

  async updateTraining(id: string, payload: HrPayload) {
    await this.ensureTrainingExists(id);

    await this.prisma.client.training.updateMany({
      where: { id },
      data: {
        title: this.toUpdateString(payload.title),
        employeeId: this.toNullableString(payload.employeeId),
        completedAt: this.toDate(payload.completedAt),
        status: payload.status ? this.normalizeStatus(payload.status, GenericStatus.PENDING) : undefined
      }
    });

    return this.prisma.client.training.findFirst({ where: { id } });
  }

  async listPerformance(query: PaginationQueryDto) {
    return this.prisma.client.performance.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createPerformance(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    const period = this.toNullableString(payload.period);
    if (!employeeId || !period) {
      throw new BadRequestException('Thiếu employeeId hoặc kỳ đánh giá.');
    }

    return this.prisma.client.performance.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        period,
        score: this.toFloat(payload.score),
        reviewerId: this.toNullableString(payload.reviewerId),
        note: this.toNullableString(payload.note)
      }
    });
  }

  async updatePerformance(id: string, payload: HrPayload) {
    await this.ensurePerformanceExists(id);

    await this.prisma.client.performance.updateMany({
      where: { id },
      data: {
        employeeId: this.toUpdateString(payload.employeeId),
        period: this.toUpdateString(payload.period),
        score: this.toFloat(payload.score),
        reviewerId: this.toNullableString(payload.reviewerId),
        note: this.toNullableString(payload.note)
      }
    });

    return this.prisma.client.performance.findFirst({ where: { id } });
  }

  async listBenefits(query: PaginationQueryDto) {
    return this.prisma.client.benefit.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createBenefit(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    const benefitType = this.toNullableString(payload.benefitType);
    if (!employeeId || !benefitType) {
      throw new BadRequestException('Thiếu employeeId hoặc benefitType.');
    }

    return this.prisma.client.benefit.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        benefitType,
        amount: this.toDecimal(payload.amount),
        status: this.normalizeStatus(payload.status)
      }
    });
  }

  async updateBenefit(id: string, payload: HrPayload) {
    await this.ensureBenefitExists(id);

    await this.prisma.client.benefit.updateMany({
      where: { id },
      data: {
        employeeId: this.toUpdateString(payload.employeeId),
        benefitType: this.toUpdateString(payload.benefitType),
        amount: this.toDecimal(payload.amount),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.prisma.client.benefit.findFirst({ where: { id } });
  }

  async listPersonalIncomeTaxProfiles(query: PaginationQueryDto, employeeId?: string) {
    const keyword = query.q?.trim();
    const where: Prisma.PersonalIncomeTaxProfileWhereInput = {
      ...(employeeId ? { employeeId } : {}),
      ...(keyword
        ? {
            OR: [
              { taxCode: { contains: keyword, mode: 'insensitive' } },
              { employeeId: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const profiles = await this.prisma.client.personalIncomeTaxProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });

    if (!profiles.length) {
      return [];
    }

    const employeeIds = Array.from(new Set(profiles.map((profile) => profile.employeeId)));
    const employees = await this.prisma.client.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, code: true, fullName: true, department: true, position: true, status: true }
    });
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    return profiles.map((profile) => ({
      ...profile,
      employeeCode: employeeById.get(profile.employeeId)?.code ?? null,
      employeeName: employeeById.get(profile.employeeId)?.fullName ?? null,
      employeeDepartment: employeeById.get(profile.employeeId)?.department ?? null,
      employeePosition: employeeById.get(profile.employeeId)?.position ?? null,
      employeeStatus: employeeById.get(profile.employeeId)?.status ?? null
    }));
  }

  async createPersonalIncomeTaxProfile(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId cho hồ sơ thuế TNCN.');
    }

    await this.ensureEmployeeExists(employeeId);

    const existing = await this.prisma.client.personalIncomeTaxProfile.findFirst({
      where: { employeeId }
    });
    if (existing) {
      throw new BadRequestException('Nhân viên đã có hồ sơ thuế TNCN.');
    }

    return this.prisma.client.personalIncomeTaxProfile.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        taxCode: this.toNullableString(payload.taxCode),
        personalDeduction: this.toDecimal(payload.personalDeduction) ?? new Prisma.Decimal(DEFAULT_PIT_PERSONAL_DEDUCTION),
        dependentCount: this.toInt(payload.dependentCount, 0) ?? 0,
        dependentDeduction:
          this.toDecimal(payload.dependentDeduction) ?? new Prisma.Decimal(DEFAULT_PIT_DEPENDENT_DEDUCTION),
        insuranceDeduction: this.toDecimal(payload.insuranceDeduction) ?? new Prisma.Decimal(0),
        otherDeduction: this.toDecimal(payload.otherDeduction) ?? new Prisma.Decimal(0),
        taxRate: this.toDecimal(payload.taxRate) ?? new Prisma.Decimal(DEFAULT_PIT_TAX_RATE),
        status: this.normalizeStatus(payload.status),
        note: this.toNullableString(payload.note)
      }
    });
  }

  async updatePersonalIncomeTaxProfile(id: string, payload: HrPayload) {
    const profile = await this.ensurePersonalIncomeTaxProfileExists(id);

    const nextEmployeeId = this.toNullableString(payload.employeeId);
    if (nextEmployeeId && nextEmployeeId !== profile.employeeId) {
      await this.ensureEmployeeExists(nextEmployeeId);
      const duplicate = await this.prisma.client.personalIncomeTaxProfile.findFirst({
        where: { employeeId: nextEmployeeId }
      });
      if (duplicate && duplicate.id !== profile.id) {
        throw new BadRequestException('Nhân viên đích đã có hồ sơ thuế TNCN.');
      }
    }

    await this.prisma.client.personalIncomeTaxProfile.updateMany({
      where: { id },
      data: {
        employeeId: nextEmployeeId ?? undefined,
        taxCode: this.toNullableString(payload.taxCode),
        personalDeduction: this.toDecimal(payload.personalDeduction),
        dependentCount: this.toInt(payload.dependentCount),
        dependentDeduction: this.toDecimal(payload.dependentDeduction),
        insuranceDeduction: this.toDecimal(payload.insuranceDeduction),
        otherDeduction: this.toDecimal(payload.otherDeduction),
        taxRate: this.toDecimal(payload.taxRate),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined,
        note: this.toNullableString(payload.note)
      }
    });

    return this.prisma.client.personalIncomeTaxProfile.findFirst({ where: { id } });
  }

  async listPersonalIncomeTaxRecords(
    query: PaginationQueryDto,
    month?: string,
    year?: string,
    employeeId?: string
  ) {
    const where: Prisma.PersonalIncomeTaxRecordWhereInput = {};
    if (month) where.taxMonth = Number(month);
    if (year) where.taxYear = Number(year);
    if (employeeId) where.employeeId = employeeId;

    const records = await this.prisma.client.personalIncomeTaxRecord.findMany({
      where,
      orderBy: [{ taxYear: 'desc' }, { taxMonth: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit, 500)
    });

    if (!records.length) {
      return [];
    }

    const employeeIds = Array.from(new Set(records.map((record) => record.employeeId)));
    const payrollIds = Array.from(
      new Set(records.map((record) => record.payrollId).filter((value): value is string => !!value))
    );

    const [employees, payrolls] = await Promise.all([
      this.prisma.client.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, code: true, fullName: true, department: true, position: true }
      }),
      payrollIds.length
        ? this.prisma.client.payroll.findMany({
            where: { id: { in: payrollIds } },
            select: {
              id: true,
              payMonth: true,
              payYear: true,
              grossSalary: true,
              netSalary: true,
              status: true
            }
          })
        : Promise.resolve([])
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const payrollById = new Map(payrolls.map((payroll) => [payroll.id, payroll]));

    return records.map((record) => ({
      ...record,
      employeeCode: employeeById.get(record.employeeId)?.code ?? null,
      employeeName: employeeById.get(record.employeeId)?.fullName ?? null,
      employeeDepartment: employeeById.get(record.employeeId)?.department ?? null,
      employeePosition: employeeById.get(record.employeeId)?.position ?? null,
      payroll: record.payrollId ? payrollById.get(record.payrollId) ?? null : null
    }));
  }

  async createPersonalIncomeTaxRecord(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const employeeId = this.toNullableString(payload.employeeId);
    const taxMonth = this.toInt(payload.taxMonth ?? payload.month);
    const taxYear = this.toInt(payload.taxYear ?? payload.year);
    const payrollId = this.toNullableString(payload.payrollId);

    if (!employeeId || !taxMonth || !taxYear) {
      throw new BadRequestException('Thiếu employeeId hoặc tháng/năm tính thuế.');
    }

    this.validateTaxPeriod(taxMonth, taxYear);
    await this.ensureEmployeeExists(employeeId);

    const existing = await this.prisma.client.personalIncomeTaxRecord.findFirst({
      where: { employeeId, taxMonth, taxYear }
    });
    if (existing) {
      throw new BadRequestException('Bản ghi thuế TNCN của nhân viên trong kỳ đã tồn tại.');
    }

    const draft = await this.buildPersonalIncomeTaxDraft({
      employeeId,
      taxMonth,
      taxYear,
      payrollId,
      overrides: payload
    });

    return this.prisma.client.personalIncomeTaxRecord.create({
      data: {
        tenant_Id: tenantId,
        employeeId: draft.employeeId,
        payrollId: draft.payrollId,
        taxProfileId: draft.taxProfileId,
        taxMonth: draft.taxMonth,
        taxYear: draft.taxYear,
        grossTaxable: new Prisma.Decimal(draft.grossTaxable.toFixed(2)),
        deduction: new Prisma.Decimal(draft.deduction.toFixed(2)),
        taxableIncome: new Prisma.Decimal(draft.taxableIncome.toFixed(2)),
        taxRate: new Prisma.Decimal(draft.taxRate.toFixed(4)),
        taxAmount: new Prisma.Decimal(draft.taxAmount.toFixed(2)),
        status: this.normalizeStatus(payload.status, GenericStatus.DRAFT),
        note: draft.note ?? null
      }
    });
  }

  async updatePersonalIncomeTaxRecord(id: string, payload: HrPayload) {
    const row = await this.ensurePersonalIncomeTaxRecordExists(id);
    const employeeId = this.toNullableString(payload.employeeId) ?? row.employeeId;
    const taxMonth = this.toInt(payload.taxMonth ?? payload.month, row.taxMonth) ?? row.taxMonth;
    const taxYear = this.toInt(payload.taxYear ?? payload.year, row.taxYear) ?? row.taxYear;
    const payrollId = this.toNullableString(payload.payrollId) ?? row.payrollId;

    this.validateTaxPeriod(taxMonth, taxYear);
    await this.ensureEmployeeExists(employeeId);

    const draft = await this.buildPersonalIncomeTaxDraft({
      employeeId,
      taxMonth,
      taxYear,
      payrollId,
      overrides: payload
    });

    await this.prisma.client.personalIncomeTaxRecord.updateMany({
      where: { id },
      data: {
        employeeId: draft.employeeId,
        payrollId: draft.payrollId,
        taxProfileId: draft.taxProfileId,
        taxMonth: draft.taxMonth,
        taxYear: draft.taxYear,
        grossTaxable: new Prisma.Decimal(draft.grossTaxable.toFixed(2)),
        deduction: new Prisma.Decimal(draft.deduction.toFixed(2)),
        taxableIncome: new Prisma.Decimal(draft.taxableIncome.toFixed(2)),
        taxRate: new Prisma.Decimal(draft.taxRate.toFixed(4)),
        taxAmount: new Prisma.Decimal(draft.taxAmount.toFixed(2)),
        status: payload.status ? this.normalizeStatus(payload.status, GenericStatus.DRAFT) : undefined,
        note: draft.note ?? row.note
      }
    });

    return this.prisma.client.personalIncomeTaxRecord.findFirst({ where: { id } });
  }

  async generatePersonalIncomeTaxRecords(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const taxMonth = this.toInt(payload.taxMonth ?? payload.month);
    const taxYear = this.toInt(payload.taxYear ?? payload.year);
    const employeeId = this.toNullableString(payload.employeeId);

    if (!taxMonth || !taxYear) {
      throw new BadRequestException('Thiếu tháng/năm generate thuế TNCN.');
    }
    this.validateTaxPeriod(taxMonth, taxYear);

    const payrollRows = await this.prisma.client.payroll.findMany({
      where: {
        payMonth: taxMonth,
        payYear: taxYear,
        ...(employeeId ? { employeeId } : {})
      },
      orderBy: [{ employeeId: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, employeeId: true, createdAt: true }
    });

    if (!payrollRows.length) {
      throw new BadRequestException('Không có bảng lương trong kỳ để generate thuế TNCN.');
    }

    const latestPayrollByEmployee = new Map<string, { id: string; employeeId: string; createdAt: Date }>();
    for (const payroll of payrollRows) {
      if (!latestPayrollByEmployee.has(payroll.employeeId)) {
        latestPayrollByEmployee.set(payroll.employeeId, payroll);
      }
    }

    let created = 0;
    for (const payroll of latestPayrollByEmployee.values()) {
      const draft = await this.buildPersonalIncomeTaxDraft({
        employeeId: payroll.employeeId,
        taxMonth,
        taxYear,
        payrollId: payroll.id,
        overrides: payload
      });

      await this.prisma.client.personalIncomeTaxRecord.upsert({
        where: {
          tenant_Id_employeeId_taxYear_taxMonth: {
            tenant_Id: tenantId,
            employeeId: payroll.employeeId,
            taxYear,
            taxMonth
          }
        },
        create: {
          tenant_Id: tenantId,
          employeeId: draft.employeeId,
          payrollId: draft.payrollId,
          taxProfileId: draft.taxProfileId,
          taxMonth: draft.taxMonth,
          taxYear: draft.taxYear,
          grossTaxable: new Prisma.Decimal(draft.grossTaxable.toFixed(2)),
          deduction: new Prisma.Decimal(draft.deduction.toFixed(2)),
          taxableIncome: new Prisma.Decimal(draft.taxableIncome.toFixed(2)),
          taxRate: new Prisma.Decimal(draft.taxRate.toFixed(4)),
          taxAmount: new Prisma.Decimal(draft.taxAmount.toFixed(2)),
          status: this.normalizeStatus(payload.status, GenericStatus.DRAFT),
          note: draft.note ?? null
        },
        update: {
          payrollId: draft.payrollId,
          taxProfileId: draft.taxProfileId,
          grossTaxable: new Prisma.Decimal(draft.grossTaxable.toFixed(2)),
          deduction: new Prisma.Decimal(draft.deduction.toFixed(2)),
          taxableIncome: new Prisma.Decimal(draft.taxableIncome.toFixed(2)),
          taxRate: new Prisma.Decimal(draft.taxRate.toFixed(4)),
          taxAmount: new Prisma.Decimal(draft.taxAmount.toFixed(2)),
          status: this.normalizeStatus(payload.status, GenericStatus.DRAFT),
          note: draft.note ?? null
        }
      });
      created += 1;
    }

    return { taxMonth, taxYear, count: created };
  }

  async listGoals(query: PaginationQueryDto, employeeId?: string, period?: string, status?: GenericStatus) {
    await this.syncPendingGoalApprovals();
    await this.recomputeStaleGoalAutos({ force: false });

    const keyword = query.q?.trim();
    const where: Prisma.HrGoalWhereInput = {
      ...(employeeId ? { employeeId } : {}),
      ...(period ? { period } : {}),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
              { goalCode: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const rows = await this.prisma.client.hrGoal.findMany({
      where,
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit)
    });
    return this.enrichGoalsWithEmployeeMeta(rows);
  }

  async createGoal(payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    const actor = this.resolveGoalActor();
    const employeeId = this.toNullableString(payload.employeeId) ?? actor.employeeId;
    const title = this.toNullableString(payload.title);
    const period = this.toNullableString(payload.period);
    if (!employeeId || !title || !period) {
      throw new BadRequestException('Thiếu employeeId, title hoặc period.');
    }

    this.assertGoalCreateAccess(actor, employeeId);
    await this.ensureEmployeeExists(employeeId);
    const trackingMode = this.normalizeGoalTrackingMode(payload.trackingMode, HrGoalTrackingMode.MANUAL);
    const startDate = this.toDate(payload.startDate);
    const endDate = this.toDate(payload.endDate);
    if (trackingMode !== HrGoalTrackingMode.MANUAL && (!startDate || !endDate)) {
      throw new BadRequestException('Goal AUTO/HYBRID bắt buộc có startDate và endDate.');
    }

    const manualAdjustmentValue = this.resolveInitialManualAdjustment(payload, trackingMode);
    const autoCurrentValue = this.resolveInitialAutoCurrentValue(payload, trackingMode);
    const effectiveCurrent = autoCurrentValue + manualAdjustmentValue;
    const progress = this.resolveGoalProgress(
      {
        ...payload,
        currentValue: effectiveCurrent
      },
      undefined
    );
    const initialStatus = payload.status
      ? this.normalizeStatus(payload.status, GenericStatus.DRAFT)
      : GenericStatus.DRAFT;

    const created = await this.prisma.client.hrGoal.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        goalCode: this.toNullableString(payload.goalCode),
        title,
        description: this.toNullableString(payload.description),
        period,
        targetValue: this.toDecimal(payload.targetValue),
        currentValue: this.toDecimal(effectiveCurrent),
        trackingMode,
        autoCurrentValue: new Prisma.Decimal(autoCurrentValue.toFixed(2)),
        manualAdjustmentValue: new Prisma.Decimal(manualAdjustmentValue.toFixed(2)),
        progressPercent: progress.progressPercent,
        weight: this.toFloat(payload.weight),
        startDate,
        endDate,
        completedAt: progress.completedAt,
        approvedAt: initialStatus === GenericStatus.APPROVED ? new Date() : null,
        rejectedAt: initialStatus === GenericStatus.REJECTED ? new Date() : null,
        status: initialStatus,
        note: this.toNullableString(payload.note),
        createdBy: this.toNullableString(payload.createdBy) ?? actor.actorId
      }
    });

    if (Array.isArray(payload.metricBindings)) {
      await this.replaceGoalMetricBindings(created.id, payload.metricBindings as unknown[]);
    }

    await this.recordGoalTimeline(created.id, {
      eventType: 'CREATED',
      actorId: actor.actorId,
      toStatus: created.status,
      progressPercent: created.progressPercent ?? 0,
      note: this.toNullableString(payload.note),
      payload: {
        trackingMode: created.trackingMode
      }
    });

    return this.prisma.client.hrGoal.findFirst({
      where: { id: created.id },
      include: {
        metricBindings: {
          where: { status: GenericStatus.ACTIVE },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async updateGoal(id: string, payload: HrPayload) {
    const existing = await this.ensureGoalExists(id);
    const actor = this.resolveGoalActor();
    this.assertGoalWriteAccess(actor, existing.employeeId);

    const employeeId = this.toNullableString(payload.employeeId) ?? existing.employeeId;
    await this.ensureEmployeeExists(employeeId);

    const trackingMode = this.normalizeGoalTrackingMode(payload.trackingMode, existing.trackingMode);
    const startDate = this.toDate(payload.startDate) ?? existing.startDate;
    const endDate = this.toDate(payload.endDate) ?? existing.endDate;
    if (trackingMode !== HrGoalTrackingMode.MANUAL && (!startDate || !endDate)) {
      throw new BadRequestException('Goal AUTO/HYBRID bắt buộc có startDate và endDate.');
    }

    const autoCurrentValue =
      this.toNumber(payload.autoCurrentValue) ??
      this.toNumber(existing.autoCurrentValue) ??
      0;
    let manualAdjustmentValue =
      this.toNumber(payload.manualAdjustmentValue) ??
      this.toNumber(existing.manualAdjustmentValue) ??
      0;

    if (Object.prototype.hasOwnProperty.call(payload, 'currentValue')) {
      const nextCurrent = this.toNumber(payload.currentValue);
      if (nextCurrent !== null) {
        manualAdjustmentValue = nextCurrent - autoCurrentValue;
      }
    }

    if (trackingMode === HrGoalTrackingMode.MANUAL) {
      manualAdjustmentValue =
        this.toNumber(payload.currentValue) ??
        this.toNumber(payload.manualAdjustmentValue) ??
        this.toNumber(existing.currentValue) ??
        manualAdjustmentValue;
    }

    const effectiveCurrent = autoCurrentValue + manualAdjustmentValue;
    const progress = this.resolveGoalProgress(
      {
        ...payload,
        currentValue: effectiveCurrent
      },
      existing
    );
    const nextStatus = payload.status
      ? this.normalizeStatus(payload.status, existing.status)
      : this.resolveGoalLifecycleStatus(existing.status, progress.progressPercent ?? 0);

    await this.prisma.client.hrGoal.updateMany({
      where: { id },
      data: {
        employeeId,
        goalCode: this.toNullableString(payload.goalCode),
        title: this.toUpdateString(payload.title),
        description: this.toNullableString(payload.description),
        period: this.toUpdateString(payload.period),
        targetValue: this.toDecimal(payload.targetValue),
        currentValue: this.toDecimal(effectiveCurrent),
        trackingMode,
        autoCurrentValue: new Prisma.Decimal(autoCurrentValue.toFixed(2)),
        manualAdjustmentValue: new Prisma.Decimal(manualAdjustmentValue.toFixed(2)),
        progressPercent: progress.progressPercent,
        weight: this.toFloat(payload.weight),
        startDate,
        endDate,
        approvedAt:
          nextStatus === GenericStatus.APPROVED
            ? (existing.approvedAt ?? progress.completedAt ?? new Date())
            : null,
        rejectedAt:
          nextStatus === GenericStatus.REJECTED
            ? (existing.rejectedAt ?? new Date())
            : null,
        completedAt: progress.completedAt,
        status: nextStatus,
        note: this.toNullableString(payload.note),
        createdBy: this.toNullableString(payload.createdBy) ?? existing.createdBy
      }
    });

    if (Array.isArray(payload.metricBindings)) {
      await this.replaceGoalMetricBindings(id, payload.metricBindings as unknown[]);
    }

    await this.recordGoalTimeline(id, {
      eventType: 'UPDATED',
      actorId: actor.actorId,
      fromStatus: existing.status,
      toStatus: nextStatus,
      progressPercent: progress.progressPercent ?? 0,
      note: this.toNullableString(payload.note),
      payload: {
        trackingMode
      }
    });

    return this.prisma.client.hrGoal.findFirst({
      where: { id },
      include: {
        metricBindings: {
          where: { status: GenericStatus.ACTIVE },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async updateGoalProgress(id: string, payload: HrPayload) {
    const existing = await this.ensureGoalExists(id);
    const actor = this.resolveGoalActor();
    this.assertGoalWriteAccess(actor, existing.employeeId);

    const existingAutoCurrent = this.toNumber(existing.autoCurrentValue) ?? 0;
    const existingManualAdjustment = this.toNumber(existing.manualAdjustmentValue) ?? 0;
    const inputCurrent = this.toNumber(payload.currentValue);
    const manualAdjustmentFromCurrent =
      inputCurrent !== null ? inputCurrent - existingAutoCurrent : null;
    const manualAdjustmentValue =
      this.toNumber(payload.manualAdjustmentValue) ??
      manualAdjustmentFromCurrent ??
      existingManualAdjustment;
    const effectiveCurrent = existingAutoCurrent + manualAdjustmentValue;
    const progress = this.resolveGoalProgress(
      {
        ...payload,
        currentValue: effectiveCurrent
      },
      existing
    );
    const nextStatus = payload.status
      ? this.normalizeStatus(payload.status, existing.status)
      : this.resolveGoalLifecycleStatus(existing.status, progress.progressPercent ?? 0);

    await this.prisma.client.hrGoal.updateMany({
      where: { id },
      data: {
        currentValue: this.toDecimal(effectiveCurrent),
        manualAdjustmentValue: new Prisma.Decimal(manualAdjustmentValue.toFixed(2)),
        progressPercent: progress.progressPercent,
        approvedAt:
          nextStatus === GenericStatus.APPROVED
            ? (existing.approvedAt ?? progress.completedAt ?? new Date())
            : null,
        rejectedAt:
          nextStatus === GenericStatus.REJECTED
            ? (existing.rejectedAt ?? new Date())
            : null,
        completedAt: progress.completedAt,
        status: nextStatus,
        note: this.toNullableString(payload.note)
      }
    });

    await this.recordGoalTimeline(id, {
      eventType: 'PROGRESS_UPDATED',
      actorId: actor.actorId,
      fromStatus: existing.status,
      toStatus: nextStatus,
      progressPercent: progress.progressPercent ?? 0,
      note: this.toNullableString(payload.note),
      payload: {
        currentValue: effectiveCurrent,
        manualAdjustmentValue
      }
    });

    return this.prisma.client.hrGoal.findFirst({
      where: { id },
      include: {
        metricBindings: {
          where: { status: GenericStatus.ACTIVE },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async getGoalsTracker(query: PaginationQueryDto, filters: GoalTrackerFilters) {
    await this.syncPendingGoalApprovals();
    const access = await this.resolveGoalAccessContext(filters);
    await this.recomputeStaleGoalAutos({
      access,
      filters,
      force: false
    });

    const where = await this.buildGoalWhereInput(query.q, filters, access);
    const rows = await this.prisma.client.hrGoal.findMany({
      where,
      include: {
        metricBindings: {
          where: { status: GenericStatus.ACTIVE },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: [{ period: 'desc' }, { updatedAt: 'desc' }],
      take: this.take(query.limit, 500)
    });

    const items = await this.enrichGoalsWithEmployeeMeta(rows);
    const grouped = this.groupGoalsByStatus(items);

    return {
      scope: access.scope,
      items,
      grouped,
      totals: {
        all: items.length,
        draft: grouped.DRAFT.length,
        pending: grouped.PENDING.length,
        active: grouped.ACTIVE.length,
        approved: grouped.APPROVED.length,
        rejected: grouped.REJECTED.length,
        archived: grouped.ARCHIVED.length
      }
    };
  }

  async getGoalsOverview(query: PaginationQueryDto, filters: GoalTrackerFilters) {
    await this.syncPendingGoalApprovals();
    const access = await this.resolveGoalAccessContext(filters);
    await this.recomputeStaleGoalAutos({
      access,
      filters,
      force: false
    });

    const where = await this.buildGoalWhereInput(query.q, filters, access);
    const rows = await this.prisma.client.hrGoal.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        status: true,
        progressPercent: true,
        weight: true,
        trackingMode: true
      },
      take: this.take(query.limit, 1000)
    });

    if (!rows.length) {
      return {
        scope: access.scope,
        totals: {
          all: 0,
          draft: 0,
          pending: 0,
          active: 0,
          approved: 0,
          rejected: 0,
          archived: 0
        },
        progress: {
          avgProgressPercent: 0,
          weightedProgressPercent: 0,
          completionRatePercent: 0
        },
        trackingModes: {
          manual: 0,
          auto: 0,
          hybrid: 0
        },
        byDepartment: [],
        byEmployee: []
      };
    }

    const employeeIds = Array.from(new Set(rows.map((row) => row.employeeId)));
    const employees = await this.prisma.client.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, fullName: true, department: true, departmentId: true }
    });
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    const totals = {
      all: rows.length,
      draft: rows.filter((row) => row.status === GenericStatus.DRAFT).length,
      pending: rows.filter((row) => row.status === GenericStatus.PENDING).length,
      active: rows.filter((row) => row.status === GenericStatus.ACTIVE).length,
      approved: rows.filter((row) => row.status === GenericStatus.APPROVED).length,
      rejected: rows.filter((row) => row.status === GenericStatus.REJECTED).length,
      archived: rows.filter((row) => row.status === GenericStatus.ARCHIVED).length
    };

    let weightedScore = 0;
    let weightSum = 0;
    let progressSum = 0;
    for (const row of rows) {
      const progress = this.clampNumber(this.toNumber(row.progressPercent) ?? 0, 0, 100);
      const weight = this.toNumber(row.weight) ?? 1;
      progressSum += progress;
      weightedScore += progress * weight;
      weightSum += weight;
    }

    const departmentMap = new Map<
      string,
      { key: string; name: string; total: number; approved: number; progressSum: number }
    >();
    const employeeMap = new Map<string, { id: string; name: string; total: number; approved: number; progressSum: number }>();
    for (const row of rows) {
      const employee = employeeById.get(row.employeeId);
      const departmentKey = employee?.departmentId ?? employee?.department ?? 'UNASSIGNED';
      const departmentLabel = employee?.department ?? employee?.departmentId ?? 'Chưa gán phòng ban';
      if (!departmentMap.has(departmentKey)) {
        departmentMap.set(departmentKey, {
          key: departmentKey,
          name: departmentLabel,
          total: 0,
          approved: 0,
          progressSum: 0
        });
      }
      const departmentItem = departmentMap.get(departmentKey)!;
      departmentItem.total += 1;
      departmentItem.approved += row.status === GenericStatus.APPROVED ? 1 : 0;
      departmentItem.progressSum += this.clampNumber(this.toNumber(row.progressPercent) ?? 0, 0, 100);

      if (!employeeMap.has(row.employeeId)) {
        employeeMap.set(row.employeeId, {
          id: row.employeeId,
          name: employee?.fullName ?? row.employeeId,
          total: 0,
          approved: 0,
          progressSum: 0
        });
      }
      const employeeItem = employeeMap.get(row.employeeId)!;
      employeeItem.total += 1;
      employeeItem.approved += row.status === GenericStatus.APPROVED ? 1 : 0;
      employeeItem.progressSum += this.clampNumber(this.toNumber(row.progressPercent) ?? 0, 0, 100);
    }

    const byDepartment = Array.from(departmentMap.values())
      .map((value) => {
        return {
          key: value.key,
          name: value.name,
          total: value.total,
          approved: value.approved,
          avgProgressPercent: value.total > 0 ? Number((value.progressSum / value.total).toFixed(2)) : 0
        };
      })
      .sort((left, right) => right.total - left.total);

    const byEmployee = Array.from(employeeMap.values())
      .map((item) => ({
        id: item.id,
        name: item.name,
        total: item.total,
        approved: item.approved,
        avgProgressPercent: item.total > 0 ? Number((item.progressSum / item.total).toFixed(2)) : 0
      }))
      .sort((left, right) => right.avgProgressPercent - left.avgProgressPercent)
      .slice(0, 20);

    return {
      scope: access.scope,
      totals,
      progress: {
        avgProgressPercent: Number((progressSum / rows.length).toFixed(2)),
        weightedProgressPercent: weightSum > 0 ? Number((weightedScore / weightSum).toFixed(2)) : 0,
        completionRatePercent: rows.length > 0 ? Number(((totals.approved / rows.length) * 100).toFixed(2)) : 0
      },
      trackingModes: {
        manual: rows.filter((row) => row.trackingMode === HrGoalTrackingMode.MANUAL).length,
        auto: rows.filter((row) => row.trackingMode === HrGoalTrackingMode.AUTO).length,
        hybrid: rows.filter((row) => row.trackingMode === HrGoalTrackingMode.HYBRID).length
      },
      byDepartment,
      byEmployee
    };
  }

  async getGoalTimeline(id: string) {
    const goal = await this.ensureGoalExists(id);
    const access = await this.resolveGoalAccessContext({ scope: 'company' });
    this.assertGoalReadAccess(access, goal.employeeId);

    return this.prisma.client.hrGoalTimeline.findMany({
      where: { goalId: id },
      orderBy: { createdAt: 'desc' },
      take: 300
    });
  }

  async submitGoalApproval(id: string, payload: HrPayload) {
    if (!this.workflowsService) {
      throw new BadRequestException('Workflows module chưa sẵn sàng cho duyệt mục tiêu.');
    }

    await this.syncPendingGoalApprovals();
    const goal = await this.ensureGoalExists(id);
    const actor = this.resolveGoalActor();
    this.assertGoalWriteAccess(actor, goal.employeeId);

    if (goal.status !== GenericStatus.DRAFT && goal.status !== GenericStatus.REJECTED) {
      throw new BadRequestException('Chỉ mục tiêu DRAFT/REJECTED mới được submit duyệt.');
    }

    if (
      goal.trackingMode !== HrGoalTrackingMode.MANUAL &&
      (!goal.startDate || !goal.endDate)
    ) {
      throw new BadRequestException('Goal AUTO/HYBRID phải có thời gian để submit duyệt.');
    }

    const definitionId = this.toNullableString(payload.definitionId) ?? null;
    const workflowDefinition = await this.resolveGoalWorkflowDefinition(definitionId);
    const requestedBy = this.toUpdateString(payload.requestedBy ?? payload.actorId) ?? actor.actorId;

    const instance = await this.workflowsService.submitInstance({
      definitionId: workflowDefinition.id,
      targetType: 'HR_GOAL',
      targetId: goal.id,
      requestedBy,
      contextJson: {
        goalId: goal.id,
        employeeId: goal.employeeId,
        title: goal.title,
        period: goal.period,
        targetValue: this.toNumber(goal.targetValue) ?? 0
      }
    });

    const now = new Date();
    await this.prisma.client.hrGoal.updateMany({
      where: { id: goal.id },
      data: {
        status: GenericStatus.PENDING,
        workflowDefinitionId: workflowDefinition.id,
        workflowInstanceId: instance.id,
        submittedAt: now
      }
    });

    await this.recordGoalTimeline(goal.id, {
      eventType: 'SUBMITTED',
      actorId: actor.actorId,
      fromStatus: goal.status,
      toStatus: GenericStatus.PENDING,
      progressPercent: goal.progressPercent ?? 0,
      note: this.toNullableString(payload.note),
      payload: {
        workflowDefinitionId: workflowDefinition.id,
        workflowInstanceId: instance.id
      }
    });

    return this.prisma.client.hrGoal.findFirst({ where: { id: goal.id } });
  }

  async recomputeGoalAuto(id: string, payload: HrPayload) {
    const goal = await this.ensureGoalExists(id);
    const access = await this.resolveGoalAccessContext({ scope: 'company' });
    this.assertGoalReadAccess(access, goal.employeeId);

    const actor = this.resolveGoalActor();
    const force = this.toBool(payload.force, true);
    const result = await this.recomputeOneGoalAuto(goal, {
      force,
      actorId: actor.actorId
    });

    return {
      updated: result.updated,
      goalId: goal.id,
      reason: result.reason
    };
  }

  async recomputeGoalsAuto(payload: HrPayload) {
    const filters: GoalTrackerFilters = {
      scope: this.toNullableString(payload.scope) ?? undefined,
      employeeId: this.toNullableString(payload.employeeId) ?? undefined,
      period: this.toNullableString(payload.period) ?? undefined,
      status: payload.status ? this.normalizeStatus(payload.status, GenericStatus.ACTIVE) : undefined,
      trackingMode: this.toNullableString(payload.trackingMode) ?? undefined,
      departmentId: this.toNullableString(payload.departmentId) ?? undefined,
      orgUnitId: this.toNullableString(payload.orgUnitId) ?? undefined
    };
    const access = await this.resolveGoalAccessContext(filters);
    const force = this.toBool(payload.force, false);
    return this.recomputeStaleGoalAutos({
      filters,
      access,
      force
    });
  }

  async listEmployeeInfo(query: PaginationQueryDto) {
    const keyword = query.q?.trim();
    const where: Prisma.EmployeeWhereInput = keyword
      ? {
          OR: [
            { fullName: { contains: keyword, mode: 'insensitive' } },
            { code: { contains: keyword, mode: 'insensitive' } },
            { email: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword } },
            { department: { contains: keyword, mode: 'insensitive' } },
            { position: { contains: keyword, mode: 'insensitive' } }
          ]
        }
      : {};

    const employees = await this.prisma.client.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit, 300)
    });
    if (!employees.length) {
      return [];
    }

    const employeeIds = employees.map((employee) => employee.id);
    const [contracts, benefits, events, payrolls, taxProfiles] = await Promise.all([
      this.prisma.client.employeeContract.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: [{ employeeId: 'asc' }, { startDate: 'desc' }]
      }),
      this.prisma.client.benefit.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: [{ employeeId: 'asc' }, { createdAt: 'desc' }]
      }),
      this.prisma.client.hrEvent.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: [{ employeeId: 'asc' }, { effectiveAt: 'desc' }]
      }),
      this.prisma.client.payroll.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: [{ employeeId: 'asc' }, { payYear: 'desc' }, { payMonth: 'desc' }, { createdAt: 'desc' }]
      }),
      this.prisma.client.personalIncomeTaxProfile.findMany({
        where: { employeeId: { in: employeeIds } }
      })
    ]);

    const latestContractMap = new Map<string, (typeof contracts)[number]>();
    for (const contract of contracts) {
      if (!latestContractMap.has(contract.employeeId)) {
        latestContractMap.set(contract.employeeId, contract);
      }
    }

    const latestEventMap = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      if (!latestEventMap.has(event.employeeId)) {
        latestEventMap.set(event.employeeId, event);
      }
    }

    const latestPayrollMap = new Map<string, (typeof payrolls)[number]>();
    for (const payroll of payrolls) {
      if (!latestPayrollMap.has(payroll.employeeId)) {
        latestPayrollMap.set(payroll.employeeId, payroll);
      }
    }

    const taxProfileMap = new Map(taxProfiles.map((profile) => [profile.employeeId, profile]));
    const benefitCountMap = new Map<string, number>();
    for (const benefit of benefits) {
      benefitCountMap.set(benefit.employeeId, (benefitCountMap.get(benefit.employeeId) ?? 0) + 1);
    }

    return employees.map((employee) => ({
      ...employee,
      latestContract: latestContractMap.get(employee.id) ?? null,
      latestEvent: latestEventMap.get(employee.id) ?? null,
      latestPayroll: latestPayrollMap.get(employee.id) ?? null,
      benefitCount: benefitCountMap.get(employee.id) ?? 0,
      taxProfile: taxProfileMap.get(employee.id) ?? null
    }));
  }

  async getEmployeeInfo(id: string) {
    const employee = await this.ensureEmployeeExists(id);
    const [contracts, benefits, events, payrolls, taxProfile, goals] = await Promise.all([
      this.prisma.client.employeeContract.findMany({
        where: { employeeId: id },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        take: 20
      }),
      this.prisma.client.benefit.findMany({
        where: { employeeId: id },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      this.prisma.client.hrEvent.findMany({
        where: { employeeId: id },
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        take: 30
      }),
      this.prisma.client.payroll.findMany({
        where: { employeeId: id },
        orderBy: [{ payYear: 'desc' }, { payMonth: 'desc' }, { createdAt: 'desc' }],
        take: 12
      }),
      this.prisma.client.personalIncomeTaxProfile.findFirst({
        where: { employeeId: id }
      }),
      this.prisma.client.hrGoal.findMany({
        where: { employeeId: id },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        take: 20
      })
    ]);

    return {
      employee,
      contracts,
      benefits,
      events,
      payrolls,
      taxProfile,
      goals
    };
  }

  async updateEmployeeInfo(id: string, payload: HrPayload) {
    await this.ensureEmployeeExists(id);

    await this.prisma.client.employee.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(payload.code),
        fullName: this.toUpdateString(payload.fullName ?? payload.name),
        email: this.toNullableString(payload.email),
        phone: this.toNullableString(payload.phone),
        dateOfBirth: this.toDate(payload.dateOfBirth),
        gender: this.toNullableString(payload.gender),
        nationalId: this.toNullableString(payload.nationalId),
        address: this.toNullableString(payload.address),
        bankAccountNo: this.toNullableString(payload.bankAccountNo),
        bankName: this.toNullableString(payload.bankName),
        taxCode: this.toNullableString(payload.taxCode),
        department: this.toNullableString(payload.department),
        departmentId: this.toNullableString(payload.departmentId),
        position: this.toNullableString(payload.position ?? payload.role),
        positionId: this.toNullableString(payload.positionId),
        managerId: this.toNullableString(payload.managerId),
        workShiftId: this.toNullableString(payload.workShiftId),
        joinDate: this.toDate(payload.joinDate),
        employmentType: payload.employmentType ? this.normalizeEmploymentType(payload.employmentType) : undefined,
        baseSalary: this.toDecimal(payload.baseSalary),
        status: payload.status ? this.normalizeStatus(payload.status) : undefined
      }
    });

    return this.getEmployeeInfo(id);
  }

  async listEmployeeEvents(query: PaginationQueryDto, employeeId?: string) {
    const where: Prisma.HrEventWhereInput = employeeId ? { employeeId } : {};
    return this.prisma.client.hrEvent.findMany({
      where,
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: this.take(query.limit)
    });
  }

  async createEmployeeEvent(employeeId: string, payload: HrPayload) {
    const tenantId = this.prisma.getTenantId();
    await this.ensureEmployeeExists(employeeId);

    const eventType = this.toNullableString(payload.eventType);
    const effectiveAt = this.toDate(payload.effectiveAt) ?? new Date();
    if (!eventType) {
      throw new BadRequestException('Thiếu eventType.');
    }

    return this.prisma.client.hrEvent.create({
      data: {
        tenant_Id: tenantId,
        employeeId,
        eventType,
        effectiveAt,
        payload: this.toJson(payload.payload),
        createdBy: this.toNullableString(payload.createdBy)
      }
    });
  }

  private resolveGoalActor() {
    const authEnabled = this.isGoalAuthEnabled();
    const authUserRaw = this.cls?.get(AUTH_USER_CONTEXT_KEY) as AuthUser | undefined;
    const authUser = authUserRaw && typeof authUserRaw === 'object' ? authUserRaw : undefined;
    const roleRaw = String(authUser?.role ?? '').trim().toUpperCase();
    const role = (Object.values(UserRole) as string[]).includes(roleRaw)
      ? (roleRaw as UserRole)
      : ('ANONYMOUS' as const);
    const employeeId = this.toNullableString(authUser?.employeeId) ?? null;
    const actorId =
      this.toNullableString(authUser?.userId) ??
      this.toNullableString(authUser?.sub) ??
      this.toNullableString(authUser?.email) ??
      employeeId ??
      'system';

    return {
      authEnabled,
      role,
      employeeId,
      actorId
    };
  }

  private isGoalAuthEnabled() {
    const env = String(this.config?.get<string>('AUTH_ENABLED', 'false') ?? 'false')
      .trim()
      .toLowerCase();
    return env === 'true';
  }

  private assertGoalCreateAccess(
    actor: { authEnabled: boolean; role: UserRole | 'ANONYMOUS'; employeeId: string | null },
    targetEmployeeId: string
  ) {
    if (!actor.authEnabled) {
      return;
    }
    if (actor.role === 'ANONYMOUS') {
      throw new ForbiddenException('Không xác định người dùng để tạo mục tiêu.');
    }
    if (actor.role === UserRole.STAFF && actor.employeeId && actor.employeeId !== targetEmployeeId) {
      throw new ForbiddenException('Nhân viên chỉ được tạo mục tiêu của chính mình.');
    }
  }

  private assertGoalWriteAccess(
    actor: { authEnabled: boolean; role: UserRole | 'ANONYMOUS'; employeeId: string | null },
    targetEmployeeId: string
  ) {
    if (!actor.authEnabled) {
      return;
    }
    if (actor.role === 'ANONYMOUS') {
      throw new ForbiddenException('Không xác định người dùng để cập nhật mục tiêu.');
    }
    if (actor.role === UserRole.STAFF && actor.employeeId && actor.employeeId !== targetEmployeeId) {
      throw new ForbiddenException('Nhân viên chỉ được cập nhật mục tiêu của chính mình.');
    }
  }

  private assertGoalReadAccess(access: GoalAccessContext, targetEmployeeId: string) {
    if (!access.authEnabled) {
      return;
    }
    if (access.allowedEmployeeIds === null) {
      return;
    }
    if (!access.allowedEmployeeIds.includes(targetEmployeeId)) {
      throw new ForbiddenException('Không có quyền xem mục tiêu này.');
    }
  }

  private normalizeGoalTrackingMode(value: unknown): HrGoalTrackingMode | undefined;
  private normalizeGoalTrackingMode(value: unknown, fallback: HrGoalTrackingMode): HrGoalTrackingMode;
  private normalizeGoalTrackingMode(value: unknown, fallback?: HrGoalTrackingMode) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(HrGoalTrackingMode) as string[]).includes(normalized)) {
      return normalized as HrGoalTrackingMode;
    }
    return fallback;
  }

  private normalizeGoalScope(value: unknown, fallback: GoalScope = 'self') {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'self' || normalized === 'team' || normalized === 'department' || normalized === 'company') {
      return normalized as GoalScope;
    }
    return fallback;
  }

  private resolveInitialManualAdjustment(payload: HrPayload, trackingMode: HrGoalTrackingMode) {
    if (trackingMode === HrGoalTrackingMode.MANUAL) {
      return this.toNumber(payload.currentValue) ?? this.toNumber(payload.manualAdjustmentValue) ?? 0;
    }
    return this.toNumber(payload.manualAdjustmentValue) ?? 0;
  }

  private resolveInitialAutoCurrentValue(payload: HrPayload, trackingMode: HrGoalTrackingMode) {
    if (trackingMode === HrGoalTrackingMode.MANUAL) {
      return 0;
    }
    return this.toNumber(payload.autoCurrentValue) ?? 0;
  }

  private resolveGoalLifecycleStatus(currentStatus: GenericStatus, progressPercent: number) {
    const normalized = this.clampNumber(progressPercent, 0, 100);
    const lockedStatuses = new Set<GenericStatus>([
      GenericStatus.PENDING,
      GenericStatus.REJECTED,
      GenericStatus.ARCHIVED,
      GenericStatus.DRAFT
    ]);
    if (lockedStatuses.has(currentStatus)) {
      return currentStatus;
    }
    if (normalized >= 100) {
      return GenericStatus.APPROVED;
    }
    return GenericStatus.ACTIVE;
  }

  private async replaceGoalMetricBindings(goalId: string, rawBindings: unknown[]) {
    await this.prisma.client.hrGoalMetricBinding.updateMany({
      where: {
        goalId,
        status: GenericStatus.ACTIVE
      },
      data: {
        status: GenericStatus.ARCHIVED
      }
    });

    const bindings = rawBindings
      .map((row) => {
        const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
        const sourceSystem = this.toNullableString(item.sourceSystem);
        const metricKey = this.toNullableString(item.metricKey);
        if (!sourceSystem || !metricKey) {
          return null;
        }
        return {
          tenant_Id: this.prisma.getTenantId(),
          goalId,
          sourceSystem: sourceSystem.toUpperCase(),
          metricKey: metricKey.toLowerCase(),
          configJson: this.toJson(item.configJson ?? item.config),
          weight: this.toFloat(item.weight) ?? 1,
          status: this.normalizeStatus(item.status, GenericStatus.ACTIVE)
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (bindings.length === 0) {
      return;
    }

    await this.prisma.client.hrGoalMetricBinding.createMany({
      data: bindings
    });
  }

  private async recordGoalTimeline(
    goalId: string,
    args: {
      eventType: string;
      actorId?: string | null;
      fromStatus?: GenericStatus | null;
      toStatus?: GenericStatus | null;
      progressPercent?: number | null;
      note?: string | null;
      payload?: Record<string, unknown> | null;
    }
  ) {
    await this.prisma.client.hrGoalTimeline.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        goalId,
        eventType: args.eventType,
        actorId: args.actorId ?? null,
        fromStatus: args.fromStatus ?? null,
        toStatus: args.toStatus ?? null,
        progressPercent: args.progressPercent ?? null,
        note: args.note ?? null,
        payload: this.toJson(args.payload ?? null)
      }
    });
  }

  private async enrichGoalsWithEmployeeMeta<T extends { employeeId: string }>(rows: T[]) {
    if (!rows.length) {
      return [] as Array<T & Record<string, unknown>>;
    }

    const employeeIds = Array.from(new Set(rows.map((goal) => goal.employeeId)));
    const employees = await this.prisma.client.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        code: true,
        fullName: true,
        department: true,
        departmentId: true,
        orgUnitId: true,
        position: true,
        status: true
      }
    });
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    return rows.map((goal) => ({
      ...goal,
      employeeCode: employeeById.get(goal.employeeId)?.code ?? null,
      employeeName: employeeById.get(goal.employeeId)?.fullName ?? null,
      employeeDepartment: employeeById.get(goal.employeeId)?.department ?? null,
      employeeDepartmentId: employeeById.get(goal.employeeId)?.departmentId ?? null,
      employeeOrgUnitId: employeeById.get(goal.employeeId)?.orgUnitId ?? null,
      employeePosition: employeeById.get(goal.employeeId)?.position ?? null,
      employeeStatus: employeeById.get(goal.employeeId)?.status ?? null
    }));
  }

  private groupGoalsByStatus<T extends { status: GenericStatus }>(items: T[]) {
    return {
      DRAFT: items.filter((item) => item.status === GenericStatus.DRAFT),
      PENDING: items.filter((item) => item.status === GenericStatus.PENDING),
      ACTIVE: items.filter((item) => item.status === GenericStatus.ACTIVE),
      APPROVED: items.filter((item) => item.status === GenericStatus.APPROVED),
      REJECTED: items.filter((item) => item.status === GenericStatus.REJECTED),
      ARCHIVED: items.filter((item) => item.status === GenericStatus.ARCHIVED)
    };
  }

  private async collectManagedEmployeeIds(managerId: string) {
    const allEmployees = await this.prisma.client.employee.findMany({
      where: {
        status: { not: GenericStatus.ARCHIVED }
      },
      select: { id: true, managerId: true }
    });
    const byManager = new Map<string, string[]>();
    for (const employee of allEmployees) {
      if (!employee.managerId) continue;
      if (!byManager.has(employee.managerId)) {
        byManager.set(employee.managerId, []);
      }
      byManager.get(employee.managerId)!.push(employee.id);
    }

    const result = new Set<string>();
    const queue = [...(byManager.get(managerId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (result.has(current)) continue;
      result.add(current);
      for (const child of byManager.get(current) ?? []) {
        queue.push(child);
      }
    }
    return Array.from(result);
  }

  private async resolveGoalAccessContext(filters: GoalTrackerFilters): Promise<GoalAccessContext> {
    const actor = this.resolveGoalActor();
    const requestedEmployeeId = this.toNullableString(filters.employeeId) ?? null;
    const requestedDepartmentId = this.toNullableString(filters.departmentId) ?? null;
    const requestedOrgUnitId = this.toNullableString(filters.orgUnitId) ?? null;

    if (!actor.authEnabled) {
      return {
        scope: this.normalizeGoalScope(filters.scope, 'company'),
        role: 'ANONYMOUS',
        authEnabled: false,
        requesterEmployeeId: null,
        allowedEmployeeIds: null,
        requesterDepartmentId: null,
        requesterDepartment: null,
        requestedEmployeeId,
        requestedDepartmentId,
        requestedOrgUnitId
      };
    }

    const role = actor.role === 'ANONYMOUS' ? UserRole.STAFF : actor.role;
    let scope = this.normalizeGoalScope(filters.scope, role === UserRole.ADMIN ? 'company' : 'self');
    if (role === UserRole.STAFF) {
      scope = 'self';
    }
    if (role === UserRole.MANAGER && scope === 'company') {
      scope = 'department';
    }

    if (role === UserRole.ADMIN) {
      return {
        scope,
        role,
        authEnabled: true,
        requesterEmployeeId: actor.employeeId,
        allowedEmployeeIds: null,
        requesterDepartmentId: null,
        requesterDepartment: null,
        requestedEmployeeId,
        requestedDepartmentId,
        requestedOrgUnitId
      };
    }

    if (!actor.employeeId) {
      throw new ForbiddenException('Tài khoản chưa liên kết employeeId để truy cập mục tiêu.');
    }

    const requesterEmployee = await this.prisma.client.employee.findFirst({
      where: { id: actor.employeeId },
      select: { id: true, departmentId: true, department: true, orgUnitId: true }
    });
    if (!requesterEmployee) {
      throw new ForbiddenException('Không tìm thấy hồ sơ nhân viên của tài khoản hiện tại.');
    }

    let allowedEmployeeIds: string[] = [requesterEmployee.id];
    if (scope === 'team') {
      const managed = await this.collectManagedEmployeeIds(requesterEmployee.id);
      allowedEmployeeIds = Array.from(new Set([requesterEmployee.id, ...managed]));
    } else if (scope === 'department') {
      const targetDepartmentId = requestedDepartmentId ?? requesterEmployee.departmentId ?? null;
      const targetDepartmentName = requesterEmployee.department;
      if (requestedDepartmentId && requesterEmployee.departmentId && requestedDepartmentId !== requesterEmployee.departmentId) {
        throw new ForbiddenException('Manager chỉ được xem mục tiêu trong phòng ban phụ trách.');
      }

      const departmentEmployees = await this.prisma.client.employee.findMany({
        where: {
          OR: [
            ...(targetDepartmentId ? [{ departmentId: targetDepartmentId }] : []),
            ...(targetDepartmentName ? [{ department: targetDepartmentName }] : [])
          ]
        },
        select: { id: true }
      });
      allowedEmployeeIds = departmentEmployees.map((employee) => employee.id);
    }

    if (requestedEmployeeId && !allowedEmployeeIds.includes(requestedEmployeeId)) {
      throw new ForbiddenException('Không có quyền truy cập mục tiêu của nhân viên này.');
    }

    return {
      scope,
      role,
      authEnabled: true,
      requesterEmployeeId: requesterEmployee.id,
      allowedEmployeeIds,
      requesterDepartmentId: requesterEmployee.departmentId ?? null,
      requesterDepartment: requesterEmployee.department ?? null,
      requestedEmployeeId,
      requestedDepartmentId,
      requestedOrgUnitId
    };
  }

  private async buildGoalWhereInput(
    keywordRaw: string | undefined,
    filters: GoalTrackerFilters,
    access: GoalAccessContext
  ): Promise<Prisma.HrGoalWhereInput> {
    const clauses: Prisma.HrGoalWhereInput[] = [];
    const keyword = String(keywordRaw ?? '').trim();
    const requestedEmployeeId = access.requestedEmployeeId ?? this.toNullableString(filters.employeeId);
    const requestedDepartmentId = access.requestedDepartmentId ?? this.toNullableString(filters.departmentId);
    const requestedOrgUnitId = access.requestedOrgUnitId ?? this.toNullableString(filters.orgUnitId);

    if (access.allowedEmployeeIds !== null) {
      if (access.allowedEmployeeIds.length === 0) {
        return { id: '__NO_GOAL__' };
      }
      clauses.push({
        employeeId: { in: access.allowedEmployeeIds }
      });
    }

    if (requestedEmployeeId) {
      clauses.push({ employeeId: requestedEmployeeId });
    }
    if (filters.period) {
      clauses.push({ period: filters.period });
    }
    if (filters.status) {
      clauses.push({ status: filters.status });
    }

    const trackingMode = this.normalizeGoalTrackingMode(filters.trackingMode);
    if (trackingMode) {
      clauses.push({ trackingMode });
    }

    if (requestedDepartmentId || requestedOrgUnitId) {
      const employeeRows = await this.prisma.client.employee.findMany({
        where: {
          ...(requestedDepartmentId ? { departmentId: requestedDepartmentId } : {}),
          ...(requestedOrgUnitId ? { orgUnitId: requestedOrgUnitId } : {})
        },
        select: { id: true }
      });
      const employeeIds = employeeRows.map((row) => row.id);
      if (!employeeIds.length) {
        return { id: '__NO_GOAL__' };
      }
      clauses.push({ employeeId: { in: employeeIds } });
    }

    if (keyword) {
      clauses.push({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { goalCode: { contains: keyword, mode: 'insensitive' } }
        ]
      });
    }

    return clauses.length > 0 ? { AND: clauses } : {};
  }

  private async syncPendingGoalApprovals() {
    const pendingGoals = await this.prisma.client.hrGoal.findMany({
      where: {
        status: GenericStatus.PENDING,
        workflowInstanceId: { not: null }
      },
      select: {
        id: true,
        status: true,
        workflowInstanceId: true,
        approvedAt: true,
        rejectedAt: true,
        progressPercent: true
      }
    });
    if (!pendingGoals.length) {
      return;
    }

    const instanceIds = pendingGoals
      .map((goal) => goal.workflowInstanceId)
      .filter((id): id is string => Boolean(id));
    if (!instanceIds.length) {
      return;
    }

    const instances = await this.prisma.client.workflowInstance.findMany({
      where: {
        id: { in: instanceIds }
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        completedAt: true
      }
    });
    const instanceById = new Map(instances.map((item) => [item.id, item]));

    for (const goal of pendingGoals) {
      const workflow = instanceById.get(String(goal.workflowInstanceId));
      if (!workflow) continue;

      if (workflow.status === GenericStatus.APPROVED) {
        await this.prisma.client.hrGoal.updateMany({
          where: { id: goal.id },
          data: {
            status: GenericStatus.ACTIVE,
            approvedAt: goal.approvedAt ?? workflow.completedAt ?? workflow.updatedAt,
            rejectedAt: null
          }
        });
        await this.recordGoalTimeline(goal.id, {
          eventType: 'APPROVED',
          actorId: 'workflow',
          fromStatus: GenericStatus.PENDING,
          toStatus: GenericStatus.ACTIVE,
          progressPercent: goal.progressPercent ?? 0,
          payload: { workflowInstanceId: workflow.id }
        });
      } else if (
        workflow.status === GenericStatus.REJECTED ||
        workflow.status === GenericStatus.ARCHIVED ||
        workflow.status === GenericStatus.INACTIVE
      ) {
        await this.prisma.client.hrGoal.updateMany({
          where: { id: goal.id },
          data: {
            status: GenericStatus.REJECTED,
            rejectedAt: goal.rejectedAt ?? workflow.completedAt ?? workflow.updatedAt
          }
        });
        await this.recordGoalTimeline(goal.id, {
          eventType: 'REJECTED',
          actorId: 'workflow',
          fromStatus: GenericStatus.PENDING,
          toStatus: GenericStatus.REJECTED,
          progressPercent: goal.progressPercent ?? 0,
          payload: { workflowInstanceId: workflow.id }
        });
      }
    }
  }

  private async recomputeStaleGoalAutos(params: {
    filters?: GoalTrackerFilters;
    access?: GoalAccessContext;
    force: boolean;
  }) {
    const access = params.access ?? (await this.resolveGoalAccessContext(params.filters ?? { scope: 'company' }));
    const baseWhere = await this.buildGoalWhereInput('', params.filters ?? {}, access);
    const staleBefore = new Date(Date.now() - GOAL_AUTO_STALE_MS);
    const where: Prisma.HrGoalWhereInput = {
      AND: [
        baseWhere,
        {
          trackingMode: {
            in: [HrGoalTrackingMode.AUTO, HrGoalTrackingMode.HYBRID]
          }
        },
        {
          status: {
            in: [GenericStatus.DRAFT, GenericStatus.ACTIVE, GenericStatus.APPROVED]
          }
        },
        ...(params.force
          ? []
          : [
              {
                OR: [{ lastAutoSyncedAt: null }, { lastAutoSyncedAt: { lt: staleBefore } }]
              }
            ])
      ]
    };

    const goals = await this.prisma.client.hrGoal.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 500
    });
    if (!goals.length) {
      return { total: 0, updated: 0, skipped: 0, goalIds: [] as string[] };
    }

    const actor = this.resolveGoalActor();
    let updated = 0;
    let skipped = 0;
    const goalIds: string[] = [];
    for (const goal of goals) {
      const result = await this.recomputeOneGoalAuto(goal, {
        force: params.force,
        actorId: actor.actorId
      });
      goalIds.push(goal.id);
      if (result.updated) {
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      total: goals.length,
      updated,
      skipped,
      goalIds
    };
  }

  private async recomputeOneGoalAuto(
    goal: {
      id: string;
      employeeId: string;
      title: string;
      status: GenericStatus;
      targetValue: Prisma.Decimal | null;
      currentValue: Prisma.Decimal | null;
      autoCurrentValue: Prisma.Decimal | null;
      manualAdjustmentValue: Prisma.Decimal | null;
      progressPercent: number | null;
      trackingMode: HrGoalTrackingMode;
      startDate: Date | null;
      endDate: Date | null;
      lastAutoSyncedAt: Date | null;
      approvedAt: Date | null;
      rejectedAt: Date | null;
      completedAt: Date | null;
    },
    options: { force: boolean; actorId: string }
  ) {
    if (goal.trackingMode === HrGoalTrackingMode.MANUAL) {
      return { updated: false, reason: 'MANUAL_MODE' };
    }
    if (!goal.startDate || !goal.endDate) {
      return { updated: false, reason: 'MISSING_RANGE' };
    }
    if (!options.force && goal.lastAutoSyncedAt && Date.now() - goal.lastAutoSyncedAt.getTime() < GOAL_AUTO_STALE_MS) {
      return { updated: false, reason: 'FRESH' };
    }

    const bindings = await this.prisma.client.hrGoalMetricBinding.findMany({
      where: {
        goalId: goal.id,
        status: GenericStatus.ACTIVE
      },
      orderBy: { createdAt: 'asc' }
    });

    let autoCurrentValue = 0;
    const now = new Date();
    for (const binding of bindings) {
      const computed = await this.computeGoalMetricValue(goal, binding);
      const weight = this.toNumber(binding.weight) ?? 1;
      autoCurrentValue += computed * weight;
      await this.prisma.client.hrGoalMetricBinding.updateMany({
        where: { id: binding.id },
        data: {
          lastComputedValue: new Prisma.Decimal(computed.toFixed(2)),
          lastComputedAt: now
        }
      });
    }

    const manualAdjustmentValue = this.toNumber(goal.manualAdjustmentValue) ?? 0;
    const effectiveCurrent = autoCurrentValue + manualAdjustmentValue;
    const progress = this.resolveGoalProgress(
      {
        targetValue: this.toNumber(goal.targetValue),
        currentValue: effectiveCurrent
      },
      goal
    );
    const nextStatus = this.resolveGoalLifecycleStatus(goal.status, progress.progressPercent ?? 0);

    const previousCurrent = this.toNumber(goal.currentValue) ?? 0;
    const previousAuto = this.toNumber(goal.autoCurrentValue) ?? 0;
    const previousProgress = this.toNumber(goal.progressPercent) ?? 0;
    const shouldUpdate =
      previousCurrent !== effectiveCurrent ||
      previousAuto !== autoCurrentValue ||
      previousProgress !== (progress.progressPercent ?? 0) ||
      goal.status !== nextStatus ||
      !goal.lastAutoSyncedAt;

    if (!shouldUpdate) {
      return { updated: false, reason: 'NO_CHANGE' };
    }

    await this.prisma.client.hrGoal.updateMany({
      where: { id: goal.id },
      data: {
        autoCurrentValue: new Prisma.Decimal(autoCurrentValue.toFixed(2)),
        currentValue: new Prisma.Decimal(effectiveCurrent.toFixed(2)),
        progressPercent: progress.progressPercent,
        status: nextStatus,
        approvedAt: nextStatus === GenericStatus.APPROVED ? (goal.approvedAt ?? now) : null,
        rejectedAt: nextStatus === GenericStatus.REJECTED ? (goal.rejectedAt ?? now) : null,
        completedAt: progress.completedAt,
        lastAutoSyncedAt: now
      }
    });

    await this.recordGoalTimeline(goal.id, {
      eventType: 'AUTO_SYNCED',
      actorId: options.actorId,
      fromStatus: goal.status,
      toStatus: nextStatus,
      progressPercent: progress.progressPercent ?? 0,
      payload: {
        autoCurrentValue,
        manualAdjustmentValue,
        effectiveCurrent,
        bindings: bindings.map((item) => ({
          id: item.id,
          sourceSystem: item.sourceSystem,
          metricKey: item.metricKey,
          weight: item.weight
        }))
      }
    });

    return { updated: true, reason: 'UPDATED' };
  }

  private async computeGoalMetricValue(
    goal: {
      employeeId: string;
      startDate: Date | null;
      endDate: Date | null;
    },
    binding: {
      sourceSystem: string;
      metricKey: string;
      configJson: Prisma.JsonValue | null;
    }
  ) {
    if (!goal.startDate || !goal.endDate) {
      return 0;
    }

    const source = String(binding.sourceSystem).trim().toUpperCase();
    const metricKey = String(binding.metricKey).trim().toLowerCase();
    const config = this.toJsonObject(binding.configJson);
    const employeeId = this.toNullableString(config.employeeId) ?? goal.employeeId;
    const startDate = goal.startDate;
    const endDate = goal.endDate;

    if (source === 'HR_ATTENDANCE') {
      if (metricKey === 'on_time_days') {
        return this.prisma.client.attendance.count({
          where: {
            employeeId,
            workDate: { gte: startDate, lte: endDate },
            checkInAt: { not: null },
            lateMinutes: { lte: 0 }
          }
        });
      }
      if (metricKey === 'attendance_days') {
        return this.prisma.client.attendance.count({
          where: {
            employeeId,
            workDate: { gte: startDate, lte: endDate },
            checkInAt: { not: null }
          }
        });
      }
      if (metricKey === 'overtime_minutes') {
        const aggregate = await this.prisma.client.attendance.aggregate({
          where: {
            employeeId,
            workDate: { gte: startDate, lte: endDate }
          },
          _sum: { overtimeMinutes: true }
        });
        return Number(aggregate._sum.overtimeMinutes ?? 0);
      }
      return 0;
    }

    if (source === 'HR_RECRUITMENT') {
      const recruiterId = this.toNullableString(config.recruiterId) ?? employeeId;
      const department = this.toNullableString(config.department) ?? null;
      if (metricKey === 'hired_count') {
        return this.prisma.client.recruitmentApplication.count({
          where: {
            status: RecruitmentApplicationStatus.HIRED,
            hiredAt: { gte: startDate, lte: endDate },
            ...(recruiterId
              ? {
                  OR: [{ recruiterId }, { requisition: { is: { recruiterId } } }]
                }
              : {}),
            ...(department ? { requisition: { is: { department } } } : {})
          }
        });
      }
      if (metricKey === 'offer_approved_count') {
        return this.prisma.client.recruitmentApplication.count({
          where: {
            ...(recruiterId
              ? {
                  OR: [{ recruiterId }, { requisition: { is: { recruiterId } } }]
                }
              : {}),
            ...(department ? { requisition: { is: { department } } } : {}),
            offers: {
              some: {
                status: { in: [RecruitmentOfferStatus.APPROVED, RecruitmentOfferStatus.ACCEPTED] },
                approvedAt: { gte: startDate, lte: endDate }
              }
            }
          }
        });
      }
      return 0;
    }

    if (source === 'HR_PERFORMANCE') {
      if (metricKey === 'avg_score') {
        const aggregate = await this.prisma.client.performance.aggregate({
          where: {
            employeeId,
            createdAt: { gte: startDate, lte: endDate }
          },
          _avg: { score: true }
        });
        return Number(aggregate._avg.score ?? 0);
      }
      return 0;
    }

    if (source === 'SALES') {
      if (metricKey === 'order_count') {
        return this.prisma.client.order.count({
          where: {
            employeeId,
            createdAt: { gte: startDate, lte: endDate }
          }
        });
      }
      if (metricKey === 'order_amount_sum') {
        const aggregate = await this.prisma.client.order.aggregate({
          where: {
            employeeId,
            createdAt: { gte: startDate, lte: endDate }
          },
          _sum: { totalAmount: true }
        });
        return this.toNumber(aggregate._sum.totalAmount) ?? 0;
      }
      return 0;
    }

    return 0;
  }

  private async resolveGoalWorkflowDefinition(definitionId: string | null) {
    if (definitionId) {
      const byId = await this.prisma.client.workflowDefinition.findFirst({
        where: {
          id: definitionId,
          module: 'hr',
          status: GenericStatus.ACTIVE
        }
      });
      if (byId) {
        return byId;
      }
      throw new BadRequestException('Workflow definition không tồn tại hoặc không active.');
    }

    const fallback = await this.prisma.client.workflowDefinition.findFirst({
      where: {
        module: 'hr',
        status: GenericStatus.ACTIVE,
        OR: [
          { code: { contains: 'GOAL', mode: 'insensitive' } },
          { code: { contains: 'KPI', mode: 'insensitive' } },
          { name: { contains: 'goal', mode: 'insensitive' } },
          { name: { contains: 'kpi', mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    if (fallback) {
      return fallback;
    }

    throw new BadRequestException('Không tìm thấy workflow definition cho Goal approval (module hr).');
  }

  private toJsonObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private toBool(value: unknown, fallback: boolean) {
    try {
      const parsed = this.toBoolean(value, fallback);
      return typeof parsed === 'boolean' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  private buildRecruitmentApplicationWhere(
    query: PaginationQueryDto,
    filters: RecruitmentPipelineFilters,
    defaultActiveOnly: boolean
  ): Prisma.RecruitmentApplicationWhereInput {
    const clauses: Prisma.RecruitmentApplicationWhereInput[] = [];
    const status = this.normalizeRecruitmentApplicationStatus(filters.status);
    if (status) {
      clauses.push({ status });
    } else if (defaultActiveOnly) {
      clauses.push({ status: RecruitmentApplicationStatus.ACTIVE });
    }

    const stage = this.normalizeRecruitmentStage(filters.stage);
    if (stage) {
      clauses.push({ currentStage: stage });
    }

    const requisitionId = this.toNullableString(filters.requisitionId);
    if (requisitionId) {
      clauses.push({ requisitionId });
    }

    const recruiterId = this.toNullableString(filters.recruiterId);
    if (recruiterId) {
      clauses.push({
        OR: [{ recruiterId }, { requisition: { is: { recruiterId } } }]
      });
    }

    const source = this.normalizeRecruitmentSource(filters.source);
    if (source) {
      clauses.push({
        candidate: {
          is: {
            source
          }
        }
      });
    }

    const keyword = query.q?.trim();
    if (keyword) {
      clauses.push({
        OR: [
          { candidate: { is: { fullName: { contains: keyword, mode: 'insensitive' } } } },
          { candidate: { is: { email: { contains: keyword, mode: 'insensitive' } } } },
          { candidate: { is: { phone: { contains: keyword } } } },
          { requisition: { is: { title: { contains: keyword, mode: 'insensitive' } } } },
          { requisition: { is: { code: { contains: keyword, mode: 'insensitive' } } } }
        ]
      });
    }

    return clauses.length > 0 ? { AND: clauses } : {};
  }

  private async resolveRecruitmentRequisition(payload: HrPayload) {
    const requisitionId = this.toNullableString(payload.requisitionId);
    if (requisitionId) {
      return this.ensureRecruitmentRequisitionExists(requisitionId);
    }

    const requisitionCode = this.toNullableString(payload.requisitionCode);
    if (requisitionCode) {
      const byCode = await this.prisma.client.recruitmentRequisition.findFirst({
        where: { code: requisitionCode }
      });
      if (byCode) {
        return byCode;
      }
    }

    const title = this.toNullableString(payload.jobTitle ?? payload.requisitionTitle);
    if (!title) {
      throw new BadRequestException('Thiếu requisitionId hoặc jobTitle/requisitionTitle.');
    }

    const recruiterId = this.toNullableString(payload.recruiterId);
    const existing = await this.prisma.client.recruitmentRequisition.findFirst({
      where: {
        title,
        recruiterId: recruiterId ?? undefined,
        status: GenericStatus.ACTIVE
      },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) {
      return existing;
    }

    return this.prisma.client.recruitmentRequisition.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: requisitionCode,
        title,
        department: this.toNullableString(payload.department),
        positionId: this.toNullableString(payload.positionId),
        recruiterId,
        hiringManagerId: this.toNullableString(payload.hiringManagerId),
        openings: this.toInt(payload.openings, 1) ?? 1,
        description: this.toNullableString(payload.requisitionDescription),
        status: GenericStatus.ACTIVE
      }
    });
  }

  private async resolveRecruitmentCandidate(payload: HrPayload) {
    const candidateId = this.toNullableString(payload.candidateId);
    if (candidateId) {
      return this.ensureRecruitmentCandidateExists(candidateId);
    }

    const fullName = this.toNullableString(payload.candidateName ?? payload.fullName);
    if (!fullName) {
      throw new BadRequestException('Thiếu candidateId hoặc tên ứng viên.');
    }

    const email = this.toNullableString(payload.email);
    const phone = this.toNullableString(payload.phone);
    if (email || phone) {
      const dedup = await this.prisma.client.recruitmentCandidate.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : [])
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      if (dedup) {
        await this.prisma.client.recruitmentCandidate.updateMany({
          where: { id: dedup.id },
          data: {
            fullName,
            email: email ?? dedup.email,
            phone: phone ?? dedup.phone,
            source: this.normalizeRecruitmentSource(payload.source, dedup.source),
            cvExternalUrl: this.toNullableString(payload.cvExternalUrl) ?? dedup.cvExternalUrl,
            currentCompany: this.toNullableString(payload.currentCompany) ?? dedup.currentCompany,
            yearsExperience: this.toFloat(payload.yearsExperience),
            note: this.toNullableString(payload.note) ?? dedup.note
          }
        });
        return this.ensureRecruitmentCandidateExists(dedup.id);
      }
    }

    return this.prisma.client.recruitmentCandidate.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        fullName,
        email,
        phone,
        source: this.normalizeRecruitmentSource(payload.source, RecruitmentSource.OTHER),
        cvExternalUrl: this.toNullableString(payload.cvExternalUrl),
        currentCompany: this.toNullableString(payload.currentCompany),
        yearsExperience: this.toFloat(payload.yearsExperience),
        note: this.toNullableString(payload.note),
        status: GenericStatus.ACTIVE
      }
    });
  }

  private async assertRecruitmentStageTransition(
    application: {
      id: string;
      currentStage: RecruitmentStage;
      status: RecruitmentApplicationStatus;
    },
    targetStage: RecruitmentStage
  ) {
    if (application.status !== RecruitmentApplicationStatus.ACTIVE) {
      throw new BadRequestException('Chỉ hồ sơ ACTIVE mới được di chuyển stage.');
    }
    if (application.currentStage === targetStage) {
      throw new BadRequestException('Hồ sơ đã ở stage này.');
    }

    const fromIndex = this.getRecruitmentStageIndex(application.currentStage);
    const toIndex = this.getRecruitmentStageIndex(targetStage);
    if (toIndex <= fromIndex) {
      throw new BadRequestException('Chỉ hỗ trợ di chuyển stage theo chiều tiến.');
    }
    if (toIndex !== fromIndex + 1) {
      throw new BadRequestException('Không thể nhảy qua stage trung gian.');
    }

    if (targetStage === RecruitmentStage.HIRED) {
      await this.ensureAcceptedOfferForApplication(application.id);
    }
  }

  private async ensureAcceptedOfferForApplication(applicationId: string) {
    const offer = await this.prisma.client.recruitmentOffer.findFirst({
      where: {
        applicationId,
        status: RecruitmentOfferStatus.ACCEPTED
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!offer || !offer.approvedAt) {
      throw new BadRequestException('Chưa có offer APPROVED + ACCEPTED cho hồ sơ này.');
    }

    return offer;
  }

  private async syncPendingRecruitmentOfferApprovals(applicationId?: string) {
    const pendingOffers = await this.prisma.client.recruitmentOffer.findMany({
      where: {
        status: RecruitmentOfferStatus.PENDING_APPROVAL,
        workflowInstanceId: { not: null },
        ...(applicationId ? { applicationId } : {})
      },
      select: {
        id: true,
        workflowInstanceId: true,
        status: true,
        approvedAt: true,
        rejectedAt: true
      }
    });

    if (!pendingOffers.length) {
      return;
    }

    const instanceIds = pendingOffers
      .map((offer) => offer.workflowInstanceId)
      .filter((value): value is string => Boolean(value));
    if (!instanceIds.length) {
      return;
    }

    const instances = await this.prisma.client.workflowInstance.findMany({
      where: { id: { in: instanceIds } },
      select: { id: true, status: true, completedAt: true, updatedAt: true }
    });
    const instanceById = new Map(instances.map((instance) => [instance.id, instance]));

    for (const offer of pendingOffers) {
      const workflow = instanceById.get(String(offer.workflowInstanceId));
      if (!workflow) {
        continue;
      }
      if (workflow.status === GenericStatus.APPROVED) {
        await this.prisma.client.recruitmentOffer.updateMany({
          where: { id: offer.id },
          data: {
            status: RecruitmentOfferStatus.APPROVED,
            approvedAt: offer.approvedAt ?? workflow.completedAt ?? workflow.updatedAt
          }
        });
      } else if (
        workflow.status === GenericStatus.REJECTED ||
        workflow.status === GenericStatus.ARCHIVED ||
        workflow.status === GenericStatus.INACTIVE
      ) {
        await this.prisma.client.recruitmentOffer.updateMany({
          where: { id: offer.id },
          data: {
            status: RecruitmentOfferStatus.REJECTED,
            rejectedAt: offer.rejectedAt ?? workflow.completedAt ?? workflow.updatedAt
          }
        });
      }
    }
  }

  private resolveRecruitmentOfferStatusTimestamps(
    status: RecruitmentOfferStatus,
    now: Date,
    existing: {
      offeredAt: Date | null;
      approvedAt: Date | null;
      rejectedAt: Date | null;
      acceptedAt: Date | null;
      declinedAt: Date | null;
    } | null
  ) {
    return {
      offeredAt:
        status !== RecruitmentOfferStatus.DRAFT
          ? (existing?.offeredAt ?? now)
          : existing?.offeredAt ?? null,
      approvedAt:
        status === RecruitmentOfferStatus.APPROVED || status === RecruitmentOfferStatus.ACCEPTED
          ? (existing?.approvedAt ?? now)
          : existing?.approvedAt ?? null,
      rejectedAt:
        status === RecruitmentOfferStatus.REJECTED
          ? (existing?.rejectedAt ?? now)
          : existing?.rejectedAt ?? null,
      acceptedAt:
        status === RecruitmentOfferStatus.ACCEPTED
          ? (existing?.acceptedAt ?? now)
          : existing?.acceptedAt ?? null,
      declinedAt:
        status === RecruitmentOfferStatus.DECLINED
          ? (existing?.declinedAt ?? now)
          : existing?.declinedAt ?? null
    };
  }

  private async resolveRecruitmentOfferWorkflowDefinition(definitionId: string | null) {
    if (definitionId) {
      const byId = await this.prisma.client.workflowDefinition.findFirst({
        where: {
          id: definitionId,
          module: 'hr',
          status: GenericStatus.ACTIVE
        }
      });
      if (byId) {
        return byId;
      }
      throw new BadRequestException('Workflow definition không tồn tại hoặc không active.');
    }

    const fallback = await this.prisma.client.workflowDefinition.findFirst({
      where: {
        module: 'hr',
        status: GenericStatus.ACTIVE,
        OR: [
          { code: { contains: 'OFFER', mode: 'insensitive' } },
          { code: { contains: 'RECRUIT', mode: 'insensitive' } },
          { name: { contains: 'offer', mode: 'insensitive' } },
          { name: { contains: 'recruit', mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    if (fallback) {
      return fallback;
    }

    throw new BadRequestException('Không tìm thấy workflow definition cho Offer approval (module hr).');
  }

  private async touchRecruitmentApplication(applicationId: string, at: Date = new Date()) {
    await this.prisma.client.recruitmentApplication.updateMany({
      where: { id: applicationId },
      data: {
        lastActivityAt: at
      }
    });
  }

  private calcDurationDays(from: Date, to: Date) {
    const diff = to.getTime() - from.getTime();
    if (diff <= 0) {
      return 0;
    }
    return Number((diff / (24 * 60 * 60 * 1000)).toFixed(2));
  }

  private getRecruitmentStageIndex(stage: RecruitmentStage) {
    return RECRUITMENT_STAGE_FLOW.indexOf(stage);
  }

  private normalizeRecruitmentStage(value: unknown, fallback?: RecruitmentStage) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(RecruitmentStage) as string[]).includes(normalized)) {
      return normalized as RecruitmentStage;
    }
    return fallback;
  }

  private normalizeRecruitmentApplicationStatus(value: unknown, fallback?: RecruitmentApplicationStatus) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(RecruitmentApplicationStatus) as string[]).includes(normalized)) {
      return normalized as RecruitmentApplicationStatus;
    }
    return fallback;
  }

  private normalizeRecruitmentSource(value: unknown, fallback: RecruitmentSource = RecruitmentSource.OTHER) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(RecruitmentSource) as string[]).includes(normalized)) {
      return normalized as RecruitmentSource;
    }
    return fallback;
  }

  private normalizeRecruitmentInterviewStatus(
    value: unknown,
    fallback: RecruitmentInterviewStatus = RecruitmentInterviewStatus.SCHEDULED
  ) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(RecruitmentInterviewStatus) as string[]).includes(normalized)) {
      return normalized as RecruitmentInterviewStatus;
    }
    return fallback;
  }

  private normalizeRecruitmentOfferStatus(value: unknown, fallback: RecruitmentOfferStatus = RecruitmentOfferStatus.DRAFT) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if ((Object.values(RecruitmentOfferStatus) as string[]).includes(normalized)) {
      return normalized as RecruitmentOfferStatus;
    }
    return fallback;
  }

  private async ensureEmployeeExists(id: string) {
    const employee = await this.prisma.client.employee.findFirst({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }
    return employee;
  }

  private async ensureDepartmentExists(id: string) {
    const row = await this.prisma.client.department.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy phòng ban.');
    }
    return row;
  }

  private async ensurePositionExists(id: string) {
    const row = await this.prisma.client.position.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy chức danh.');
    }
    return row;
  }

  private async ensureWorkShiftExists(id: string) {
    const row = await this.prisma.client.workShift.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy ca làm việc.');
    }
    return row;
  }

  private async ensureLeavePolicyExists(id: string) {
    const row = await this.prisma.client.leavePolicy.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy chính sách nghỉ phép.');
    }
    return row;
  }

  private async ensureEmployeeContractExists(id: string) {
    const row = await this.prisma.client.employeeContract.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hợp đồng lao động.');
    }
    return row;
  }

  private async ensurePayrollComponentExists(id: string) {
    const row = await this.prisma.client.payrollComponent.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy thành phần lương.');
    }
    return row;
  }

  private async ensureRecruitmentExists(id: string) {
    const row = await this.prisma.client.recruitment.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ tuyển dụng.');
    }
    return row;
  }

  private async ensureRecruitmentRequisitionExists(id: string) {
    const row = await this.prisma.client.recruitmentRequisition.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy vị trí tuyển dụng.');
    }
    return row;
  }

  private async ensureRecruitmentCandidateExists(id: string) {
    const row = await this.prisma.client.recruitmentCandidate.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy ứng viên.');
    }
    return row;
  }

  private async ensureRecruitmentApplicationExists(id: string) {
    const row = await this.prisma.client.recruitmentApplication.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ ứng tuyển.');
    }
    return row;
  }

  private async ensureRecruitmentInterviewExists(id: string) {
    const row = await this.prisma.client.recruitmentInterview.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy lịch phỏng vấn.');
    }
    return row;
  }

  private async ensureRecruitmentOfferExists(id: string) {
    const row = await this.prisma.client.recruitmentOffer.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy offer tuyển dụng.');
    }
    return row;
  }

  private async ensureTrainingExists(id: string) {
    const row = await this.prisma.client.training.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ đào tạo.');
    }
    return row;
  }

  private async ensurePerformanceExists(id: string) {
    const row = await this.prisma.client.performance.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ đánh giá.');
    }
    return row;
  }

  private async ensureBenefitExists(id: string) {
    const row = await this.prisma.client.benefit.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ phúc lợi.');
    }
    return row;
  }

  private async ensurePersonalIncomeTaxProfileExists(id: string) {
    const row = await this.prisma.client.personalIncomeTaxProfile.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy hồ sơ thuế TNCN.');
    }
    return row;
  }

  private async ensurePersonalIncomeTaxRecordExists(id: string) {
    const row = await this.prisma.client.personalIncomeTaxRecord.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy bản ghi thuế TNCN.');
    }
    return row;
  }

  private async ensureGoalExists(id: string) {
    const row = await this.prisma.client.hrGoal.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy mục tiêu.');
    }
    return row;
  }

  private validateTaxPeriod(month: number, year: number) {
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      throw new BadRequestException('Tháng tính thuế không hợp lệ (1-12).');
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Năm tính thuế không hợp lệ.');
    }
  }

  private async buildPersonalIncomeTaxDraft(params: {
    employeeId: string;
    taxMonth: number;
    taxYear: number;
    payrollId?: string | null;
    overrides?: HrPayload;
  }): Promise<PersonalIncomeTaxDraft> {
    const { employeeId, taxMonth, taxYear, payrollId } = params;
    const overrides = params.overrides ?? {};

    const profile = await this.prisma.client.personalIncomeTaxProfile.findFirst({
      where: { employeeId }
    });

    const payrollIdList: string[] = [];
    if (payrollId) {
      payrollIdList.push(payrollId);
    } else {
      const payrollRows = await this.prisma.client.payroll.findMany({
        where: { employeeId, payMonth: taxMonth, payYear: taxYear },
        select: { id: true }
      });
      for (const row of payrollRows) {
        payrollIdList.push(row.id);
      }
    }

    let grossTaxable = 0;
    if (payrollIdList.length > 0) {
      const taxableLines = await this.prisma.client.payrollLineItem.findMany({
        where: {
          employeeId,
          payrollId: { in: payrollIdList },
          componentType: PayrollComponentType.EARNING,
          isTaxable: true
        },
        select: { amount: true }
      });
      grossTaxable = taxableLines.reduce((acc, line) => acc + (this.toNumber(line.amount) ?? 0), 0);
    }

    const personalDeduction =
      this.toNumber(profile?.personalDeduction) ?? DEFAULT_PIT_PERSONAL_DEDUCTION;
    const dependentCount = profile?.dependentCount ?? 0;
    const dependentDeduction =
      this.toNumber(profile?.dependentDeduction) ?? DEFAULT_PIT_DEPENDENT_DEDUCTION;
    const insuranceDeduction = this.toNumber(profile?.insuranceDeduction) ?? 0;
    const otherDeduction = this.toNumber(profile?.otherDeduction) ?? 0;
    const profileDeduction =
      personalDeduction + dependentCount * dependentDeduction + insuranceDeduction + otherDeduction;

    const overrideGross = this.toNumber(overrides.grossTaxable);
    const overrideDeduction = this.toNumber(overrides.deduction);
    const overrideTaxRate = this.toNumber(overrides.taxRate);
    const overrideTaxableIncome = this.toNumber(overrides.taxableIncome);
    const overrideTaxAmount = this.toNumber(overrides.taxAmount);

    const gross = Math.max(0, overrideGross ?? grossTaxable);
    const deduction = Math.max(0, overrideDeduction ?? profileDeduction);
    const rate = Math.max(0, overrideTaxRate ?? this.toNumber(profile?.taxRate) ?? DEFAULT_PIT_TAX_RATE);
    const taxableIncome = Math.max(0, overrideTaxableIncome ?? gross - deduction);
    const taxAmount = Math.max(0, overrideTaxAmount ?? taxableIncome * rate);

    return {
      employeeId,
      payrollId: payrollIdList[0] ?? null,
      taxProfileId: profile?.id ?? null,
      taxMonth,
      taxYear,
      grossTaxable: gross,
      deduction,
      taxableIncome,
      taxRate: rate,
      taxAmount,
      note: this.toNullableString(overrides.note) ?? undefined
    };
  }

  private resolveGoalProgress(payload: HrPayload, existing?: {
    targetValue: Prisma.Decimal | null;
    currentValue: Prisma.Decimal | null;
    progressPercent: number | null;
  }) {
    const target = this.toNumber(payload.targetValue) ?? this.toNumber(existing?.targetValue);
    const current = this.toNumber(payload.currentValue) ?? this.toNumber(existing?.currentValue);
    const explicitProgress = this.toNumber(payload.progressPercent) ?? existing?.progressPercent ?? 0;

    let progressPercent = this.clampNumber(explicitProgress, 0, 100);
    if (target !== null && target > 0 && current !== null) {
      progressPercent = this.clampNumber((current / target) * 100, 0, 100);
    }

    const autoStatus =
      progressPercent >= 100
        ? GenericStatus.APPROVED
        : progressPercent > 0
          ? GenericStatus.ACTIVE
          : GenericStatus.PENDING;
    const completedAt = progressPercent >= 100 ? new Date() : null;

    return { progressPercent, autoStatus, completedAt };
  }

  private clampNumber(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  private async getLeaveBalanceSummary(
    employeeId: string,
    leaveType: string,
    year: number,
    leavePolicyId?: string
  ): Promise<{ quotaDays: number; usedDays: number; remainingDays: number }> {
    const periodStart = new Date(year, 0, 1);
    const periodEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const [policy, approvedLeaves] = await Promise.all([
      leavePolicyId
        ? this.prisma.client.leavePolicy.findFirst({ where: { id: leavePolicyId } })
        : this.prisma.client.leavePolicy.findFirst({
            where: {
              leaveType,
              status: GenericStatus.ACTIVE
            },
            orderBy: { createdAt: 'desc' }
          }),
      this.prisma.client.leaveRequest.findMany({
        where: {
          employeeId,
          status: GenericStatus.APPROVED,
          leaveType,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
          ...(leavePolicyId ? { leavePolicyId } : {})
        }
      })
    ]);

    const quotaDays = this.toNumber(policy?.annualQuotaDays) ?? 0;
    const usedDays = approvedLeaves.reduce((acc, leave) => {
      const days = this.toNumber(leave.durationDays) ?? this.calcLeaveDays(leave.startDate, leave.endDate);
      return acc + days;
    }, 0);

    return {
      quotaDays,
      usedDays,
      remainingDays: Math.max(0, quotaDays - usedDays)
    };
  }

  private calcLeaveOverlapDays(periodStart: Date, periodEnd: Date, leaveStart: Date, leaveEnd: Date) {
    const start = leaveStart > periodStart ? leaveStart : periodStart;
    const end = leaveEnd < periodEnd ? leaveEnd : periodEnd;
    if (end < start) return 0;
    return this.calcLeaveDays(start, end);
  }

  private calcLeaveDays(startDate: Date, endDate: Date) {
    const start = this.startOfDay(startDate);
    const end = this.startOfDay(endDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return Math.max(0, diff);
  }

  private normalizeStatus(value: unknown, fallback: GenericStatus = GenericStatus.ACTIVE) {
    const normalized = String(value ?? '').toUpperCase();
    if ((Object.values(GenericStatus) as string[]).includes(normalized)) {
      return normalized as GenericStatus;
    }
    return fallback;
  }

  private normalizeEmploymentType(value: unknown, fallback: EmploymentType = EmploymentType.FULL_TIME) {
    const normalized = String(value ?? '').toUpperCase();
    if ((Object.values(EmploymentType) as string[]).includes(normalized)) {
      return normalized as EmploymentType;
    }
    return fallback;
  }

  private normalizePayrollComponentType(
    value: unknown,
    fallback: PayrollComponentType = PayrollComponentType.EARNING
  ) {
    const normalized = String(value ?? '').toUpperCase();
    if ((Object.values(PayrollComponentType) as string[]).includes(normalized)) {
      return normalized as PayrollComponentType;
    }
    return fallback;
  }

  private normalizePayrollFormulaType(value: unknown, fallback: PayrollFormulaType = PayrollFormulaType.FIXED) {
    const normalized = String(value ?? '').toUpperCase();
    if ((Object.values(PayrollFormulaType) as string[]).includes(normalized)) {
      return normalized as PayrollFormulaType;
    }
    return fallback;
  }

  private toDate(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Ngày không hợp lệ: ${String(value)}`);
    }
    return date;
  }

  private toDecimal(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`Giá trị số không hợp lệ: ${String(value)}`);
    }
    return new Prisma.Decimal(num);
  }

  private toFloat(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`Giá trị số không hợp lệ: ${String(value)}`);
    }
    return num;
  }

  private toInt(value: unknown, fallback?: number) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return fallback;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`Giá trị số nguyên không hợp lệ: ${String(value)}`);
    }
    return Math.trunc(num);
  }

  private toBoolean(value: unknown, fallback?: boolean) {
    if (value === undefined) return fallback;
    if (value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    throw new BadRequestException(`Giá trị boolean không hợp lệ: ${String(value)}`);
  }

  private toNullableString(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
  }

  private toUpdateString(value: unknown) {
    if (value === undefined || value === null) return undefined;
    const str = String(value).trim();
    return str.length > 0 ? str : undefined;
  }

  private toNumber(value: unknown) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object' && value !== null && 'toString' in value) {
      const strValue = String(value);
      const num = Number(strValue);
      return Number.isFinite(num) ? num : null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return Prisma.JsonNull;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Prisma.InputJsonValue;
      } catch {
        return value as Prisma.InputJsonValue;
      }
    }
    return value as Prisma.InputJsonValue;
  }

  private normalizeTime(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return undefined;
    const str = String(value).trim();
    if (!/^\d{2}:\d{2}$/.test(str)) {
      throw new BadRequestException(`Định dạng thời gian không hợp lệ: ${str}. Dùng HH:mm.`);
    }
    const [hour, minute] = str.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new BadRequestException(`Định dạng thời gian không hợp lệ: ${str}.`);
    }
    return str;
  }

  private timeOnDate(date: Date, hhmm: string | null | undefined) {
    if (!hhmm) return null;
    const normalized = this.normalizeTime(hhmm);
    if (!normalized) return null;
    const [hour, minute] = normalized.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hour, minute, 0, 0);
    return result;
  }

  private startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private take(limit: number | undefined, max = 200) {
    return Math.min(Math.max(limit ?? 100, 1), max);
  }
}
