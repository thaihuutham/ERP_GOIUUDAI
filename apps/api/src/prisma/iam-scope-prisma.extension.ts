import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type IamScopeResolver = () => IamScopeContext | undefined;

type IamScopeContext = {
  enabled: boolean;
  mode: 'OFF' | 'SHADOW' | 'ENFORCE';
  companyWide: boolean;
  actorIds: string[];
  employeeIds: string[];
  orgUnitIds: string[];
};

const OPERATIONS_WITH_WHERE = new Set([
  'findMany',
  'findFirst',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert'
]);

const EMPLOYEE_SCOPE_FIELDS = new Set([
  'employeeId',
  'ownerStaffId',
  'managerEmployeeId',
  'requesterEmployeeId',
  'approverEmployeeId',
  'assigneeEmployeeId',
  'recruiterEmployeeId'
]);

const ACTOR_SCOPE_FIELDS = new Set([
  'userId',
  'requesterId',
  'approverId',
  'decisionActorId',
  'actorUserId',
  'createdBy',
  'updatedBy',
  'requestedBy'
]);

const ORG_SCOPE_FIELDS = new Set([
  'orgUnitId',
  'departmentId',
  'branchId',
  'rootOrgUnitId',
  'managerOrgUnitId'
]);

const MODEL_FIELD_MAP = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Set(model.fields.map((field) => field.name))
  ])
);

const mergeWhere = (currentWhere: Record<string, unknown> | undefined, scopeWhere: Record<string, unknown>) => {
  if (!currentWhere || Object.keys(currentWhere).length === 0) {
    return scopeWhere;
  }
  return {
    AND: [currentWhere, scopeWhere]
  };
};

const toUniqueStrings = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)));
};

const buildScopeWhere = (model: string, scope: IamScopeContext) => {
  const fields = MODEL_FIELD_MAP.get(model);
  if (!fields) {
    return null;
  }

  const employeeIds = toUniqueStrings(scope.employeeIds);
  const actorIds = toUniqueStrings(scope.actorIds);
  const orgUnitIds = toUniqueStrings(scope.orgUnitIds);

  const clauses: Array<Record<string, unknown>> = [];

  for (const field of EMPLOYEE_SCOPE_FIELDS) {
    if (!fields.has(field) || employeeIds.length === 0) {
      continue;
    }
    clauses.push({
      [field]: {
        in: employeeIds
      }
    });
  }

  for (const field of ACTOR_SCOPE_FIELDS) {
    if (!fields.has(field) || actorIds.length === 0) {
      continue;
    }
    clauses.push({
      [field]: {
        in: actorIds
      }
    });
  }

  for (const field of ORG_SCOPE_FIELDS) {
    if (!fields.has(field) || orgUnitIds.length === 0) {
      continue;
    }
    clauses.push({
      [field]: {
        in: orgUnitIds
      }
    });
  }

  if (clauses.length === 0) {
    return null;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return {
    OR: clauses
  };
};

export const createIamScopePrismaExtension = (resolveIamScope: IamScopeResolver) =>
  Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model) {
              return (query as any)(args);
            }

            const scope = resolveIamScope();
            if (!scope || !scope.enabled || scope.mode !== 'ENFORCE' || scope.companyWide) {
              return (query as any)(args);
            }

            if (!OPERATIONS_WITH_WHERE.has(operation)) {
              return (query as any)(args);
            }

            const scopeWhere = buildScopeWhere(model, scope);
            if (!scopeWhere) {
              throw new ForbiddenException(`Dữ liệu model ${model} chưa có scope field để giới hạn truy cập.`);
            }

            const nextArgs = { ...(args ?? {}) } as Record<string, unknown>;
            const currentWhere = (nextArgs.where as Record<string, unknown> | undefined) ?? undefined;
            nextArgs.where = mergeWhere(currentWhere, scopeWhere);
            return (query as any)(nextArgs);
          }
        }
      }
    })
  );
