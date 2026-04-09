import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionAction, PermissionEffect, Prisma, UserRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { AUTH_USER_CONTEXT_KEY, REQUEST_ID_CONTEXT_KEY } from '../../common/request/request.constants';
import { TENANT_CONTEXT_KEY } from '../../common/tenant/tenant.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantEffectiveAccess, AssistantModuleActions, AssistantScope, AssistantScopeType } from './assistant.types';

const PERMISSION_ACTIONS: PermissionAction[] = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
  PermissionAction.APPROVE
];

const DEFAULT_ALLOWED_MODULES = ['crm', 'sales', 'hr', 'workflows', 'finance', 'reports'];

@Injectable()
export class AssistantAuthzService {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async resolveCurrentAccess(options: { skipDecisionLog?: boolean } = {}): Promise<AssistantEffectiveAccess> {
    const auth = this.readAuthContext();
    const tenantId = this.cleanString(this.cls.get(TENANT_CONTEXT_KEY)) || this.prisma.getTenantId();
    if (!auth.userId || !auth.role) {
      await this.logDecision({
        tenantId,
        actorUserId: auth.userId || null,
        actorRole: auth.role,
        decisionReason: 'deny_missing_identity',
        scopeType: 'self',
        scopeRefIds: [],
        allowedModules: [],
        moduleActions: {},
        skip: options.skipDecisionLog
      });
      throw new ForbiddenException('Không xác định được danh tính để truy cập AI assistant.');
    }

    const accessSecurity = await this.runtimeSettings.getAccessSecurityRuntime();
    const assistantPolicy = this.normalizeAssistantPolicy(accessSecurity.assistantAccessPolicy);

    if (!assistantPolicy.enabled) {
      await this.logDecision({
        tenantId,
        actorUserId: auth.userId,
        actorRole: auth.role,
        decisionReason: 'deny_policy_disabled',
        scopeType: assistantPolicy.roleScopeDefaults[auth.role],
        scopeRefIds: [],
        allowedModules: [],
        moduleActions: {},
        skip: options.skipDecisionLog
      });
      throw new ForbiddenException('AI assistant đang bị tắt theo access_security.assistantAccessPolicy.enabled.');
    }

    try {
      const scope = await this.resolveScope({
        userId: auth.userId,
        role: auth.role,
        employeeId: auth.employeeId,
        requestedScope: assistantPolicy.roleScopeDefaults[auth.role],
        denyIfNoScope: assistantPolicy.denyIfNoScope
      });

      const moduleActions = await this.resolveModuleActions({
        role: auth.role,
        userId: auth.userId,
        email: auth.email,
        employeeId: auth.employeeId,
        positionId: auth.positionId,
        modules: assistantPolicy.allowedModules,
        enforcePermissionEngine: assistantPolicy.enforcePermissionEngine,
        permissionPolicy: accessSecurity.permissionPolicy
      });

      const allowedModules = Object.entries(moduleActions)
        .filter(([, actions]) => actions.includes(PermissionAction.VIEW))
        .map(([moduleKey]) => moduleKey);

      if (allowedModules.length === 0) {
        throw new ForbiddenException('Tài khoản hiện tại không có quyền VIEW trên bất kỳ module AI nào.');
      }

      const access: AssistantEffectiveAccess = {
        actor: {
          userId: auth.userId,
          email: auth.email,
          role: auth.role,
          tenantId,
          employeeId: auth.employeeId,
          positionId: auth.positionId
        },
        scope,
        allowedModules,
        moduleActions,
        policy: {
          enforcePermissionEngine: assistantPolicy.enforcePermissionEngine,
          denyIfNoScope: assistantPolicy.denyIfNoScope,
          chatChannelScopeEnforced: assistantPolicy.chatChannelScopeEnforced
        }
      };

      await this.logDecision({
        tenantId,
        actorUserId: access.actor.userId,
        actorRole: access.actor.role,
        decisionReason: 'allow',
        scopeType: access.scope.type,
        scopeRefIds: access.scope.scopeRefIds,
        allowedModules: access.allowedModules,
        moduleActions: access.moduleActions,
        skip: options.skipDecisionLog
      });

      return access;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.logDecision({
          tenantId,
          actorUserId: auth.userId,
          actorRole: auth.role,
          decisionReason: `deny_${error.message}`,
          scopeType: assistantPolicy.roleScopeDefaults[auth.role],
          scopeRefIds: [],
          allowedModules: [],
          moduleActions: {},
          skip: options.skipDecisionLog
        });
      }
      throw error;
    }
  }

  assertModulePermission(access: AssistantEffectiveAccess, moduleKeyRaw: string, action: PermissionAction) {
    const moduleKey = this.cleanString(moduleKeyRaw).toLowerCase();
    const actions = access.moduleActions[moduleKey] ?? [];
    if (!actions.includes(action)) {
      throw new ForbiddenException(`Bạn không có quyền ${action} cho module '${moduleKey}' trong AI assistant.`);
    }
  }

  private async resolveModuleActions(args: {
    role: UserRole;
    userId: string;
    email: string;
    employeeId: string;
    positionId: string;
    modules: string[];
    enforcePermissionEngine: boolean;
    permissionPolicy: {
      enabled: boolean;
      superAdminIds: string[];
      superAdminEmails: string[];
    };
  }): Promise<AssistantModuleActions> {
    const modules = this.normalizeModules(args.modules);
    const result: AssistantModuleActions = Object.fromEntries(modules.map((moduleKey) => [moduleKey, []]));

    if (args.role === UserRole.ADMIN) {
      for (const moduleKey of modules) {
        result[moduleKey] = [...PERMISSION_ACTIONS];
      }
      return result;
    }

    const isSuperAdmin =
      args.permissionPolicy.superAdminIds.includes(args.userId)
      || (args.email && args.permissionPolicy.superAdminEmails.includes(args.email.toLowerCase()));

    if (isSuperAdmin || !args.enforcePermissionEngine || !args.permissionPolicy.enabled) {
      for (const moduleKey of modules) {
        result[moduleKey] = [...PERMISSION_ACTIONS];
      }
      return result;
    }

    const positionIds = await this.resolveUserPositionIds(args.userId, args.employeeId, args.positionId);

    const [positionRules, userOverrides] = await Promise.all([
      positionIds.length > 0
        ? this.prisma.client.positionPermissionRule.findMany({
            where: {
              positionId: {
                in: positionIds
              },
              moduleKey: { in: modules },
              action: { in: PERMISSION_ACTIONS }
            }
          })
        : Promise.resolve([]),
      this.prisma.client.userPermissionOverride.findMany({
        where: {
          userId: args.userId,
          moduleKey: { in: modules },
          action: { in: PERMISSION_ACTIONS }
        }
      })
    ]);

    const ruleMap = new Map<string, PermissionEffect[]>();
    const collect = (moduleKey: string, action: PermissionAction, effect: PermissionEffect) => {
      const key = `${moduleKey}:${action}`;
      if (!ruleMap.has(key)) {
        ruleMap.set(key, []);
      }
      ruleMap.get(key)?.push(effect);
    };

    for (const rule of positionRules) {
      collect(rule.moduleKey, rule.action, rule.effect);
    }
    for (const rule of userOverrides) {
      collect(rule.moduleKey, rule.action, rule.effect);
    }

    for (const moduleKey of modules) {
      const actions: PermissionAction[] = [];
      for (const action of PERMISSION_ACTIONS) {
        const effects = ruleMap.get(`${moduleKey}:${action}`) ?? [];
        if (effects.includes(PermissionEffect.DENY)) {
          continue;
        }
        if (effects.includes(PermissionEffect.ALLOW)) {
          actions.push(action);
        }
      }
      result[moduleKey] = actions;
    }

    return result;
  }

  private async resolveScope(args: {
    userId: string;
    role: UserRole;
    employeeId: string;
    requestedScope: AssistantScopeType;
    denyIfNoScope: boolean;
  }): Promise<AssistantScope> {
    if (args.role === UserRole.ADMIN) {
      if (args.requestedScope === 'self') {
        return this.buildSelfScope(args.userId, args.employeeId);
      }
      return this.buildCompanyScope();
    }

    if (args.requestedScope === 'self') {
      return this.buildSelfScope(args.userId, args.employeeId);
    }

    const employeeId = args.employeeId || (await this.resolveEmployeeId(args.userId));
    if (!employeeId) {
      if (this.isDevSyntheticActor(args.userId, args.employeeId)) {
        return this.buildCompanyScope();
      }
      if (args.denyIfNoScope) {
        throw new ForbiddenException('Tài khoản USER chưa gắn employeeId nên không resolve được scope AI.');
      }
      return this.buildCompanyScope();
    }

    const managedUnits = await this.prisma.client.orgUnit.findMany({
      where: { managerEmployeeId: employeeId },
      select: { id: true, type: true }
    });

    const managesCompany = managedUnits.some((unit) => unit.type === 'COMPANY');
    if (args.requestedScope === 'company' && managesCompany) {
      return this.buildCompanyScope();
    }

    const branchRoots = managedUnits.filter((unit) => unit.type === 'BRANCH').map((unit) => unit.id);
    const departmentRoots = managedUnits.filter((unit) => unit.type === 'DEPARTMENT').map((unit) => unit.id);

    let rootIds: string[];
    if (args.requestedScope === 'branch') {
      rootIds = branchRoots;
    } else if (args.requestedScope === 'department') {
      rootIds = departmentRoots;
    } else {
      rootIds = [...branchRoots, ...departmentRoots];
    }

    rootIds = Array.from(new Set(rootIds));
    if (rootIds.length === 0) {
      if (this.isDevSyntheticActor(args.userId, employeeId)) {
        return this.buildCompanyScope();
      }
      if (args.denyIfNoScope) {
        throw new ForbiddenException('Không resolve được scope tổ chức phù hợp cho tài khoản USER khi dùng AI.');
      }
      return this.buildCompanyScope();
    }

    const allUnits = await this.prisma.client.orgUnit.findMany({
      select: { id: true, parentId: true }
    });
    const scopedOrgUnitIds = this.collectDescendantOrgUnitIds(rootIds, allUnits);

    const employees = await this.prisma.client.employee.findMany({
      where: {
        orgUnitId: {
          in: scopedOrgUnitIds
        }
      },
      select: { id: true }
    });
    const employeeIds = Array.from(new Set(employees.map((item) => this.cleanString(item.id)).filter(Boolean)));

    const users = employeeIds.length > 0
      ? await this.prisma.client.user.findMany({
          where: {
            employeeId: {
              in: employeeIds
            }
          },
          select: { id: true }
        })
      : [];
    const actorIds = Array.from(new Set(users.map((item) => this.cleanString(item.id)).filter(Boolean)));

    const scopeType: AssistantScopeType = branchRoots.length > 0 ? 'branch' : 'department';

    return {
      type: scopeType,
      orgUnitIds: scopedOrgUnitIds,
      employeeIds,
      actorIds,
      scopeRefIds: scopedOrgUnitIds
    };
  }

  private buildCompanyScope(): AssistantScope {
    return {
      type: 'company',
      orgUnitIds: [],
      employeeIds: [],
      actorIds: [],
      scopeRefIds: []
    };
  }

  private buildSelfScope(userId: string, employeeId: string): AssistantScope {
    const scopeRefIds = [userId, employeeId].filter(Boolean);
    return {
      type: 'self',
      orgUnitIds: [],
      employeeIds: employeeId ? [employeeId] : [],
      actorIds: userId ? [userId] : [],
      scopeRefIds
    };
  }

  private async resolveEmployeeId(userId: string) {
    if (!userId) {
      return '';
    }
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { employeeId: true }
    });
    return this.cleanString(user?.employeeId);
  }

  private async resolveUserPositionIds(userIdRaw: string, employeeIdRaw: string, tokenPositionIdRaw: string) {
    const userId = this.cleanString(userIdRaw);
    const employeeId = this.cleanString(employeeIdRaw);
    const tokenPositionId = this.cleanString(tokenPositionIdRaw);
    const now = new Date();

    const assignmentRows = userId
      ? await this.prisma.client.userPositionAssignment.findMany({
          where: {
            userId,
            status: 'ACTIVE',
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
        })
      : [];
    const assignmentIds = assignmentRows.map((row) => this.cleanString(row.positionId)).filter(Boolean);

    const employeePositionId = employeeId
      ? this.cleanString(
          (
            await this.prisma.client.employee.findFirst({
              where: { id: employeeId },
              select: { positionId: true }
            })
          )?.positionId
        )
      : '';

    return Array.from(new Set([tokenPositionId, ...assignmentIds, employeePositionId].filter(Boolean)));
  }

  private collectDescendantOrgUnitIds(rootIds: string[], rows: Array<{ id: string; parentId: string | null }>) {
    const mapByParent = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) {
        continue;
      }
      if (!mapByParent.has(row.parentId)) {
        mapByParent.set(row.parentId, []);
      }
      mapByParent.get(row.parentId)?.push(row.id);
    }

    const visited = new Set<string>(rootIds);
    const queue = [...rootIds];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const childId of mapByParent.get(current) ?? []) {
        if (visited.has(childId)) {
          continue;
        }
        visited.add(childId);
        queue.push(childId);
      }
    }

    return Array.from(visited);
  }

  private normalizeAssistantPolicy(value: unknown) {
    const policy = this.ensureRecord(value);
    const roleScopeDefaults = this.ensureRecord(policy.roleScopeDefaults);
    const userScope = roleScopeDefaults.USER ?? roleScopeDefaults.MANAGER ?? roleScopeDefaults.STAFF;
    return {
      enabled: this.toBool(policy.enabled, false),
      roleScopeDefaults: {
        ADMIN: this.normalizeScope(roleScopeDefaults.ADMIN, 'company'),
        USER: this.normalizeScope(userScope, 'department')
      } as Record<UserRole, AssistantScopeType>,
      enforcePermissionEngine: this.toBool(policy.enforcePermissionEngine, true),
      denyIfNoScope: this.toBool(policy.denyIfNoScope, true),
      allowedModules: this.normalizeModules(policy.allowedModules),
      chatChannelScopeEnforced: this.toBool(policy.chatChannelScopeEnforced, true)
    };
  }

  private normalizeScope(value: unknown, fallback: AssistantScopeType): AssistantScopeType {
    const normalized = this.cleanString(value).toLowerCase();
    if (normalized === 'company' || normalized === 'branch' || normalized === 'department' || normalized === 'self') {
      return normalized;
    }
    return fallback;
  }

  private normalizeModules(value: unknown) {
    const modules = this.toStringArray(value).map((item) => item.toLowerCase());
    const fallback = DEFAULT_ALLOWED_MODULES;
    const normalized = (modules.length > 0 ? modules : fallback)
      .filter((item) => Boolean(item))
      .filter((item, index, arr) => arr.indexOf(item) === index);
    return normalized;
  }

  private isDevSyntheticActor(userId: string, employeeId: string) {
    const normalizedUserId = this.cleanString(userId).toLowerCase();
    const normalizedEmployeeId = this.cleanString(employeeId).toLowerCase();
    return normalizedUserId.startsWith('dev_') || normalizedEmployeeId.startsWith('dev_');
  }

  private async logDecision(input: {
    tenantId: string;
    actorUserId: string | null;
    actorRole: UserRole | null;
    decisionReason: string;
    scopeType: AssistantScopeType;
    scopeRefIds: string[];
    allowedModules: string[];
    moduleActions: AssistantModuleActions;
    skip?: boolean;
  }) {
    if (input.skip) {
      return;
    }
    try {
      await this.prisma.client.assistantAccessDecisionLog.create({
        data: {
          tenant_Id: input.tenantId,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          scopeType: input.scopeType,
          scopeRefIds: input.scopeRefIds as Prisma.InputJsonValue,
          allowedModulesJson: {
            allowedModules: input.allowedModules,
            moduleActions: input.moduleActions
          } as Prisma.InputJsonValue,
          decisionReason: input.decisionReason,
          requestId: this.cleanString(this.cls.get(REQUEST_ID_CONTEXT_KEY)) || null
        }
      });
    } catch {
      // Decision log failure must not break business flow.
    }
  }

  private readAuthContext() {
    const auth = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const roleRaw = this.cleanString(auth.role).toUpperCase();
    const role = roleRaw === UserRole.ADMIN
      ? UserRole.ADMIN
      : roleRaw === UserRole.USER || roleRaw === 'MANAGER' || roleRaw === 'STAFF'
        ? UserRole.USER
        : null;

    return {
      userId: this.cleanString(auth.userId ?? auth.sub),
      email: this.cleanString(auth.email).toLowerCase(),
      role,
      employeeId: this.cleanString(auth.employeeId),
      positionId: this.cleanString(auth.positionId)
    };
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

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }
}
