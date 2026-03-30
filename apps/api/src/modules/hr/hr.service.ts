import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EmploymentType,
  GenericStatus,
  PayrollComponentType,
  PayrollFormulaType,
  Prisma
} from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_MONTHLY_BASE_SALARY = 10_000_000;
const STANDARD_WORKING_DAYS_PER_MONTH = 22;

type HrPayload = Record<string, unknown>;

type PayrollLineDraft = {
  componentCode: string | null;
  componentName: string;
  componentType: PayrollComponentType;
  amount: number;
  isTaxable: boolean;
  note?: string;
};

@Injectable()
export class HrService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    const fullName = payload.fullName ?? payload.name;
    if (!fullName) {
      throw new BadRequestException('Thiếu tên nhân viên.');
    }

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
        workShiftId: this.toNullableString(payload.workShiftId),
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
    const workShiftId = this.toNullableString(payload.workShiftId) ?? employee.workShiftId ?? null;
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

    const leaveType = this.toNullableString(payload.leaveType ?? policy?.leaveType);
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
    const month = Number(payload.month);
    const year = Number(payload.year);
    const employeeId = this.toNullableString(payload.employeeId);

    if (!month || !year) {
      throw new BadRequestException('Thiếu tháng/năm tạo bảng lương.');
    }

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

  async payPayroll(id: string) {
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
