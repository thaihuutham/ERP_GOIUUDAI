import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { GenericStatus, IamScopeMode, PermissionAction, PermissionEffect, Prisma, UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { generateTemporaryPassword, hashPassword } from '../../common/auth/password.util';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveModuleKeyFromPath } from '../../common/auth/permission.util';
import { IamCeilingService } from '../iam/iam-ceiling.service';
import { IamShadowReportService } from '../iam/iam-shadow-report.service';

const ORG_TYPE_ORDER = ['COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM'] as const;

type OrgUnitType = (typeof ORG_TYPE_ORDER)[number];

@Injectable()
export class SettingsEnterpriseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Optional() @Inject(IamCeilingService) private readonly iamCeiling?: IamCeilingService,
    @Optional() @Inject(IamShadowReportService) private readonly iamShadowReport?: IamShadowReportService
  ) {}

  async listIamUsers(query: Record<string, unknown>) {
    const q = this.cleanString(query.q).toLowerCase();
    const take = this.toInt(query.limit, 50, 1, 200);

    const users = await this.prisma.client.user.findMany({
      where: q
        ? {
            OR: [
              {
                email: { contains: q, mode: 'insensitive' }
              },
              {
                employeeId: { contains: q, mode: 'insensitive' }
              }
            ]
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take
    });

    const employeeIds = users.map((item) => this.cleanString(item.employeeId)).filter(Boolean);
    const employees = employeeIds.length > 0
      ? await this.prisma.client.employee.findMany({
          where: { id: { in: employeeIds } }
        })
      : [];

    const orgUnitIds = employees.map((item) => this.cleanString(item.orgUnitId)).filter(Boolean);
    const orgUnits = orgUnitIds.length > 0
      ? await this.prisma.client.orgUnit.findMany({
          where: { id: { in: orgUnitIds } }
        })
      : [];
    const employeeMap = new Map(employees.map((item) => [item.id, item]));
    const orgUnitMap = new Map(orgUnits.map((item) => [item.id, item]));

    return {
      items: users.map((user) => {
        const employee = user.employeeId ? employeeMap.get(user.employeeId) : null;
        const orgUnit = employee?.orgUnitId ? orgUnitMap.get(employee.orgUnitId) : null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          employeeId: user.employeeId,
          employee: employee
            ? {
                id: employee.id,
                fullName: employee.fullName,
                code: employee.code,
                departmentId: employee.departmentId,
                positionId: employee.positionId,
                orgUnitId: employee.orgUnitId,
                orgUnitName: orgUnit?.name ?? null
              }
            : null,
          lastLoginAt: user.lastLoginAt,
          passwordChangedAt: user.passwordChangedAt,
          passwordResetAt: user.passwordResetAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
      }),
      total: users.length
    };
  }

  async createIamUser(payload: Record<string, unknown>) {
    const body = this.ensureRecord(payload);
    const email = this.cleanString(body.email).toLowerCase();
    if (!email) {
      throw new BadRequestException('Thiếu email tài khoản.');
    }
    const role = this.parseUserRole(body.role);
    const isActive = this.toBool(body.isActive, true);
    const actor = this.resolveActor();

    const existing = await this.prisma.client.user.findFirst({
      where: { email }
    });
    if (existing) {
      throw new BadRequestException('Email đã tồn tại trong hệ thống.');
    }

    const employeeIdInput = this.cleanString(body.employeeId);
    const orgUnitId = this.cleanString(body.orgUnitId);
    const positionId = this.cleanString(body.positionId);
    if (orgUnitId) {
      await this.ensureOrgUnitExists(orgUnitId);
    }
    if (positionId) {
      await this.ensurePositionExists(positionId);
    }

    const now = new Date();
    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);
    const tenantId = this.prisma.getTenantId();

    const result = await this.prisma.client.$transaction(async (tx) => {
      let employeeId = employeeIdInput;

      if (employeeId) {
        const employee = await tx.employee.findFirst({
          where: { id: employeeId }
        });
        if (!employee) {
          throw new BadRequestException('employeeId không tồn tại.');
        }
        await tx.employee.updateMany({
          where: { id: employeeId },
          data: {
            fullName: this.toUpdateString(body.fullName),
            phone: this.toNullableString(body.phone),
            orgUnitId: this.toNullableString(orgUnitId),
            departmentId: this.toNullableString(body.departmentId),
            department: this.toNullableString(body.department),
            positionId: this.toNullableString(positionId),
            position: this.toNullableString(body.position),
            managerId: this.toNullableString(body.managerId)
          }
        });
      } else {
        const fullName = this.cleanString(body.fullName);
        if (!fullName) {
          throw new BadRequestException('Thiếu fullName khi tạo mới nhân viên.');
        }
        const createdEmployee = await tx.employee.create({
          data: {
            tenant_Id: tenantId,
            code: this.toNullableString(body.employeeCode),
            fullName,
            email,
            phone: this.toNullableString(body.phone),
            orgUnitId: this.toNullableString(orgUnitId),
            departmentId: this.toNullableString(body.departmentId),
            department: this.toNullableString(body.department),
            positionId: this.toNullableString(positionId),
            position: this.toNullableString(body.position),
            managerId: this.toNullableString(body.managerId),
            joinDate: this.toDate(body.joinDate),
            status: this.parseStatus(body.employeeStatus)
          }
        });
        employeeId = createdEmployee.id;
      }

      const user = await tx.user.create({
        data: {
          tenant_Id: tenantId,
          email,
          role,
          employeeId: employeeId || null,
          isActive,
          passwordHash,
          mustChangePassword: true,
          passwordResetAt: now
        }
      });

      return {
        user,
        employeeId
      };
    });

    return {
      message: 'Tạo tài khoản nhân viên thành công.',
      actor,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        isActive: result.user.isActive,
        employeeId: result.employeeId,
        mustChangePassword: true
      },
      temporaryPassword
    };
  }

  async updateIamUser(userId: string, payload: Record<string, unknown>) {
    const id = this.cleanString(userId);
    if (!id) {
      throw new BadRequestException('Thiếu userId.');
    }
    const body = this.ensureRecord(payload);

    const current = await this.prisma.client.user.findFirst({
      where: { id }
    });
    if (!current) {
      throw new NotFoundException('Không tìm thấy user.');
    }

    const nextRole = body.role ? this.parseUserRole(body.role) : undefined;
    const nextEmail = body.email ? this.cleanString(body.email).toLowerCase() : undefined;
    if (nextEmail && nextEmail !== current.email) {
      const existed = await this.prisma.client.user.findFirst({
        where: { email: nextEmail }
      });
      if (existed) {
        throw new BadRequestException('Email đã tồn tại.');
      }
    }

    const nextEmployeeId = this.cleanString(body.employeeId);
    if (nextEmployeeId) {
      const employee = await this.prisma.client.employee.findFirst({
        where: { id: nextEmployeeId }
      });
      if (!employee) {
        throw new BadRequestException('employeeId không tồn tại.');
      }
    }

    const orgUnitId = this.cleanString(body.orgUnitId);
    const positionId = this.cleanString(body.positionId);
    if (orgUnitId) {
      await this.ensureOrgUnitExists(orgUnitId);
    }
    if (positionId) {
      await this.ensurePositionExists(positionId);
    }

    await this.prisma.client.user.updateMany({
      where: { id },
      data: {
        email: nextEmail,
        role: nextRole,
        employeeId: nextEmployeeId || undefined,
        isActive: body.isActive === undefined ? undefined : this.toBool(body.isActive, true)
      }
    });

    const employeeId = nextEmployeeId || this.cleanString(current.employeeId);
    if (employeeId) {
      await this.prisma.client.employee.updateMany({
        where: { id: employeeId },
        data: {
          fullName: this.toUpdateString(body.fullName),
          phone: this.toNullableString(body.phone),
          orgUnitId: this.toNullableString(orgUnitId),
          departmentId: this.toNullableString(body.departmentId),
          department: this.toNullableString(body.department),
          positionId: this.toNullableString(positionId),
          position: this.toNullableString(body.position),
          managerId: this.toNullableString(body.managerId)
        }
      });
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id }
    });
    return {
      message: 'Cập nhật tài khoản thành công.',
      user
    };
  }

  async resetIamUserPassword(userId: string) {
    const id = this.cleanString(userId);
    if (!id) {
      throw new BadRequestException('Thiếu userId.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id }
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy user.');
    }

    const now = new Date();
    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await hashPassword(temporaryPassword);

    await this.prisma.client.user.updateMany({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordResetAt: now
      }
    });

    return {
      message: 'Đã reset mật khẩu tạm cho user.',
      userId: id,
      temporaryPassword,
      mustChangePassword: true,
      resetAt: now.toISOString()
    };
  }

  async getOrganizationTree() {
    const rows = await this.prisma.client.orgUnit.findMany({
      orderBy: [{ type: 'asc' }, { orderNo: 'asc' }, { name: 'asc' }]
    });

    const items = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId,
      managerEmployeeId: row.managerEmployeeId,
      description: row.description,
      orderNo: row.orderNo,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));

    const nodeMap = new Map(items.map((item) => [item.id, { ...item, children: [] as Array<Record<string, unknown>> }]));
    const roots: Array<Record<string, unknown>> = [];
    for (const item of nodeMap.values()) {
      if (item.parentId && nodeMap.has(item.parentId)) {
        nodeMap.get(item.parentId)?.children.push(item);
      } else {
        roots.push(item);
      }
    }

    return {
      items,
      tree: roots
    };
  }

  async createOrganizationUnit(payload: Record<string, unknown>) {
    const body = this.ensureRecord(payload);
    const type = this.parseOrgUnitType(body.type);
    const name = this.cleanString(body.name);
    if (!name) {
      throw new BadRequestException('Thiếu tên đơn vị.');
    }

    const parentId = this.cleanString(body.parentId);
    const parent = parentId ? await this.ensureOrgUnitExists(parentId) : null;
    this.assertOrgHierarchy(type, parent?.type ?? null);

    if (type === 'COMPANY') {
      const existingCompany = await this.prisma.client.orgUnit.findFirst({
        where: { type: 'COMPANY' }
      });
      if (existingCompany) {
        throw new BadRequestException('Mỗi tenant chỉ được có 1 node COMPANY.');
      }
    }

    const tenantId = this.prisma.getTenantId();
    const unit = await this.prisma.client.orgUnit.create({
      data: {
        tenant_Id: tenantId,
        code: this.toNullableString(body.code),
        name,
        type,
        parentId: parentId || null,
        managerEmployeeId: this.toNullableString(body.managerEmployeeId),
        description: this.toNullableString(body.description),
        orderNo: this.toInt(body.orderNo, 0, 0, 9999),
        status: this.parseStatus(body.status)
      }
    });

    return {
      message: 'Tạo node tổ chức thành công.',
      unit
    };
  }

  async updateOrganizationUnit(idRaw: string, payload: Record<string, unknown>) {
    const id = this.cleanString(idRaw);
    if (!id) {
      throw new BadRequestException('Thiếu orgUnitId.');
    }
    await this.ensureOrgUnitExists(id);
    const body = this.ensureRecord(payload);

    const nextType = body.type ? this.parseOrgUnitType(body.type) : undefined;
    if (nextType) {
      throw new BadRequestException('Không cho phép đổi type trực tiếp. Dùng move + tạo node mới nếu cần.');
    }

    await this.prisma.client.orgUnit.updateMany({
      where: { id },
      data: {
        code: this.toNullableString(body.code),
        name: this.toUpdateString(body.name),
        managerEmployeeId: this.toNullableString(body.managerEmployeeId),
        description: this.toNullableString(body.description),
        orderNo: body.orderNo === undefined ? undefined : this.toInt(body.orderNo, 0, 0, 9999),
        status: body.status ? this.parseStatus(body.status) : undefined
      }
    });

    return {
      message: 'Cập nhật node tổ chức thành công.',
      unit: await this.prisma.client.orgUnit.findFirst({ where: { id } })
    };
  }

  async moveOrganizationUnit(idRaw: string, payload: Record<string, unknown>) {
    const id = this.cleanString(idRaw);
    if (!id) {
      throw new BadRequestException('Thiếu orgUnitId.');
    }
    const unit = await this.ensureOrgUnitExists(id);
    if (unit.type === 'COMPANY') {
      throw new BadRequestException('Không thể di chuyển node COMPANY.');
    }

    const body = this.ensureRecord(payload);
    const parentId = this.cleanString(body.parentId);
    if (!parentId) {
      throw new BadRequestException('Thiếu parentId mới.');
    }
    if (parentId === id) {
      throw new BadRequestException('parentId không hợp lệ.');
    }

    const parent = await this.ensureOrgUnitExists(parentId);
    this.assertOrgHierarchy(unit.type as OrgUnitType, parent.type as OrgUnitType);

    const allUnits = await this.prisma.client.orgUnit.findMany();
    const descendants = this.collectDescendantIds(id, allUnits);
    if (descendants.has(parentId)) {
      throw new BadRequestException('Không thể di chuyển node vào chính hậu duệ của nó.');
    }

    await this.prisma.client.orgUnit.updateMany({
      where: { id },
      data: {
        parentId
      }
    });

    return {
      message: 'Di chuyển node thành công.',
      unit: await this.prisma.client.orgUnit.findFirst({ where: { id } })
    };
  }

  async listPositions(query: Record<string, unknown>) {
    const q = this.cleanString(query.q);
    const take = this.toInt(query.limit, 200, 1, 500);
    const statusFilter = this.parseStatusFilter(query.status);

    const where: Prisma.PositionWhereInput = {
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { level: { contains: q, mode: 'insensitive' } }
            ]
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {})
    };

    const rows = await this.prisma.client.position.findMany({
      where,
      orderBy: [{ status: 'asc' }, { title: 'asc' }],
      take
    });

    return {
      items: await this.enrichPositionRows(rows),
      total: rows.length
    };
  }

  async createPosition(payload: Record<string, unknown>) {
    const body = this.ensureRecord(payload);
    const title = this.cleanString(body.title ?? body.name);
    if (!title) {
      throw new BadRequestException('Thiếu tên vị trí công việc.');
    }

    const created = await this.prisma.client.position.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: this.toNullableString(body.code),
        title,
        departmentId: this.toNullableString(body.departmentId),
        level: this.toNullableString(body.level),
        description: this.toNullableString(body.description),
        status: this.parseStatus(body.status)
      }
    });

    const [position] = await this.enrichPositionRows([created]);
    return {
      message: 'Đã thêm vị trí công việc.',
      position
    };
  }

  async updatePosition(positionIdRaw: string, payload: Record<string, unknown>) {
    const positionId = this.cleanString(positionIdRaw);
    if (!positionId) {
      throw new BadRequestException('Thiếu positionId.');
    }

    await this.ensurePositionExists(positionId);
    const body = this.ensureRecord(payload);
    const nextTitle = this.cleanString(body.title ?? body.name);

    await this.prisma.client.position.updateMany({
      where: { id: positionId },
      data: {
        code: this.toNullableString(body.code),
        title: nextTitle || undefined,
        departmentId: this.toNullableString(body.departmentId),
        level: this.toNullableString(body.level),
        description: this.toNullableString(body.description),
        status: body.status ? this.parseStatus(body.status) : undefined
      }
    });

    const updated = await this.ensurePositionExists(positionId);
    const [position] = await this.enrichPositionRows([updated]);
    return {
      message: 'Đã cập nhật vị trí công việc.',
      position
    };
  }

  async deletePosition(positionIdRaw: string) {
    const positionId = this.cleanString(positionIdRaw);
    if (!positionId) {
      throw new BadRequestException('Thiếu positionId.');
    }

    await this.ensurePositionExists(positionId);
    const employeeCount = await this.prisma.client.employee.count({
      where: {
        positionId,
        status: {
          not: GenericStatus.ARCHIVED
        }
      }
    });
    if (employeeCount > 0) {
      throw new BadRequestException(`Không thể xóa vị trí vì còn ${employeeCount} nhân viên đang sử dụng.`);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.positionPermissionRule.deleteMany({
        where: { positionId }
      });
      await tx.position.deleteMany({
        where: { id: positionId }
      });
    });

    return {
      message: 'Đã xóa vị trí công việc.',
      positionId
    };
  }

  async listPositionEmployees(positionIdRaw: string, query: Record<string, unknown>) {
    const positionId = this.cleanString(positionIdRaw);
    if (!positionId) {
      throw new BadRequestException('Thiếu positionId.');
    }
    const position = await this.ensurePositionExists(positionId);

    const q = this.cleanString(query.q);
    const take = this.toInt(query.limit, 200, 1, 500);
    const where: Prisma.EmployeeWhereInput = {
      positionId,
      status: {
        not: GenericStatus.ARCHIVED
      },
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const rows = await this.prisma.client.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        code: true,
        fullName: true,
        email: true,
        department: true,
        departmentId: true,
        orgUnitId: true,
        position: true,
        positionId: true,
        status: true,
        joinDate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return {
      positionId,
      positionTitle: position.title,
      total: rows.length,
      items: rows
    };
  }

  async getPositionPermissions(positionIdRaw: string) {
    const positionId = this.cleanString(positionIdRaw);
    if (!positionId) {
      throw new BadRequestException('Thiếu positionId.');
    }
    await this.ensurePositionExists(positionId);

    const rules = await this.prisma.client.positionPermissionRule.findMany({
      where: { positionId },
      orderBy: [{ moduleKey: 'asc' }, { action: 'asc' }]
    });
    return {
      positionId,
      rules
    };
  }

  async putPositionPermissions(positionIdRaw: string, payload: Record<string, unknown>) {
    const positionId = this.cleanString(positionIdRaw);
    if (!positionId) {
      throw new BadRequestException('Thiếu positionId.');
    }
    await this.ensurePositionExists(positionId);
    const body = this.ensureRecord(payload);
    const actor = this.resolveActor();
    const reason = this.cleanString(body.reason);
    const rules = this.parsePermissionRules(body.rules);
    const tenantId = this.prisma.getTenantId();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.positionPermissionRule.deleteMany({
        where: { positionId }
      });

      if (rules.length > 0) {
        await tx.positionPermissionRule.createMany({
          data: rules.map((rule) => ({
            tenant_Id: tenantId,
            positionId,
            moduleKey: rule.moduleKey,
            action: rule.action,
            effect: rule.effect,
            createdBy: actor,
            reason
          }))
        });
      }
    });

    return {
      message: 'Đã cập nhật ma trận quyền theo vị trí.',
      positionId,
      rules: await this.prisma.client.positionPermissionRule.findMany({
        where: { positionId },
        orderBy: [{ moduleKey: 'asc' }, { action: 'asc' }]
      })
    };
  }

  async putUserPermissionOverrides(userIdRaw: string, payload: Record<string, unknown>) {
    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId.');
    }
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy user.');
    }

    const body = this.ensureRecord(payload);
    const actorContext = this.resolveActorContext();
    const actor = actorContext.actor;
    const reason = this.cleanString(body.reason);
    const rules = this.parsePermissionRules(body.rules);
    const currentOverrides = await this.prisma.client.userPermissionOverride.findMany({
      where: { userId }
    });
    this.assertPermissionOverrideGuardrails({
      requesterUserId: actorContext.userId,
      requesterRole: actorContext.role,
      targetUserId: user.id,
      targetUserRole: this.cleanString(user.role).toUpperCase(),
      nextRules: rules,
      currentRules: currentOverrides
    });
    const tenantId = this.prisma.getTenantId();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({
        where: { userId }
      });
      if (rules.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: rules.map((rule) => ({
            tenant_Id: tenantId,
            userId,
            moduleKey: rule.moduleKey,
            action: rule.action,
            effect: rule.effect,
            createdBy: actor,
            reason
          }))
        });
      }
    });

    return {
      message: 'Đã cập nhật override quyền theo user.',
      userId,
      rules: await this.prisma.client.userPermissionOverride.findMany({
        where: { userId },
        orderBy: [{ moduleKey: 'asc' }, { action: 'asc' }]
      })
    };
  }

  async updateUserScopeOverride(userIdRaw: string, payload: Record<string, unknown>) {
    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId.');
    }
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy user.');
    }

    const body = this.ensureRecord(payload);
    const scopeMode = this.parseIamScopeMode(body.scopeMode);
    const rootOrgUnitId = this.cleanString(body.rootOrgUnitId);
    if (rootOrgUnitId) {
      await this.ensureOrgUnitExists(rootOrgUnitId);
    }
    const effectiveFrom = this.toDate(body.effectiveFrom);
    const effectiveTo = this.toDate(body.effectiveTo);
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo phải lớn hơn hoặc bằng effectiveFrom.');
    }

    const actor = this.resolveActor();
    const tenantId = this.prisma.getTenantId();
    const reason = this.cleanString(body.reason);
    const existing = await this.prisma.client.iamUserScopeOverride.findFirst({
      where: {
        tenant_Id: tenantId,
        userId
      }
    });

    if (existing) {
      await this.prisma.client.iamUserScopeOverride.updateMany({
        where: {
          tenant_Id: tenantId,
          userId
        },
        data: {
          scopeMode,
          rootOrgUnitId: rootOrgUnitId || null,
          effectiveFrom,
          effectiveTo,
          reason: reason || null,
          updatedBy: actor
        }
      });
    } else {
      await this.prisma.client.iamUserScopeOverride.create({
        data: {
          tenant_Id: tenantId,
          userId,
          scopeMode,
          rootOrgUnitId: rootOrgUnitId || null,
          effectiveFrom,
          effectiveTo,
          reason: reason || null,
          createdBy: actor,
          updatedBy: actor
        }
      });
    }

    const override = await this.prisma.client.iamUserScopeOverride.findFirst({
      where: {
        tenant_Id: tenantId,
        userId
      }
    });
    if (!override) {
      throw new NotFoundException('Không tìm thấy scope override sau khi cập nhật.');
    }

    return {
      message: 'Đã cập nhật scope override cho user.',
      userId,
      override: {
        id: override.id,
        scopeMode: override.scopeMode,
        rootOrgUnitId: override.rootOrgUnitId,
        effectiveFrom: override.effectiveFrom,
        effectiveTo: override.effectiveTo,
        reason: override.reason
      },
      effectiveScope: {
        mode: override.scopeMode,
        rootOrgUnitId: override.rootOrgUnitId || null,
        source: 'override'
      }
    };
  }

  async updateTitleScopeMapping(payload: Record<string, unknown>) {
    const body = this.ensureRecord(payload);
    const titlePattern = this.cleanString(body.titlePattern);
    if (!titlePattern) {
      throw new BadRequestException('Thiếu titlePattern.');
    }
    const scopeMode = this.parseIamScopeMode(body.scopeMode);
    const remove = this.toBool(body.remove, false);
    const isActive = this.toBool(body.isActive, true);
    const priority = this.toInt(body.priority, 100, 0, 10000);
    const reason = this.cleanString(body.reason);
    const actor = this.resolveActor();
    const tenantId = this.prisma.getTenantId();
    const settingKey = this.accessSecuritySettingKey();
    const current = await this.prisma.client.setting.findFirst({
      where: {
        tenant_Id: tenantId,
        settingKey
      }
    });

    const settingValue = this.ensureRecord(current?.settingValue);
    const currentMappings = this.normalizeTitleScopeMappings(
      settingValue.iamTitleScopeMappings ?? settingValue.titleScopeMappings
    );
    const normalizedPattern = this.normalizeTitlePattern(titlePattern);
    const withoutTarget = currentMappings.filter((item) => this.normalizeTitlePattern(item.titlePattern) !== normalizedPattern);

    const nextMappings = remove
      ? withoutTarget
      : [
          ...withoutTarget,
          {
            titlePattern,
            scopeMode,
            isActive,
            priority,
            reason: reason || null,
            updatedAt: new Date().toISOString(),
            updatedBy: actor
          }
        ].sort((a, b) => a.priority - b.priority || a.titlePattern.localeCompare(b.titlePattern));

    const nextSettingValue: Record<string, unknown> = {
      ...settingValue,
      iamTitleScopeMappings: nextMappings
    };

    if (current) {
      await this.prisma.client.setting.updateMany({
        where: { id: current.id },
        data: {
          settingValue: nextSettingValue as Prisma.InputJsonValue
        }
      });
    } else {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: tenantId,
          settingKey,
          settingValue: nextSettingValue as Prisma.InputJsonValue
        }
      });
    }

    return {
      message: remove ? 'Đã xóa title scope mapping.' : 'Đã cập nhật title scope mapping.',
      mapping: remove
        ? null
        : nextMappings.find((item) => this.normalizeTitlePattern(item.titlePattern) === normalizedPattern) ?? null,
      mappings: nextMappings
    };
  }

  async getIamMismatchReport(query: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();
    const moduleKey = this.cleanString(query.moduleKey);
    const action = this.parsePermissionAction(query.action, false);
    const limit = this.toInt(query.limit, 50, 1, 200);

    if (!this.iamShadowReport) {
      return {
        generatedAt: new Date().toISOString(),
        tenantId,
        totalMismatches: 0,
        totalGroups: 0,
        items: []
      };
    }

    return this.iamShadowReport.getMismatchReport({
      tenantId,
      moduleKey: moduleKey || undefined,
      action: action ?? undefined,
      limit
    });
  }

  async getEffectivePermissions(query: Record<string, unknown>) {
    const requester = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const requesterRole = this.cleanString(requester.role).toUpperCase();
    const targetUserIdFromQuery = this.cleanString(query.userId);
    const requesterUserId = this.cleanString(requester.userId ?? requester.sub);

    if (targetUserIdFromQuery && targetUserIdFromQuery !== requesterUserId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới xem effective permissions của user khác.');
    }

    const userId = targetUserIdFromQuery || requesterUserId;
    if (!userId) {
      throw new BadRequestException('Thiếu userId.');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId }
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy user.');
    }

    const assignmentPositionIds = await this.resolveUserPositionAssignments(user.id);
    const employeePositionId = await this.resolveUserEmployeePositionId(user.employeeId ?? null);
    const positionIds = this.uniqueStrings([...assignmentPositionIds, employeePositionId]);
    const primaryPositionId = positionIds[0] ?? '';

    const [positionRules, overrides] = await Promise.all([
      positionIds.length > 0
        ? this.prisma.client.positionPermissionRule.findMany({
            where: {
              positionId: {
                in: positionIds
              }
            }
          })
        : Promise.resolve([]),
      this.prisma.client.userPermissionOverride.findMany({
        where: { userId }
      })
    ]);

    const matrix = new Map<string, Map<PermissionAction, PermissionEffect>>();
    const applyRule = (moduleKey: string, action: PermissionAction, effect: PermissionEffect) => {
      if (!matrix.has(moduleKey)) {
        matrix.set(moduleKey, new Map());
      }
      const actionMap = matrix.get(moduleKey)!;
      const current = actionMap.get(action);
      if (current === PermissionEffect.DENY) {
        return;
      }
      if (effect === PermissionEffect.DENY) {
        actionMap.set(action, PermissionEffect.DENY);
        return;
      }
      actionMap.set(action, effect);
    };

    for (const rule of positionRules) {
      applyRule(rule.moduleKey, rule.action, rule.effect);
    }
    for (const rule of overrides) {
      applyRule(rule.moduleKey, rule.action, rule.effect);
    }

    return {
      userId,
      positionId: primaryPositionId || null,
      positionIds,
      positionRules,
      overrides,
      effective: Array.from(matrix.entries()).map(([moduleKey, actions]) => ({
        moduleKey,
        actions: Object.fromEntries(actions.entries())
      }))
    };
  }

  private async resolveUserEmployeePositionId(employeeIdRaw: string | null) {
    const employeeId = this.cleanString(employeeIdRaw);
    if (!employeeId) {
      return '';
    }
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId },
      select: { positionId: true }
    });
    return this.cleanString(employee?.positionId);
  }

  private async resolveUserPositionAssignments(userIdRaw: string) {
    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      return [];
    }
    const now = new Date();
    const rows = await this.prisma.client.userPositionAssignment.findMany({
      where: {
        userId,
        status: GenericStatus.ACTIVE,
        AND: [
          {
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }]
          },
          {
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }]
          }
        ]
      },
      select: {
        positionId: true,
        isPrimary: true,
        createdAt: true
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
    });
    return rows.map((row) => this.cleanString(row.positionId)).filter(Boolean);
  }

  private parsePermissionRules(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const rules: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }> = [];
    for (const item of value) {
      const row = this.ensureRecord(item);
      const moduleKey = resolveModuleKeyFromPath(this.cleanString(row.moduleKey));
      const actionRaw = this.cleanString(row.action).toUpperCase();
      const effectRaw = this.cleanString(row.effect).toUpperCase();
      const action = (Object.values(PermissionAction) as string[]).includes(actionRaw)
        ? (actionRaw as PermissionAction)
        : null;
      const effect = (Object.values(PermissionEffect) as string[]).includes(effectRaw)
        ? (effectRaw as PermissionEffect)
        : null;

      if (!moduleKey || !action || !effect) {
        throw new BadRequestException('Danh sách rules có phần tử không hợp lệ (moduleKey/action/effect).');
      }

      const signature = `${moduleKey}:${action}`;
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      rules.push({
        moduleKey,
        action,
        effect
      });
    }
    return rules;
  }

  private async ensureOrgUnitExists(id: string) {
    const row = await this.prisma.client.orgUnit.findFirst({
      where: { id }
    });
    if (!row) {
      throw new NotFoundException(`Không tìm thấy org unit: ${id}`);
    }
    return row;
  }

  private async ensurePositionExists(positionId: string) {
    const row = await this.prisma.client.position.findFirst({
      where: { id: positionId }
    });
    if (!row) {
      throw new BadRequestException(`positionId không tồn tại: ${positionId}`);
    }
    return row;
  }

  private async enrichPositionRows(
    rows: Array<{
      id: string;
      code: string | null;
      title: string;
      departmentId: string | null;
      level: string | null;
      description: string | null;
      status: GenericStatus;
      createdAt: Date;
      updatedAt: Date;
    }>
  ) {
    if (rows.length === 0) {
      return [] as Array<Record<string, unknown>>;
    }

    const positionIds = rows.map((row) => row.id);
    const departmentIds = [...new Set(rows.map((row) => this.cleanString(row.departmentId)).filter(Boolean))];

    const [employeesByPosition, permissionsByPosition, departments] = await Promise.all([
      this.prisma.client.employee.groupBy({
        by: ['positionId'],
        where: {
          positionId: {
            in: positionIds
          },
          status: {
            not: GenericStatus.ARCHIVED
          }
        },
        _count: {
          _all: true
        }
      }),
      this.prisma.client.positionPermissionRule.groupBy({
        by: ['positionId'],
        where: {
          positionId: {
            in: positionIds
          }
        },
        _count: {
          _all: true
        }
      }),
      departmentIds.length > 0
        ? this.prisma.client.department.findMany({
            where: {
              id: {
                in: departmentIds
              }
            },
            select: {
              id: true,
              name: true
            }
          })
        : Promise.resolve([])
    ]);

    const employeeCountByPositionId = new Map(
      employeesByPosition.map((row) => [this.cleanString(row.positionId), row._count._all])
    );
    const permissionCountByPositionId = new Map(
      permissionsByPosition.map((row) => [this.cleanString(row.positionId), row._count._all])
    );
    const departmentNameById = new Map(departments.map((row) => [row.id, row.name]));

    return rows.map((row) => {
      const departmentId = this.cleanString(row.departmentId);
      return {
        id: row.id,
        code: row.code,
        title: row.title,
        name: row.title,
        departmentId: row.departmentId,
        departmentName: departmentId ? departmentNameById.get(departmentId) ?? null : null,
        level: row.level,
        description: row.description,
        status: row.status,
        employeeCount: employeeCountByPositionId.get(row.id) ?? 0,
        permissionRuleCount: permissionCountByPositionId.get(row.id) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    });
  }

  private parseStatusFilter(value: unknown) {
    const normalized = this.cleanString(value).toUpperCase();
    if (!normalized) {
      return null;
    }
    if ((Object.values(GenericStatus) as string[]).includes(normalized)) {
      return normalized as GenericStatus;
    }
    return null;
  }

  private parseUserRole(value: unknown): UserRole {
    const roleRaw = this.cleanString(value).toUpperCase();
    if ((Object.values(UserRole) as string[]).includes(roleRaw)) {
      return roleRaw as UserRole;
    }
    return UserRole.USER;
  }

  private parseOrgUnitType(value: unknown): OrgUnitType {
    const type = this.cleanString(value).toUpperCase();
    if ((ORG_TYPE_ORDER as readonly string[]).includes(type)) {
      return type as OrgUnitType;
    }
    throw new BadRequestException('type org unit không hợp lệ.');
  }

  private parseStatus(value: unknown): GenericStatus {
    const raw = this.cleanString(value).toUpperCase();
    if ((Object.values(GenericStatus) as string[]).includes(raw)) {
      return raw as GenericStatus;
    }
    return GenericStatus.ACTIVE;
  }

  private parseIamScopeMode(value: unknown): IamScopeMode {
    const mode = this.cleanString(value).toUpperCase();
    if (mode === 'SELF' || mode === 'SUBTREE' || mode === 'UNIT_FULL') {
      return mode;
    }
    throw new BadRequestException('scopeMode phải là SELF | SUBTREE | UNIT_FULL.');
  }

  private parsePermissionAction(value: unknown, required = true) {
    const action = this.cleanString(value).toUpperCase();
    if (!action) {
      if (required) {
        throw new BadRequestException('action là bắt buộc.');
      }
      return null;
    }

    if ((Object.values(PermissionAction) as string[]).includes(action)) {
      return action as PermissionAction;
    }
    throw new BadRequestException('action không hợp lệ.');
  }

  private assertOrgHierarchy(type: OrgUnitType, parentType: OrgUnitType | null) {
    if (type === 'COMPANY') {
      if (parentType !== null) {
        throw new BadRequestException('COMPANY phải là node root (không có parent).');
      }
      return;
    }

    if (!parentType) {
      throw new BadRequestException(`${type} bắt buộc phải có parent hợp lệ.`);
    }

    const allowedParent: Record<OrgUnitType, OrgUnitType[]> = {
      COMPANY: [],
      BRANCH: ['COMPANY'],
      DEPARTMENT: ['BRANCH'],
      TEAM: ['DEPARTMENT']
    };

    if (!allowedParent[type].includes(parentType)) {
      throw new BadRequestException(`${type} chỉ được nằm dưới ${allowedParent[type].join(' hoặc ')}.`);
    }
  }

  private collectDescendantIds(rootId: string, rows: Array<{ id: string; parentId: string | null }>) {
    const childrenMap = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) {
        continue;
      }
      if (!childrenMap.has(row.parentId)) {
        childrenMap.set(row.parentId, []);
      }
      childrenMap.get(row.parentId)!.push(row.id);
    }

    const result = new Set<string>();
    const stack = [...(childrenMap.get(rootId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (result.has(current)) {
        continue;
      }
      result.add(current);
      for (const childId of childrenMap.get(current) ?? []) {
        stack.push(childId);
      }
    }
    return result;
  }

  private resolveActor() {
    return this.resolveActorContext().actor;
  }

  private accessSecuritySettingKey() {
    return 'settings.access_security.v1';
  }

  private normalizeTitlePattern(value: unknown) {
    return this.cleanString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private normalizeTitleScopeMappings(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as Array<{
        titlePattern: string;
        scopeMode: IamScopeMode;
        isActive: boolean;
        priority: number;
        reason: string | null;
        updatedAt: string;
        updatedBy: string | null;
      }>;
    }

    const dedupe = new Map<string, {
      titlePattern: string;
      scopeMode: IamScopeMode;
      isActive: boolean;
      priority: number;
      reason: string | null;
      updatedAt: string;
      updatedBy: string | null;
    }>();
    for (const item of value) {
      const row = this.ensureRecord(item);
      const titlePattern = this.cleanString(row.titlePattern);
      if (!titlePattern) {
        continue;
      }
      const key = this.normalizeTitlePattern(titlePattern);
      try {
        const scopeMode = this.parseIamScopeMode(row.scopeMode);
        dedupe.set(key, {
          titlePattern,
          scopeMode,
          isActive: this.toBool(row.isActive, true),
          priority: this.toInt(row.priority, 100, 0, 10000),
          reason: this.toNullableString(row.reason),
          updatedAt: this.toDate(row.updatedAt)?.toISOString() ?? new Date().toISOString(),
          updatedBy: this.toNullableString(row.updatedBy)
        });
      } catch {
        continue;
      }
    }

    return Array.from(dedupe.values()).sort(
      (a, b) => a.priority - b.priority || a.titlePattern.localeCompare(b.titlePattern)
    );
  }

  private resolveActorContext() {
    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const userId = this.cleanString(authUser.userId ?? authUser.sub);
    const role = this.cleanString(authUser.role).toUpperCase();
    const actor = this.cleanString(authUser.email) || userId || 'system';
    return {
      actor,
      userId,
      role
    };
  }

  private assertPermissionOverrideGuardrails(params: {
    requesterUserId: string;
    requesterRole: string;
    targetUserId: string;
    targetUserRole: string;
    nextRules: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
    currentRules: Array<{ moduleKey: string; action: PermissionAction; effect: PermissionEffect }>;
  }) {
    const ceiling = this.iamCeiling ?? new IamCeilingService();
    ceiling.assertAdminCoreProtection(params.requesterRole, params.targetUserRole);

    if (!params.requesterUserId || params.requesterRole === 'ADMIN') {
      return;
    }
    if (params.requesterUserId !== params.targetUserId) {
      return;
    }

    const hasAllowRule = params.nextRules.some((rule) => rule.effect === PermissionEffect.ALLOW);
    if (hasAllowRule) {
      throw new ForbiddenException('Không thể tự nâng quyền cho chính mình.');
    }

    const nextRuleMap = new Map<string, PermissionEffect>(
      params.nextRules.map((rule) => [`${rule.moduleKey}:${rule.action}`, rule.effect])
    );
    const liftedDeniedRule = params.currentRules.some((rule) => {
      if (rule.effect !== PermissionEffect.DENY) {
        return false;
      }
      const signature = `${rule.moduleKey}:${rule.action}`;
      return nextRuleMap.get(signature) !== PermissionEffect.DENY;
    });
    if (liftedDeniedRule) {
      throw new ForbiddenException('Không thể tự nâng quyền cho chính mình.');
    }
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toNullableString(value: unknown) {
    const text = this.cleanString(value);
    return text || null;
  }

  private toUpdateString(value: unknown) {
    const text = this.cleanString(value);
    return text || undefined;
  }

  private toInt(value: unknown, fallback: number, min?: number, max?: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    let normalized = Math.trunc(parsed);
    if (typeof min === 'number' && normalized < min) {
      normalized = min;
    }
    if (typeof max === 'number' && normalized > max) {
      normalized = max;
    }
    return normalized;
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }

  private toDate(value: unknown) {
    if (!value) {
      return null;
    }
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((item) => this.cleanString(item)).filter(Boolean)));
  }
}
