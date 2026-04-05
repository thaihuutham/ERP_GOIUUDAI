import { Inject, Injectable } from '@nestjs/common';
import { PermissionAction, PermissionEffect } from '@prisma/client';
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
