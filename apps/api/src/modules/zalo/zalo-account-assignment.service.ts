import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ZaloAccountPermissionLevel } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { PrismaService } from '../../prisma/prisma.service';

type AssignmentAccessDecision = {
  allowed: boolean;
  permissionLevel: ZaloAccountPermissionLevel | null;
  reason: string;
};

type AssignmentMismatchReason =
  | 'USER_ID_EMPTY'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'DUPLICATE_ACTIVE_ASSIGNMENT';

const ZALO_PERMISSION_RANK: Record<ZaloAccountPermissionLevel, number> = {
  READ: 1,
  CHAT: 2,
  ADMIN: 3
};

@Injectable()
export class ZaloAccountAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService
  ) {}

  async listAssignmentsForAccount(zaloAccountId: string) {
    await this.assertCanManageAssignments(zaloAccountId);

    return this.prisma.client.zaloAccountAssignment.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        zaloAccountId,
        revokedAt: null
      },
      orderBy: [{ assignedAt: 'asc' }, { createdAt: 'asc' }]
    });
  }

  async upsertAssignment(zaloAccountId: string, userIdRaw: string, permissionLevelRaw?: string) {
    await this.assertCanManageAssignments(zaloAccountId);

    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId để gán quyền tài khoản Zalo.');
    }

    const permissionLevel = this.parsePermissionLevel(permissionLevelRaw, ZaloAccountPermissionLevel.READ);
    const actorUserId = this.cleanString(this.readAuthContext().userId) || null;
    const now = new Date();
    const tenantId = this.prisma.getTenantId();

    const active = await this.prisma.client.zaloAccountAssignment.findFirst({
      where: {
        tenant_Id: tenantId,
        zaloAccountId,
        userId,
        revokedAt: null
      }
    });

    if (active) {
      return this.prisma.client.zaloAccountAssignment.update({
        where: { id: active.id },
        data: {
          permissionLevel,
          assignedBy: actorUserId,
          assignedAt: now
        }
      });
    }

    return this.prisma.client.zaloAccountAssignment.create({
      data: {
        tenant_Id: tenantId,
        zaloAccountId,
        userId,
        permissionLevel,
        assignedBy: actorUserId,
        assignedAt: now
      }
    });
  }

  async revokeAssignment(zaloAccountId: string, userIdRaw: string) {
    await this.assertCanManageAssignments(zaloAccountId);

    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId để thu hồi quyền tài khoản Zalo.');
    }

    const now = new Date();
    const result = await this.prisma.client.zaloAccountAssignment.updateMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        zaloAccountId,
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: now
      }
    });

    return {
      success: true,
      revokedCount: result.count
    };
  }

  async assertCanReadAccount(zaloAccountId: string) {
    const decision = await this.resolveAccessForAccount(zaloAccountId);
    if (!decision.allowed || !this.hasPermission(decision.permissionLevel, ZaloAccountPermissionLevel.READ)) {
      throw new ForbiddenException('Bạn không có quyền xem tài khoản/hội thoại Zalo này.');
    }
  }

  async assertCanChatAccount(zaloAccountId: string) {
    const decision = await this.resolveAccessForAccount(zaloAccountId);
    if (!decision.allowed || !this.hasPermission(decision.permissionLevel, ZaloAccountPermissionLevel.CHAT)) {
      throw new ForbiddenException('Bạn không có quyền gửi tin trên tài khoản/hội thoại Zalo này.');
    }
  }

  async resolveAccessibleAccountIds(accountIds?: string[]) {
    const auth = this.readAuthContext();
    const userId = this.cleanString(auth.userId);
    const role = this.cleanString(auth.role).toUpperCase();

    // Internal workers / webhooks / scheduler contexts are not user-scoped.
    if (!userId) {
      return null;
    }

    // ADMIN keeps global visibility; USER scope follows assignment.
    if (role === 'ADMIN') {
      return null;
    }

    const assignments = await this.prisma.client.zaloAccountAssignment.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        userId,
        revokedAt: null,
        ...(accountIds && accountIds.length > 0 ? { zaloAccountId: { in: accountIds } } : {})
      },
      select: { zaloAccountId: true }
    });

    return [...new Set(assignments.map((row) => row.zaloAccountId))];
  }

  async resolveAccessForAccount(zaloAccountId: string): Promise<AssignmentAccessDecision> {
    const auth = this.readAuthContext();
    const userId = this.cleanString(auth.userId);
    const role = this.cleanString(auth.role).toUpperCase();

    if (!userId) {
      return {
        allowed: true,
        permissionLevel: ZaloAccountPermissionLevel.ADMIN,
        reason: 'SYSTEM_CONTEXT'
      };
    }

    if (role === 'ADMIN') {
      return {
        allowed: true,
        permissionLevel: ZaloAccountPermissionLevel.ADMIN,
        reason: 'PRIVILEGED_ROLE'
      };
    }

    const assignment = await this.prisma.client.zaloAccountAssignment.findFirst({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        zaloAccountId,
        userId,
        revokedAt: null
      },
      select: {
        permissionLevel: true
      }
    });

    if (!assignment) {
      return {
        allowed: false,
        permissionLevel: null,
        reason: 'NO_ACTIVE_ASSIGNMENT'
      };
    }

    return {
      allowed: true,
      permissionLevel: assignment.permissionLevel,
      reason: 'ASSIGNMENT_MATCH'
    };
  }

  async resolvePermissionMapForAccounts(accountIds: string[]) {
    const normalizedIds = [...new Set(accountIds.map((id) => this.cleanString(id)).filter(Boolean))];
    const permissionMap: Record<string, ZaloAccountPermissionLevel> = {};
    if (normalizedIds.length === 0) {
      return permissionMap;
    }

    const auth = this.readAuthContext();
    const userId = this.cleanString(auth.userId);
    const role = this.cleanString(auth.role).toUpperCase();

    if (!userId || role === 'ADMIN') {
      for (const accountId of normalizedIds) {
        permissionMap[accountId] = ZaloAccountPermissionLevel.ADMIN;
      }
      return permissionMap;
    }

    const assignments = await this.prisma.client.zaloAccountAssignment.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        userId,
        revokedAt: null,
        zaloAccountId: {
          in: normalizedIds
        }
      },
      select: {
        zaloAccountId: true,
        permissionLevel: true
      }
    });

    for (const assignment of assignments) {
      permissionMap[assignment.zaloAccountId] = assignment.permissionLevel;
    }

    return permissionMap;
  }

  async assertCanManageAssignments(zaloAccountId: string) {
    await this.requireAccount(zaloAccountId);

    const auth = this.readAuthContext();
    const role = this.cleanString(auth.role).toUpperCase();
    if (role === 'ADMIN') {
      return;
    }
    const decision = await this.resolveAccessForAccount(zaloAccountId);
    if (!decision.allowed || !this.hasPermission(decision.permissionLevel, ZaloAccountPermissionLevel.ADMIN)) {
      throw new ForbiddenException('Bạn không có quyền quản trị phân quyền tài khoản Zalo này.');
    }
  }

  async assertCanViewOperationalMetrics() {
    const auth = this.readAuthContext();
    const userId = this.cleanString(auth.userId);
    const role = this.cleanString(auth.role).toUpperCase();

    if (!userId) {
      return;
    }
    if (role === 'ADMIN') {
      return;
    }
    throw new ForbiddenException('Bạn không có quyền xem metrics vận hành Zalo.');
  }

  async getAssignmentMismatchMetrics() {
    const tenantId = this.prisma.getTenantId();
    const activeAssignments = await this.prisma.client.zaloAccountAssignment.findMany({
      where: {
        tenant_Id: tenantId,
        revokedAt: null
      },
      select: {
        id: true,
        zaloAccountId: true,
        userId: true
      }
    });

    const mismatchByReason: Record<AssignmentMismatchReason, number> = {
      USER_ID_EMPTY: 0,
      USER_NOT_FOUND: 0,
      USER_INACTIVE: 0,
      DUPLICATE_ACTIVE_ASSIGNMENT: 0
    };

    const samples: Array<{
      assignmentId: string;
      zaloAccountId: string;
      userId: string;
      reason: AssignmentMismatchReason;
    }> = [];

    const normalizedUserIds = [...new Set(
      activeAssignments
        .map((assignment) => this.cleanString(assignment.userId))
        .filter(Boolean)
    )];

    const activeUsers = normalizedUserIds.length > 0
      ? await this.prisma.client.user.findMany({
          where: {
            tenant_Id: tenantId,
            id: { in: normalizedUserIds }
          },
          select: {
            id: true,
            isActive: true
          }
        })
      : [];

    const userMap = new Map<string, { isActive: boolean }>(
      activeUsers.map((user) => [user.id, { isActive: user.isActive }])
    );
    const seenPairs = new Set<string>();

    const pushMismatch = (
      reason: AssignmentMismatchReason,
      assignment: { id: string; zaloAccountId: string; userId: string },
      normalizedUserId: string
    ) => {
      mismatchByReason[reason] += 1;
      if (samples.length >= 20) {
        return;
      }
      samples.push({
        assignmentId: assignment.id,
        zaloAccountId: assignment.zaloAccountId,
        userId: normalizedUserId,
        reason
      });
    };

    for (const assignment of activeAssignments) {
      const normalizedUserId = this.cleanString(assignment.userId);
      if (!normalizedUserId) {
        pushMismatch('USER_ID_EMPTY', assignment, '');
        continue;
      }

      const pairKey = `${assignment.zaloAccountId}::${normalizedUserId}`;
      if (seenPairs.has(pairKey)) {
        pushMismatch('DUPLICATE_ACTIVE_ASSIGNMENT', assignment, normalizedUserId);
      } else {
        seenPairs.add(pairKey);
      }

      const mappedUser = userMap.get(normalizedUserId);
      if (!mappedUser) {
        pushMismatch('USER_NOT_FOUND', assignment, normalizedUserId);
        continue;
      }
      if (!mappedUser.isActive) {
        pushMismatch('USER_INACTIVE', assignment, normalizedUserId);
      }
    }

    const mismatchCount = Object.values(mismatchByReason).reduce((sum, count) => sum + count, 0);
    return {
      totalActiveAssignments: activeAssignments.length,
      mismatchCount,
      mismatchByReason,
      samples
    };
  }

  private async requireAccount(zaloAccountId: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({
      where: {
        id: zaloAccountId,
        tenant_Id: this.prisma.getTenantId()
      },
      select: { id: true }
    });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }
    return account;
  }

  private parsePermissionLevel(input: string | undefined, fallback: ZaloAccountPermissionLevel) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(ZaloAccountPermissionLevel) as string[]).includes(normalized)) {
      return normalized as ZaloAccountPermissionLevel;
    }
    return fallback;
  }

  private hasPermission(current: ZaloAccountPermissionLevel | null, required: ZaloAccountPermissionLevel) {
    if (!current) {
      return false;
    }
    return ZALO_PERMISSION_RANK[current] >= ZALO_PERMISSION_RANK[required];
  }

  private readAuthContext() {
    const raw = (this.cls.get(AUTH_USER_CONTEXT_KEY) ?? {}) as Record<string, unknown>;
    return {
      userId: this.cleanString(raw.userId ?? raw.sub),
      role: this.cleanString(raw.role)
    };
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
