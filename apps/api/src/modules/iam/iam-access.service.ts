import { Inject, Injectable } from '@nestjs/common';
import { IamGrantReason, PermissionAction, PermissionEffect } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IamActionDecision, IamActorContext } from './iam.types';
import { IamScopeService } from './iam-scope.service';

@Injectable()
export class IamAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IamScopeService) private readonly scopeService: IamScopeService
  ) {}

  async resolveActionDecision(
    actor: IamActorContext,
    moduleKeyRaw: string,
    action: PermissionAction
  ): Promise<IamActionDecision> {
    const moduleKey = this.cleanString(moduleKeyRaw).toLowerCase();
    const role = this.cleanString(actor.role).toUpperCase();

    if (role === 'ADMIN') {
      return {
        allowed: true,
        reason: 'ADMIN_BYPASS',
        moduleKey,
        action,
        matchedEffects: []
      };
    }

    const effects = await this.loadActionEffects(actor, moduleKey, action);

    if (effects.includes(PermissionEffect.DENY)) {
      return {
        allowed: false,
        reason: 'DENY_OVERRIDE',
        moduleKey,
        action,
        matchedEffects: effects
      };
    }

    if (effects.includes(PermissionEffect.ALLOW)) {
      return {
        allowed: true,
        reason: 'ALLOW_MATCH',
        moduleKey,
        action,
        matchedEffects: effects
      };
    }

    return {
      allowed: false,
      reason: 'NO_MATCH',
      moduleKey,
      action,
      matchedEffects: []
    };
  }

  async evaluate(actor: IamActorContext, moduleKey: string, action: PermissionAction) {
    const [actionDecision, scope] = await Promise.all([
      this.resolveActionDecision(actor, moduleKey, action),
      this.scopeService.resolveEffectiveScope(actor)
    ]);

    return {
      actionDecision,
      scope,
      allowed: actionDecision.allowed
    };
  }

  async grantRecordAccess(params: {
    actorUserId: string;
    recordType: string;
    recordId: string;
    actions: PermissionAction[];
    grantReason?: IamGrantReason;
    expiresAt?: Date | null;
    sourceRef?: string | null;
    reason?: string | null;
    createdBy?: string | null;
    updatedBy?: string | null;
  }) {
    const tenantId = this.prisma.getTenantId();
    const actorUserId = this.cleanString(params.actorUserId);
    const recordType = this.cleanString(params.recordType).toUpperCase();
    const recordId = this.cleanString(params.recordId);
    if (!tenantId || !actorUserId || !recordType || !recordId) {
      return null;
    }

    const actions = Array.from(new Set((params.actions ?? []).filter((item) => !!item)));
    if (actions.length === 0) {
      return null;
    }

    return this.prisma.client.iamRecordAccessGrant.create({
      data: {
        tenant_Id: tenantId,
        actorUserId,
        recordType,
        recordId,
        grantReason: params.grantReason ?? IamGrantReason.WORKFLOW_ASSIGNMENT,
        actions,
        expiresAt: params.expiresAt ?? null,
        sourceRef: this.cleanString(params.sourceRef) || null,
        reason: this.cleanString(params.reason) || null,
        createdBy: this.cleanString(params.createdBy) || null,
        updatedBy: this.cleanString(params.updatedBy) || null
      }
    });
  }

  async canAccessRecord(
    actor: IamActorContext,
    recordTypeRaw: string,
    recordIdRaw: string,
    action: PermissionAction
  ) {
    const role = this.cleanString(actor.role).toUpperCase();
    if (role === 'ADMIN') {
      return true;
    }

    const tenantId = this.cleanString(actor.tenantId);
    const userId = this.cleanString(actor.userId);
    const recordType = this.cleanString(recordTypeRaw).toUpperCase();
    const recordId = this.cleanString(recordIdRaw);
    if (!tenantId || !userId || !recordType || !recordId) {
      return false;
    }

    const acceptedActions = action === PermissionAction.VIEW
      ? [PermissionAction.VIEW, PermissionAction.APPROVE]
      : [action];
    const now = new Date();
    const grants = await this.prisma.client.iamRecordAccessGrant.findMany({
      where: {
        tenant_Id: tenantId,
        actorUserId: userId,
        recordType,
        recordId,
        OR: acceptedActions.map((accepted) => ({
          actions: { has: accepted }
        })),
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }]
          }
        ]
      },
      take: 1
    });

    return grants.length > 0;
  }

  private async loadActionEffects(actor: IamActorContext, moduleKey: string, action: PermissionAction) {
    const tenantId = this.cleanString(actor.tenantId);
    const userId = this.cleanString(actor.userId);
    if (!tenantId || !userId || !moduleKey) {
      return [] as Array<'ALLOW' | 'DENY'>;
    }

    const conditions: Array<{ subjectType: 'USER' | 'POSITION'; subjectId: string }> = [
      {
        subjectType: 'USER',
        subjectId: userId
      }
    ];

    const positionId = this.cleanString(actor.positionId);
    if (positionId) {
      conditions.push({
        subjectType: 'POSITION',
        subjectId: positionId
      });
    }

    const grants = await this.prisma.client.iamActionGrant.findMany({
      where: {
        tenant_Id: tenantId,
        moduleKey,
        action,
        OR: conditions
      },
      orderBy: [
        {
          priority: 'asc'
        },
        {
          createdAt: 'asc'
        }
      ]
    });

    return grants
      .map((item) => item.effect)
      .filter((effect): effect is 'ALLOW' | 'DENY' => effect === 'ALLOW' || effect === 'DENY');
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
