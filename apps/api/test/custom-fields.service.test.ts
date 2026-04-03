import {
  CustomFieldEntityType,
  CustomFieldLifecycleStatus,
  CustomFieldType,
  GenericStatus,
  Prisma
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldsService } from '../src/modules/custom-fields/custom-fields.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      customFieldDefinition: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn()
      },
      customFieldSchemaVersion: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn()
      },
      customFieldIndexSpec: {
        upsert: vi.fn()
      },
      customFieldValue: {
        findMany: vi.fn(),
        upsert: vi.fn()
      },
      customFieldReportWidget: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn()
      },
      customer: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      order: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      purchaseOrder: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      invoice: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      project: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      hrEvent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      workflowDefinition: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    }
  };
}

function makeClsMock() {
  return {
    get: vi.fn().mockReturnValue({ userId: 'admin_1' })
  };
}

describe('CustomFieldsService', () => {
  it('saves draft then publishes schema version', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const service = new CustomFieldsService(prisma as any, cls as any);

    prisma.client.customFieldDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'def_1',
          fieldKey: 'crm__tier',
          label: 'Tier',
          description: null,
          fieldType: CustomFieldType.SELECT,
          required: false,
          defaultValueJson: null,
          optionsJson: ['gold', 'silver'],
          relationEntityType: null,
          formulaExpression: null,
          filterable: true,
          searchable: true,
          reportable: true,
          fieldVersion: 1,
          status: CustomFieldLifecycleStatus.DRAFT,
          latestPublishedVersion: null,
          retiredAt: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'def_1',
          fieldKey: 'crm__tier',
          label: 'Tier',
          description: null,
          fieldType: CustomFieldType.SELECT,
          required: false,
          defaultValueJson: null,
          optionsJson: ['gold', 'silver'],
          relationEntityType: null,
          formulaExpression: null,
          filterable: true,
          searchable: true,
          reportable: true,
          fieldVersion: 1,
          status: CustomFieldLifecycleStatus.DRAFT,
          latestPublishedVersion: null,
          retiredAt: null
        }
      ]);

    prisma.client.customFieldSchemaVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const draft = await service.saveDraft('customer', {
      definitions: [
        {
          fieldKey: 'crm__tier',
          fieldType: 'SELECT',
          label: 'Tier',
          options: ['gold', 'silver'],
          filterable: true,
          searchable: true,
          reportable: true
        }
      ]
    });

    expect(draft.entityType).toBe(CustomFieldEntityType.CUSTOMER);
    expect(prisma.client.customFieldDefinition.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.customFieldIndexSpec.upsert).toHaveBeenCalledTimes(1);

    const publish = await service.publish('customer', { note: 'initial publish' });
    expect(publish.version).toBe(1);
    expect(prisma.client.customFieldSchemaVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: CustomFieldEntityType.CUSTOMER,
          version: 1,
          status: GenericStatus.ACTIVE
        })
      })
    );
  });

  it('resolves entity ids by cf.* query with intersection', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const service = new CustomFieldsService(prisma as any, cls as any);

    prisma.client.customFieldSchemaVersion.findFirst.mockResolvedValue({
      id: 'schema_1',
      entityType: CustomFieldEntityType.CUSTOMER,
      version: 2,
      definitionSnapshotJson: {
        definitions: [
          {
            fieldKey: 'crm__tier',
            fieldType: CustomFieldType.SELECT,
            options: ['gold', 'silver'],
            filterable: true,
            searchable: false
          },
          {
            fieldKey: 'crm__score',
            fieldType: CustomFieldType.NUMBER,
            filterable: true,
            searchable: false
          }
        ]
      }
    });

    prisma.client.customFieldValue.findMany
      .mockResolvedValueOnce([
        { entityId: 'cust_1' },
        { entityId: 'cust_2' }
      ])
      .mockResolvedValueOnce([
        { entityId: 'cust_2' },
        { entityId: 'cust_3' }
      ]);

    const ids = await service.resolveEntityIdsByQuery(CustomFieldEntityType.CUSTOMER, {
      'cf.crm__tier': 'gold',
      'cf.crm__score.gte': '50'
    });

    expect(ids).toEqual(['cust_2']);
    expect(prisma.client.customFieldValue.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          fieldKey: 'crm__score',
          valueNumber: { gte: 50 }
        })
      })
    );
  });

  it('validates select options in applyEntityMutation', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const service = new CustomFieldsService(prisma as any, cls as any);

    prisma.client.customFieldSchemaVersion.findFirst.mockResolvedValue({
      id: 'schema_1',
      entityType: CustomFieldEntityType.CUSTOMER,
      version: 1,
      definitionSnapshotJson: {
        definitions: [
          {
            fieldKey: 'crm__segment',
            fieldType: CustomFieldType.SELECT,
            options: ['A', 'B'],
            filterable: true,
            searchable: false,
            reportable: true
          }
        ]
      }
    });
    prisma.client.customer.findFirst.mockResolvedValue({ id: 'cust_1' });
    prisma.client.customFieldValue.findMany.mockResolvedValue([]);

    await expect(
      service.applyEntityMutation(CustomFieldEntityType.CUSTOMER, 'cust_1', {
        base: {},
        customFields: { crm__segment: 'C' },
        schemaVersion: null,
        unifiedContract: true
      })
    ).rejects.toThrow("Giá trị 'C' không nằm trong options của 'crm__segment'.");
  });

  it('persists formula field automatically when applying mutation', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const service = new CustomFieldsService(prisma as any, cls as any);

    prisma.client.customFieldSchemaVersion.findFirst.mockResolvedValue({
      id: 'schema_formula',
      entityType: CustomFieldEntityType.CUSTOMER,
      version: 3,
      definitionSnapshotJson: {
        definitions: [
          {
            fieldKey: 'crm__score',
            fieldType: CustomFieldType.NUMBER,
            filterable: true,
            searchable: false,
            reportable: true
          },
          {
            fieldKey: 'crm__score2x',
            fieldType: CustomFieldType.FORMULA,
            formulaExpression: 'crm__score*2',
            filterable: false,
            searchable: false,
            reportable: true
          }
        ]
      }
    });

    prisma.client.customer.findFirst.mockResolvedValue({ id: 'cust_formula_1' });
    prisma.client.customFieldValue.findMany.mockResolvedValue([]);
    prisma.client.customFieldValue.upsert.mockResolvedValue(undefined);
    prisma.client.customer.updateMany.mockResolvedValue({ count: 1 });

    const schemaVersion = await service.applyEntityMutation(CustomFieldEntityType.CUSTOMER, 'cust_formula_1', {
      base: {},
      customFields: { crm__score: 10 },
      schemaVersion: null,
      unifiedContract: true
    });

    expect(schemaVersion).toBe(3);
    expect(prisma.client.customFieldValue.upsert).toHaveBeenCalledTimes(2);

    const upsertCalls = prisma.client.customFieldValue.upsert.mock.calls as Array<[Record<string, unknown>]>;
    const formulaCall = upsertCalls.find((call) => {
      const args = call[0];
      const create = args?.create as Record<string, unknown>;
      return create?.fieldKey === 'crm__score2x';
    });

    expect(formulaCall).toBeTruthy();
    const formulaCreate = (formulaCall as [Record<string, unknown>])[0].create as Record<string, unknown>;
    expect(Number(formulaCreate.valueNumber as Prisma.Decimal)).toBe(20);
    expect(formulaCreate.valueSource).toBe('FORMULA');
    expect(prisma.client.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cust_formula_1' },
        data: { customFieldSchemaVersion: 3 }
      })
    );
  });

  it('aggregates report metrics by group key', async () => {
    const prisma = makePrismaMock();
    const cls = makeClsMock();
    const service = new CustomFieldsService(prisma as any, cls as any);

    prisma.client.customFieldSchemaVersion.findFirst.mockResolvedValue({
      id: 'schema_report',
      entityType: CustomFieldEntityType.CUSTOMER,
      version: 4,
      definitionSnapshotJson: {
        definitions: []
      }
    });
    prisma.client.customer.findMany.mockResolvedValue([
      { id: 'cust_1' },
      { id: 'cust_2' },
      { id: 'cust_3' }
    ]);
    prisma.client.customFieldValue.findMany
      .mockResolvedValueOnce([
        { entityId: 'cust_1', valueNumber: new Prisma.Decimal(10), valueText: null, valueBool: null, valueDate: null, valueJson: null },
        { entityId: 'cust_2', valueNumber: new Prisma.Decimal(20), valueText: null, valueBool: null, valueDate: null, valueJson: null },
        { entityId: 'cust_3', valueNumber: new Prisma.Decimal(15), valueText: null, valueBool: null, valueDate: null, valueJson: null }
      ])
      .mockResolvedValueOnce([
        { entityId: 'cust_1', valueNumber: null, valueText: 'gold', valueBool: null, valueDate: null, valueJson: null },
        { entityId: 'cust_2', valueNumber: null, valueText: 'gold', valueBool: null, valueDate: null, valueJson: null },
        { entityId: 'cust_3', valueNumber: null, valueText: 'silver', valueBool: null, valueDate: null, valueJson: null }
      ]);

    const result = await service.queryReport({
      entityType: 'customer',
      metricType: 'sum',
      metricFieldKey: 'crm__score',
      groupByFieldKey: 'crm__tier'
    });

    expect(result.aggregate).toBe(45);
    expect(result.matchedEntityCount).toBe(3);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'gold', value: 30 }),
        expect.objectContaining({ key: 'silver', value: 15 })
      ])
    );
  });
});
