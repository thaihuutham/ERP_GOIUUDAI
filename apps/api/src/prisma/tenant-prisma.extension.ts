import { Prisma } from '@prisma/client';

type TenantResolver = () => string;

const OPERATIONS_WITH_WHERE = new Set([
  'findMany',
  'findFirst',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany'
]);

const OPERATIONS_WITH_DATA = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);

const mergeTenantWhere = (where: Record<string, unknown> | undefined, tenantId: string): Record<string, unknown> => {
  if (!where || Object.keys(where).length === 0) {
    return { tenant_Id: tenantId };
  }

  return {
    AND: [where, { tenant_Id: tenantId }]
  };
};

const attachTenantIntoData = (data: unknown, tenantId: string): unknown => {
  if (Array.isArray(data)) {
    return data.map((item) => attachTenantIntoData(item, tenantId));
  }

  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    return {
      ...payload,
      tenant_Id: tenantId
    };
  }

  return data;
};

export const createTenantPrismaExtension = (resolveTenantId: TenantResolver) =>
  Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model) {
              return (query as any)(args);
            }

            const tenantId = resolveTenantId();
            if (!tenantId) {
              throw new Error('Missing tenant context.');
            }

            const nextArgs = { ...(args ?? {}) } as Record<string, unknown>;

            if (OPERATIONS_WITH_WHERE.has(operation)) {
              const currentWhere = (nextArgs.where as Record<string, unknown> | undefined) ?? undefined;
              nextArgs.where = mergeTenantWhere(currentWhere, tenantId);
            }

            if (operation === 'findUnique' || operation === 'findUniqueOrThrow' || operation === 'update' || operation === 'delete') {
              const where = (nextArgs.where as Record<string, unknown> | undefined) ?? {};
              nextArgs.where = {
                ...where,
                tenant_Id: tenantId
              };
            }

            if (operation === 'upsert') {
              const where = (nextArgs.where as Record<string, unknown> | undefined) ?? {};
              nextArgs.where = {
                ...where,
                tenant_Id: tenantId
              };
            }

            if (OPERATIONS_WITH_DATA.has(operation)) {
              if (operation === 'upsert') {
                nextArgs.create = attachTenantIntoData(nextArgs.create, tenantId);
                nextArgs.update = attachTenantIntoData(nextArgs.update, tenantId);
              } else {
                nextArgs.data = attachTenantIntoData(nextArgs.data, tenantId);
              }
            }

            return (query as any)(nextArgs);
          }
        }
      }
    })
  );
