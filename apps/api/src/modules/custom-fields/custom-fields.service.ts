import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomFieldEntityType,
  CustomFieldLifecycleStatus,
  CustomFieldType,
  CustomFieldWidgetChartType,
  GenericStatus,
  Prisma
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { AuthUser } from '../../common/auth/auth-user.type';
import { PrismaService } from '../../prisma/prisma.service';

type MutationPayload = {
  base: Record<string, unknown>;
  customFields: Record<string, unknown>;
  schemaVersion: number | null;
  unifiedContract: boolean;
};

type DraftFieldInput = {
  fieldKey: string;
  label: string;
  description?: string;
  fieldType: CustomFieldType;
  required: boolean;
  defaultValueJson: Prisma.InputJsonValue | null;
  optionsJson: Prisma.InputJsonValue | null;
  relationEntityType: CustomFieldEntityType | null;
  formulaExpression: string | null;
  filterable: boolean;
  searchable: boolean;
  reportable: boolean;
  status: CustomFieldLifecycleStatus;
};

type CustomFieldOptionRow = {
  key: string;
  label: string;
  order: number;
};

type PublishedSchema = {
  version: number;
  definitions: DraftFieldInput[];
};

type FilterOperator = 'eq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';

type FilterTerm = {
  fieldKey: string;
  operator: FilterOperator;
  rawValue: unknown;
};

type ValuePayload = {
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueJson: Prisma.InputJsonValue | null;
  valueSource: string;
};

const FILTER_OPERATORS = new Set<FilterOperator>(['eq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte']);

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9]{1,20}__[a-z][a-z0-9_]{1,60}$/;

const ENTITY_TYPE_ALIASES: Record<string, CustomFieldEntityType> = {
  CUSTOMER: CustomFieldEntityType.CUSTOMER,
  CUSTOMERS: CustomFieldEntityType.CUSTOMER,
  customer: CustomFieldEntityType.CUSTOMER,
  customers: CustomFieldEntityType.CUSTOMER,

  PRODUCT: CustomFieldEntityType.PRODUCT,
  PRODUCTS: CustomFieldEntityType.PRODUCT,
  product: CustomFieldEntityType.PRODUCT,
  products: CustomFieldEntityType.PRODUCT,

  EMPLOYEE: CustomFieldEntityType.EMPLOYEE,
  EMPLOYEES: CustomFieldEntityType.EMPLOYEE,
  employee: CustomFieldEntityType.EMPLOYEE,
  employees: CustomFieldEntityType.EMPLOYEE,

  SALES_ORDER: CustomFieldEntityType.SALES_ORDER,
  sales_order: CustomFieldEntityType.SALES_ORDER,
  'sales-order': CustomFieldEntityType.SALES_ORDER,
  salesOrder: CustomFieldEntityType.SALES_ORDER,
  order: CustomFieldEntityType.SALES_ORDER,
  orders: CustomFieldEntityType.SALES_ORDER,

  PURCHASE_ORDER: CustomFieldEntityType.PURCHASE_ORDER,
  purchase_order: CustomFieldEntityType.PURCHASE_ORDER,
  'purchase-order': CustomFieldEntityType.PURCHASE_ORDER,
  purchaseOrder: CustomFieldEntityType.PURCHASE_ORDER,
  purchaseOrders: CustomFieldEntityType.PURCHASE_ORDER,

  INVOICE: CustomFieldEntityType.INVOICE,
  INVOICES: CustomFieldEntityType.INVOICE,
  invoice: CustomFieldEntityType.INVOICE,
  invoices: CustomFieldEntityType.INVOICE,

  PROJECT: CustomFieldEntityType.PROJECT,
  PROJECTS: CustomFieldEntityType.PROJECT,
  project: CustomFieldEntityType.PROJECT,
  projects: CustomFieldEntityType.PROJECT,

  HR_EVENT: CustomFieldEntityType.HR_EVENT,
  hr_event: CustomFieldEntityType.HR_EVENT,
  'hr-event': CustomFieldEntityType.HR_EVENT,
  hrEvent: CustomFieldEntityType.HR_EVENT,
  events: CustomFieldEntityType.HR_EVENT,

  WORKFLOW_DEFINITION: CustomFieldEntityType.WORKFLOW_DEFINITION,
  workflow_definition: CustomFieldEntityType.WORKFLOW_DEFINITION,
  'workflow-definition': CustomFieldEntityType.WORKFLOW_DEFINITION,
  workflowDefinition: CustomFieldEntityType.WORKFLOW_DEFINITION,
  workflowDefinitions: CustomFieldEntityType.WORKFLOW_DEFINITION,

  SERVICE_CONTRACT: CustomFieldEntityType.SERVICE_CONTRACT,
  service_contract: CustomFieldEntityType.SERVICE_CONTRACT,
  'service-contract': CustomFieldEntityType.SERVICE_CONTRACT,
  serviceContract: CustomFieldEntityType.SERVICE_CONTRACT,
  serviceContracts: CustomFieldEntityType.SERVICE_CONTRACT,
  contract: CustomFieldEntityType.SERVICE_CONTRACT,
  contracts: CustomFieldEntityType.SERVICE_CONTRACT,

  VEHICLE: CustomFieldEntityType.VEHICLE,
  vehicle: CustomFieldEntityType.VEHICLE,
  vehicles: CustomFieldEntityType.VEHICLE,

  INSURANCE_POLICY: CustomFieldEntityType.INSURANCE_POLICY,
  insurance_policy: CustomFieldEntityType.INSURANCE_POLICY,
  'insurance-policy': CustomFieldEntityType.INSURANCE_POLICY,
  insurancePolicy: CustomFieldEntityType.INSURANCE_POLICY,
  insurancePolicies: CustomFieldEntityType.INSURANCE_POLICY,
  policy: CustomFieldEntityType.INSURANCE_POLICY,
  policies: CustomFieldEntityType.INSURANCE_POLICY
};

@Injectable()
export class CustomFieldsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService
  ) {}

  normalizeEntityType(raw: string | CustomFieldEntityType) {
    if (Object.values(CustomFieldEntityType).includes(raw as CustomFieldEntityType)) {
      return raw as CustomFieldEntityType;
    }

    const normalized = String(raw ?? '').trim();
    const mapped = ENTITY_TYPE_ALIASES[normalized] ?? ENTITY_TYPE_ALIASES[normalized.toLowerCase()];
    if (!mapped) {
      throw new BadRequestException(`Unsupported entityType: ${raw}`);
    }
    return mapped;
  }

  parseMutationBody(raw: Record<string, unknown>): MutationPayload {
    const body = this.toRecord(raw);
    const hasBase = this.isPlainObject(body.base);
    const base = hasBase
      ? this.toRecord(body.base)
      : this.omitKeys(body, new Set(['base', 'customFields', 'schemaVersion']));

    return {
      base,
      customFields: this.toRecord(body.customFields),
      schemaVersion: this.toPositiveInt(body.schemaVersion),
      unifiedContract: hasBase || Object.prototype.hasOwnProperty.call(body, 'customFields') || Object.prototype.hasOwnProperty.call(body, 'schemaVersion')
    };
  }

  async getSchema(entityTypeRaw: string) {
    const entityType = this.normalizeEntityType(entityTypeRaw);
    const [definitions, latestPublished] = await Promise.all([
      this.prisma.client.customFieldDefinition.findMany({
        where: { entityType },
        orderBy: [{ fieldKey: 'asc' }]
      }),
      this.prisma.client.customFieldSchemaVersion.findFirst({
        where: { entityType },
        orderBy: [{ version: 'desc' }]
      })
    ]);

    return {
      entityType,
      draft: definitions,
      published: latestPublished
        ? {
            version: latestPublished.version,
            publishedAt: latestPublished.publishedAt,
            publishedBy: latestPublished.publishedBy,
            status: latestPublished.status
          }
        : null
    };
  }

  async saveDraft(entityTypeRaw: string, rawPayload: Record<string, unknown>) {
    const entityType = this.normalizeEntityType(entityTypeRaw);
    const payload = this.toRecord(rawPayload);
    const definitionsRaw = Array.isArray(payload.definitions) ? payload.definitions : null;
    if (!definitionsRaw) {
      throw new BadRequestException('definitions phải là mảng.');
    }

    const replaceMissing = this.toBool(payload.replaceMissing, false);
    const actor = this.resolveActorId();

    const existing = await this.prisma.client.customFieldDefinition.findMany({
      where: { entityType },
      orderBy: [{ fieldKey: 'asc' }]
    });
    const existingMap = new Map(existing.map((row) => [row.fieldKey, row]));

    const touchedKeys = new Set<string>();

    for (const row of definitionsRaw) {
      const normalized = this.normalizeDraftField(row);
      touchedKeys.add(normalized.fieldKey);
      const current = existingMap.get(normalized.fieldKey);
      const changed = current ? this.isDefinitionChanged(current, normalized) : true;

      if (current) {
        await this.prisma.client.customFieldDefinition.updateMany({
          where: { id: current.id },
          data: {
            label: normalized.label,
            description: normalized.description,
            fieldType: normalized.fieldType,
            required: normalized.required,
            defaultValueJson: this.toDbJsonValue(normalized.defaultValueJson),
            optionsJson: this.toDbJsonValue(normalized.optionsJson),
            relationEntityType: normalized.relationEntityType,
            formulaExpression: normalized.formulaExpression,
            filterable: normalized.filterable,
            searchable: normalized.searchable,
            reportable: normalized.reportable,
            status: normalized.status,
            fieldVersion: changed ? current.fieldVersion + 1 : current.fieldVersion,
            retiredAt: normalized.status === CustomFieldLifecycleStatus.RETIRED ? (current.retiredAt ?? new Date()) : null,
            updatedBy: actor
          }
        });
      } else {
        await this.prisma.client.customFieldDefinition.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            entityType,
            fieldKey: normalized.fieldKey,
            label: normalized.label,
            description: normalized.description,
            fieldType: normalized.fieldType,
            required: normalized.required,
            defaultValueJson: this.toDbJsonValue(normalized.defaultValueJson),
            optionsJson: this.toDbJsonValue(normalized.optionsJson),
            relationEntityType: normalized.relationEntityType,
            formulaExpression: normalized.formulaExpression,
            filterable: normalized.filterable,
            searchable: normalized.searchable,
            reportable: normalized.reportable,
            status: normalized.status,
            createdBy: actor,
            updatedBy: actor
          }
        });
      }

      await this.prisma.client.customFieldIndexSpec.upsert({
        where: {
          tenant_Id_entityType_fieldKey: {
            tenant_Id: this.prisma.getTenantId(),
            entityType,
            fieldKey: normalized.fieldKey
          }
        },
        create: {
          tenant_Id: this.prisma.getTenantId(),
          entityType,
          fieldKey: normalized.fieldKey,
          filterable: normalized.filterable,
          searchable: normalized.searchable,
          reportable: normalized.reportable,
          indexed: normalized.filterable || normalized.searchable,
          indexName: this.buildIndexName(entityType, normalized.fieldKey),
          createdBy: actor,
          updatedBy: actor,
          status: GenericStatus.ACTIVE
        },
        update: {
          filterable: normalized.filterable,
          searchable: normalized.searchable,
          reportable: normalized.reportable,
          indexed: normalized.filterable || normalized.searchable,
          indexName: this.buildIndexName(entityType, normalized.fieldKey),
          updatedBy: actor,
          status: GenericStatus.ACTIVE
        }
      });
    }

    if (replaceMissing) {
      for (const row of existing) {
        if (!touchedKeys.has(row.fieldKey) && row.status !== CustomFieldLifecycleStatus.ARCHIVED) {
          await this.prisma.client.customFieldDefinition.updateMany({
            where: { id: row.id },
            data: {
              status: CustomFieldLifecycleStatus.RETIRED,
              retiredAt: row.retiredAt ?? new Date(),
              updatedBy: actor
            }
          });
        }
      }
    }

    return this.getSchema(entityType);
  }

  async publish(entityTypeRaw: string, rawPayload: Record<string, unknown>) {
    const entityType = this.normalizeEntityType(entityTypeRaw);
    const payload = this.toRecord(rawPayload);
    const actor = this.resolveActorId();

    const draft = await this.prisma.client.customFieldDefinition.findMany({
      where: {
        entityType,
        status: {
          in: [CustomFieldLifecycleStatus.DRAFT, CustomFieldLifecycleStatus.ACTIVE, CustomFieldLifecycleStatus.RETIRED]
        }
      },
      orderBy: [{ fieldKey: 'asc' }]
    });

    if (draft.length === 0) {
      throw new BadRequestException('Không có field draft/active để publish.');
    }

    const latest = await this.prisma.client.customFieldSchemaVersion.findFirst({
      where: { entityType },
      orderBy: [{ version: 'desc' }]
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const definitionSnapshot = draft.map((row) => ({
      fieldKey: row.fieldKey,
      label: row.label,
      description: row.description,
      fieldType: row.fieldType,
      required: row.required,
      defaultValueJson: row.defaultValueJson,
      optionsJson: row.optionsJson,
      relationEntityType: row.relationEntityType,
      formulaExpression: row.formulaExpression,
      filterable: row.filterable,
      searchable: row.searchable,
      reportable: row.reportable,
      status: row.status,
      fieldVersion: row.fieldVersion
    }));

    const impactSummary = {
      total: draft.length,
      active: draft.filter((item) => item.status !== CustomFieldLifecycleStatus.RETIRED).length,
      retired: draft.filter((item) => item.status === CustomFieldLifecycleStatus.RETIRED).length,
      publishedNote: this.readString(payload.note)
    };

    await this.prisma.client.customFieldSchemaVersion.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        entityType,
        version: nextVersion,
        status: GenericStatus.ACTIVE,
        definitionSnapshotJson: {
          version: nextVersion,
          definitions: definitionSnapshot
        },
        impactSummaryJson: impactSummary,
        publishedBy: actor
      }
    });

    for (const row of draft) {
      await this.prisma.client.customFieldDefinition.updateMany({
        where: { id: row.id },
        data: {
          latestPublishedVersion: nextVersion,
          status: row.status === CustomFieldLifecycleStatus.DRAFT ? CustomFieldLifecycleStatus.ACTIVE : row.status,
          updatedBy: actor
        }
      });
    }

    return {
      entityType,
      version: nextVersion,
      publishedBy: actor,
      impactSummary
    };
  }

  async history(entityTypeRaw: string, limitRaw: unknown) {
    const entityType = this.normalizeEntityType(entityTypeRaw);
    const limit = this.toInt(limitRaw, 50, 1, 200);
    const versions = await this.prisma.client.customFieldSchemaVersion.findMany({
      where: { entityType },
      orderBy: [{ version: 'desc' }],
      take: limit
    });
    return {
      entityType,
      items: versions
    };
  }

  async resolveEntityIdsByQuery(entityType: CustomFieldEntityType, rawQuery: Record<string, unknown> | undefined) {
    const terms = this.parseFilterTerms(this.toRecord(rawQuery), true);
    if (terms.length === 0) {
      return undefined;
    }
    return this.resolveEntityIdsByTerms(entityType, terms);
  }

  async resolveEntityIdsByFilterMap(entityType: CustomFieldEntityType, rawFilters: Record<string, unknown> | undefined) {
    const terms = this.parseFilterTerms(this.toRecord(rawFilters), false);
    if (terms.length === 0) {
      return undefined;
    }
    return this.resolveEntityIdsByTerms(entityType, terms);
  }

  async applyEntityMutation(entityType: CustomFieldEntityType, entityIdRaw: unknown, mutation: MutationPayload) {
    const entityId = this.readString(entityIdRaw);
    if (!entityId || !mutation.unifiedContract) {
      return null;
    }

    const schema = await this.getPublishedSchema(entityType, mutation.schemaVersion ?? undefined);
    const schemaVersion = schema?.version ?? null;

    if (!schema) {
      if (Object.keys(mutation.customFields).length > 0 || mutation.schemaVersion !== null) {
        throw new BadRequestException('Entity chưa có schema custom fields đã publish.');
      }
      return null;
    }

    await this.ensureEntityExists(entityType, entityId);

    await this.upsertEntityFieldValues(entityType, entityId, schema, mutation.customFields);
    await this.updateEntitySchemaVersion(entityType, entityId, schemaVersion);

    return schemaVersion;
  }

  async wrapEntity(entityType: CustomFieldEntityType, rawRecord: unknown) {
    const record = this.toRecord(rawRecord);
    const id = this.readString(record.id);
    if (!id) {
      return rawRecord;
    }

    const schemaVersion = this.toPositiveInt(record.customFieldSchemaVersion);
    const customFieldMap = await this.loadCustomFieldValueMap(entityType, [id], new Map([[id, schemaVersion]]));
    const base = this.omitKeys(record, new Set(['id', 'customFieldSchemaVersion']));

    return {
      id,
      schemaVersion,
      base,
      customFields: customFieldMap.get(id) ?? {}
    };
  }

  async wrapResult(entityType: CustomFieldEntityType, rawResult: unknown) {
    if (Array.isArray(rawResult)) {
      return this.wrapArray(entityType, rawResult);
    }

    const resultRecord = this.toRecord(rawResult);
    if (Array.isArray(resultRecord.items)) {
      const wrappedItems = await this.wrapArray(entityType, resultRecord.items);
      return {
        ...resultRecord,
        items: wrappedItems
      };
    }

    return this.wrapEntity(entityType, rawResult);
  }

  async wrapNestedEntity(entityType: CustomFieldEntityType, rawResult: unknown, property: string) {
    const result = this.toRecord(rawResult);
    if (!this.isPlainObject(result[property])) {
      return rawResult;
    }

    return {
      ...result,
      [property]: await this.wrapEntity(entityType, result[property])
    };
  }

  async queryReport(rawPayload: Record<string, unknown>) {
    const payload = this.toRecord(rawPayload);
    const entityType = this.normalizeEntityType(this.readString(payload.entityType));
    const metricType = this.readString(payload.metricType, 'count').toLowerCase();
    const metricFieldKey = this.readString(payload.metricFieldKey);
    const groupByFieldKey = this.readString(payload.groupByFieldKey);

    const filters = this.toRecord(payload.filters);
    const matchedEntityIds = await this.resolveEntityIdsByFilterMap(entityType, filters);

    const entityIds = matchedEntityIds ?? await this.listEntityIds(entityType, this.toInt(payload.limit, 5000, 1, 20000));
    if (entityIds.length === 0) {
      return {
        entityType,
        metricType,
        metricFieldKey: metricFieldKey || null,
        groupByFieldKey: groupByFieldKey || null,
        matchedEntityCount: 0,
        aggregate: 0,
        groups: []
      };
    }

    const metricValues = metricFieldKey
      ? await this.prisma.client.customFieldValue.findMany({
          where: {
            entityType,
            fieldKey: metricFieldKey,
            entityId: { in: entityIds }
          },
          select: {
            entityId: true,
            valueNumber: true,
            valueText: true,
            valueBool: true,
            valueDate: true,
            valueJson: true
          }
        })
      : [];

    const groupValues = groupByFieldKey
      ? await this.prisma.client.customFieldValue.findMany({
          where: {
            entityType,
            fieldKey: groupByFieldKey,
            entityId: { in: entityIds }
          },
          select: {
            entityId: true,
            valueNumber: true,
            valueText: true,
            valueBool: true,
            valueDate: true,
            valueJson: true
          }
        })
      : [];

    const metricByEntity = new Map<string, number>();
    for (const row of metricValues) {
      const numeric = row.valueNumber !== null ? Number(row.valueNumber) : Number.NaN;
      if (Number.isFinite(numeric)) {
        metricByEntity.set(row.entityId, numeric);
      }
    }

    const groupByEntity = new Map<string, string>();
    for (const row of groupValues) {
      groupByEntity.set(row.entityId, this.stringifyValue(this.extractStoredValue(row)));
    }

    const metricNumbers = entityIds
      .map((id) => metricByEntity.get(id))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    let aggregate = 0;
    if (metricType === 'count') {
      aggregate = entityIds.length;
    } else if (metricType === 'sum') {
      aggregate = metricNumbers.reduce((sum, value) => sum + value, 0);
    } else if (metricType === 'avg') {
      aggregate = metricNumbers.length > 0 ? metricNumbers.reduce((sum, value) => sum + value, 0) / metricNumbers.length : 0;
    } else if (metricType === 'min') {
      aggregate = metricNumbers.length > 0 ? Math.min(...metricNumbers) : 0;
    } else if (metricType === 'max') {
      aggregate = metricNumbers.length > 0 ? Math.max(...metricNumbers) : 0;
    } else {
      throw new BadRequestException(`Unsupported metricType: ${metricType}`);
    }

    const grouped = new Map<string, { key: string; count: number; metric: number }>();
    for (const entityId of entityIds) {
      const groupKey = groupByFieldKey ? (groupByEntity.get(entityId) || '__UNSET__') : '__ALL__';
      const current = grouped.get(groupKey) ?? { key: groupKey, count: 0, metric: 0 };
      current.count += 1;
      if (metricType !== 'count') {
        current.metric += metricByEntity.get(entityId) ?? 0;
      }
      grouped.set(groupKey, current);
    }

    const groups = Array.from(grouped.values()).map((row) => ({
      key: row.key,
      count: row.count,
      value: metricType === 'count'
        ? row.count
        : metricType === 'avg'
          ? (row.count > 0 ? row.metric / row.count : 0)
          : row.metric
    }));

    return {
      entityType,
      metricType,
      metricFieldKey: metricFieldKey || null,
      groupByFieldKey: groupByFieldKey || null,
      matchedEntityCount: entityIds.length,
      aggregate,
      groups
    };
  }

  async saveOrQueryWidget(rawPayload: Record<string, unknown>) {
    const payload = this.toRecord(rawPayload);
    const mode = this.readString(payload.mode, 'save').toLowerCase();

    if (mode === 'query') {
      const widgetId = this.readString(payload.widgetId);
      const widgetName = this.readString(payload.name);
      const widget = await this.prisma.client.customFieldReportWidget.findFirst({
        where: {
          ...(widgetId ? { id: widgetId } : {}),
          ...(widgetId ? {} : widgetName ? { name: widgetName } : {})
        }
      });

      if (!widget) {
        throw new NotFoundException('Widget không tồn tại để query.');
      }

      const filters = this.toRecord(widget.filtersJson);
      const config = this.toRecord(widget.configJson);
      return this.queryReport({
        entityType: widget.entityType,
        metricType: widget.metricType,
        metricFieldKey: widget.metricFieldKey,
        groupByFieldKey: widget.groupByFieldKey,
        filters,
        ...config
      });
    }

    const entityType = this.normalizeEntityType(this.readString(payload.entityType));
    const chartType = this.normalizeWidgetChartType(payload.chartType);
    const metricType = this.readString(payload.metricType, 'count').toLowerCase();
    const name = this.readString(payload.name);
    const title = this.readString(payload.title, name || 'Custom Field Widget');
    if (!name) {
      throw new BadRequestException('Widget name là bắt buộc.');
    }

    const actor = this.resolveActorId();
    const id = this.readString(payload.id);

    if (id) {
      await this.prisma.client.customFieldReportWidget.updateMany({
        where: { id },
        data: {
          name,
          title,
          entityType,
          chartType,
          metricType,
          metricFieldKey: this.readString(payload.metricFieldKey) || null,
          groupByFieldKey: this.readString(payload.groupByFieldKey) || null,
          filtersJson: this.toDbJsonValue(this.toRecord(payload.filters)),
          configJson: this.toDbJsonValue(this.toRecord(payload.config)),
          isActive: this.toBool(payload.isActive, true),
          updatedBy: actor
        }
      });
      return this.prisma.client.customFieldReportWidget.findFirst({ where: { id } });
    }

    return this.prisma.client.customFieldReportWidget.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        name,
        title,
        entityType,
        chartType,
        metricType,
        metricFieldKey: this.readString(payload.metricFieldKey) || null,
        groupByFieldKey: this.readString(payload.groupByFieldKey) || null,
        filtersJson: this.toDbJsonValue(this.toRecord(payload.filters)),
        configJson: this.toDbJsonValue(this.toRecord(payload.config)),
        isActive: this.toBool(payload.isActive, true),
        createdBy: actor,
        updatedBy: actor
      }
    });
  }

  private async wrapArray(entityType: CustomFieldEntityType, rows: unknown[]) {
    const records = rows.map((item) => this.toRecord(item));
    const ids = records.map((record) => this.readString(record.id)).filter(Boolean);
    const schemaVersions = new Map<string, number | null>();

    for (const record of records) {
      const id = this.readString(record.id);
      if (!id) {
        continue;
      }
      schemaVersions.set(id, this.toPositiveInt(record.customFieldSchemaVersion));
    }

    const valueMap = await this.loadCustomFieldValueMap(entityType, ids, schemaVersions);

    return records.map((record) => {
      const id = this.readString(record.id);
      if (!id) {
        return record;
      }
      const base = this.omitKeys(record, new Set(['id', 'customFieldSchemaVersion']));
      return {
        id,
        schemaVersion: schemaVersions.get(id) ?? null,
        base,
        customFields: valueMap.get(id) ?? {}
      };
    });
  }

  private async loadCustomFieldValueMap(
    entityType: CustomFieldEntityType,
    entityIds: string[],
    schemaVersions: Map<string, number | null>
  ) {
    const output = new Map<string, Record<string, unknown>>();
    if (entityIds.length === 0) {
      return output;
    }

    const rows = await this.prisma.client.customFieldValue.findMany({
      where: {
        entityType,
        entityId: { in: entityIds }
      },
      orderBy: [{ updatedAt: 'desc' }]
    });

    for (const row of rows) {
      const expectedSchemaVersion = schemaVersions.get(row.entityId);
      if (expectedSchemaVersion !== null && expectedSchemaVersion !== undefined && row.schemaVersion !== expectedSchemaVersion) {
        continue;
      }

      const existing = output.get(row.entityId) ?? {};
      existing[row.fieldKey] = this.extractStoredValue(row);
      output.set(row.entityId, existing);
    }

    return output;
  }

  private extractStoredValue(row: {
    valueText: string | null;
    valueNumber: Prisma.Decimal | null;
    valueDate: Date | null;
    valueBool: boolean | null;
    valueJson: Prisma.JsonValue | null;
  }) {
    if (row.valueJson !== null) {
      return row.valueJson;
    }
    if (row.valueNumber !== null) {
      return Number(row.valueNumber);
    }
    if (row.valueDate !== null) {
      return row.valueDate.toISOString();
    }
    if (row.valueBool !== null) {
      return row.valueBool;
    }
    return row.valueText;
  }

  private async getPublishedSchema(entityType: CustomFieldEntityType, requestedVersion?: number) {
    const row = await this.prisma.client.customFieldSchemaVersion.findFirst({
      where: {
        entityType,
        ...(requestedVersion ? { version: requestedVersion } : {})
      },
      orderBy: [{ version: 'desc' }]
    });

    if (!row) {
      return null;
    }

    const snapshotRoot = this.toRecord(row.definitionSnapshotJson);
    const snapshotDefsRaw = Array.isArray(snapshotRoot.definitions) ? snapshotRoot.definitions : [];
    const definitions = snapshotDefsRaw
      .map((item) => {
        try {
          return this.normalizeDraftField(item, true);
        } catch {
          return null;
        }
      })
      .filter((item): item is DraftFieldInput => Boolean(item));

    if (definitions.length > 0) {
      return {
        version: row.version,
        definitions
      } satisfies PublishedSchema;
    }

    const fallback = await this.prisma.client.customFieldDefinition.findMany({
      where: {
        entityType,
        latestPublishedVersion: row.version
      }
    });

    return {
      version: row.version,
      definitions: fallback.map((item) => ({
        fieldKey: item.fieldKey,
        label: item.label,
        description: item.description ?? undefined,
        fieldType: item.fieldType,
        required: item.required,
        defaultValueJson: item.defaultValueJson as Prisma.InputJsonValue,
        optionsJson: item.optionsJson as Prisma.InputJsonValue,
        relationEntityType: item.relationEntityType,
        formulaExpression: item.formulaExpression,
        filterable: item.filterable,
        searchable: item.searchable,
        reportable: item.reportable,
        status: item.status
      }))
    };
  }

  private async resolveEntityIdsByTerms(entityType: CustomFieldEntityType, terms: FilterTerm[]) {
    const schema = await this.getPublishedSchema(entityType);
    if (!schema) {
      return [];
    }

    const definitions = new Map(schema.definitions.map((item) => [item.fieldKey, item]));

    let intersection: Set<string> | null = null;

    for (const term of terms) {
      const definition = definitions.get(term.fieldKey);
      if (!definition) {
        throw new BadRequestException(`Field '${term.fieldKey}' không tồn tại trong schema published.`);
      }
      if (!definition.filterable && !definition.searchable) {
        throw new BadRequestException(`Field '${term.fieldKey}' chưa bật filterable/searchable.`);
      }

      const where: Prisma.CustomFieldValueWhereInput = {
        entityType,
        fieldKey: term.fieldKey
      };

      this.applyWhereCondition(where, definition.fieldType, term.operator, term.rawValue);

      const rows = await this.prisma.client.customFieldValue.findMany({
        where,
        select: { entityId: true }
      });
      const currentSet = new Set<string>(rows.map((row) => row.entityId));

      if (!intersection) {
        intersection = currentSet;
      } else {
        const nextIntersection = new Set<string>();
        for (const entityId of intersection) {
          if (currentSet.has(entityId)) {
            nextIntersection.add(entityId);
          }
        }
        intersection = nextIntersection;
      }

      if (intersection.size === 0) {
        return [];
      }
    }

    return intersection ? Array.from(intersection) : [];
  }

  private applyWhereCondition(
    where: Prisma.CustomFieldValueWhereInput,
    fieldType: CustomFieldType,
    operator: FilterOperator,
    rawValue: unknown
  ) {
    const asArray = (value: unknown) => {
      if (Array.isArray(value)) {
        return value.map((item) => this.readString(item)).filter(Boolean);
      }
      const scalar = this.readString(value);
      if (!scalar) {
        return [];
      }
      return scalar.split(',').map((item) => item.trim()).filter(Boolean);
    };

    if (fieldType === CustomFieldType.NUMBER || fieldType === CustomFieldType.FORMULA) {
      const number = this.toNumber(rawValue);
      if (operator === 'in') {
        const values = asArray(rawValue)
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item));
        (where as any).valueNumber = { in: values };
        return;
      }
      (where as any).valueNumber = this.buildScalarFilter(operator, number);
      return;
    }

    if (fieldType === CustomFieldType.DATE || fieldType === CustomFieldType.DATETIME) {
      const dateValue = this.parseDate(rawValue, 'filter');
      if (operator === 'in') {
        const values = asArray(rawValue).map((item) => this.parseDate(item, 'filter'));
        (where as any).valueDate = { in: values };
        return;
      }
      (where as any).valueDate = this.buildScalarFilter(operator, dateValue);
      return;
    }

    if (fieldType === CustomFieldType.BOOLEAN) {
      const boolValue = this.toBool(rawValue, false);
      if (operator === 'in') {
        const values = asArray(rawValue).map((item) => this.toBool(item, false));
        (where as any).valueBool = { in: values };
        return;
      }
      (where as any).valueBool = { equals: boolValue };
      return;
    }

    if (operator === 'in') {
      (where as any).valueText = { in: asArray(rawValue) };
      return;
    }
    if (operator === 'contains') {
      (where as any).valueText = { contains: this.readString(rawValue), mode: 'insensitive' };
      return;
    }
    (where as any).valueText = this.buildScalarFilter(operator, this.readString(rawValue));
  }

  private buildScalarFilter(operator: FilterOperator, value: Date | number | string) {
    switch (operator) {
      case 'eq':
        return { equals: value };
      case 'gt':
        return { gt: value };
      case 'gte':
        return { gte: value };
      case 'lt':
        return { lt: value };
      case 'lte':
        return { lte: value };
      case 'contains':
        return { contains: value };
      default:
        return { equals: value };
    }
  }

  private parseFilterTerms(raw: Record<string, unknown>, requireCfPrefix: boolean) {
    const terms: FilterTerm[] = [];

    for (const [rawKey, rawValue] of Object.entries(raw)) {
      if (requireCfPrefix && !rawKey.startsWith('cf.')) {
        continue;
      }

      const withoutPrefix = requireCfPrefix ? rawKey.slice(3) : rawKey;
      const key = this.readString(withoutPrefix);
      if (!key) {
        continue;
      }

      const parts = key.split('.').filter(Boolean);
      if (parts.length === 0) {
        continue;
      }

      let operator: FilterOperator = 'eq';
      let fieldKey = key;
      const candidateOperator = parts[parts.length - 1] as FilterOperator;
      if (FILTER_OPERATORS.has(candidateOperator) && parts.length > 1) {
        operator = candidateOperator;
        fieldKey = parts.slice(0, -1).join('.');
      }

      terms.push({
        fieldKey,
        operator,
        rawValue
      });
    }

    return terms;
  }

  private async upsertEntityFieldValues(
    entityType: CustomFieldEntityType,
    entityId: string,
    schema: PublishedSchema,
    customFieldsRaw: Record<string, unknown>
  ) {
    const customFields = this.toRecord(customFieldsRaw);
    const definitions = new Map(schema.definitions.map((item) => [item.fieldKey, item]));

    for (const key of Object.keys(customFields)) {
      if (!definitions.has(key)) {
        throw new BadRequestException(`Field '${key}' không có trong schema version ${schema.version}.`);
      }
    }

    const existingRows = await this.prisma.client.customFieldValue.findMany({
      where: {
        entityType,
        entityId
      }
    });

    const mergedContext: Record<string, unknown> = {};
    for (const row of existingRows) {
      mergedContext[row.fieldKey] = this.extractStoredValue(row);
    }

    for (const [fieldKey, rawValue] of Object.entries(customFields)) {
      const definition = definitions.get(fieldKey);
      if (!definition) {
        continue;
      }
      mergedContext[fieldKey] = this.normalizeReadableValue(definition, rawValue);
    }

    for (const definition of schema.definitions) {
      if (definition.fieldType === CustomFieldType.FORMULA && definition.formulaExpression) {
        mergedContext[definition.fieldKey] = this.evaluateFormula(definition.formulaExpression, mergedContext);
      }
    }

    const actor = this.resolveActorId();

    const fieldsToPersist = new Set<string>([
      ...Object.keys(customFields),
      ...schema.definitions.filter((item) => item.fieldType === CustomFieldType.FORMULA && Boolean(item.formulaExpression)).map((item) => item.fieldKey)
    ]);

    for (const fieldKey of fieldsToPersist) {
      const definition = definitions.get(fieldKey);
      if (!definition) {
        continue;
      }

      const normalized = await this.normalizeStorageValue(definition, mergedContext[fieldKey]);

      await this.prisma.client.customFieldValue.upsert({
        where: {
          tenant_Id_entityType_entityId_fieldKey: {
            tenant_Id: this.prisma.getTenantId(),
            entityType,
            entityId,
            fieldKey
          }
        },
        create: {
          tenant_Id: this.prisma.getTenantId(),
          entityType,
          entityId,
          fieldKey,
          schemaVersion: schema.version,
          valueText: normalized.valueText,
          valueNumber: normalized.valueNumber,
          valueDate: normalized.valueDate,
          valueBool: normalized.valueBool,
          valueJson: this.toDbJsonValue(normalized.valueJson),
          valueSource: normalized.valueSource,
          createdBy: actor,
          updatedBy: actor
        },
        update: {
          schemaVersion: schema.version,
          valueText: normalized.valueText,
          valueNumber: normalized.valueNumber,
          valueDate: normalized.valueDate,
          valueBool: normalized.valueBool,
          valueJson: this.toDbJsonValue(normalized.valueJson),
          valueSource: normalized.valueSource,
          updatedBy: actor
        }
      });
    }
  }

  private normalizeReadableValue(definition: DraftFieldInput, rawValue: unknown) {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    if (definition.fieldType === CustomFieldType.NUMBER || definition.fieldType === CustomFieldType.FORMULA) {
      const numeric = this.toNumber(rawValue);
      if (!Number.isFinite(numeric)) {
        throw new BadRequestException(`Field '${definition.fieldKey}' phải là số.`);
      }
      return numeric;
    }

    if (definition.fieldType === CustomFieldType.BOOLEAN) {
      return this.toBool(rawValue, false);
    }

    if (definition.fieldType === CustomFieldType.DATE || definition.fieldType === CustomFieldType.DATETIME) {
      return this.parseDate(rawValue, definition.fieldKey).toISOString();
    }

    if (definition.fieldType === CustomFieldType.MULTISELECT) {
      if (!Array.isArray(rawValue)) {
        throw new BadRequestException(`Field '${definition.fieldKey}' phải là mảng.`);
      }
      const values = rawValue.map((item) => this.readString(item)).filter(Boolean);
      return this.normalizeSelectOptionValues(definition, values);
    }

    if (definition.fieldType === CustomFieldType.SELECT) {
      const value = this.readString(rawValue);
      const normalizedValues = this.normalizeSelectOptionValues(definition, [value]);
      return normalizedValues[0] ?? null;
    }

    if (definition.fieldType === CustomFieldType.RELATION) {
      const relationId = this.readString(rawValue);
      if (!relationId) {
        return null;
      }
      return relationId;
    }

    return this.readString(rawValue);
  }

  private async normalizeStorageValue(definition: DraftFieldInput, rawValue: unknown): Promise<ValuePayload> {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return {
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueBool: null,
        valueJson: null,
        valueSource: definition.fieldType === CustomFieldType.FORMULA ? 'FORMULA' : 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.NUMBER || definition.fieldType === CustomFieldType.FORMULA) {
      const value = this.toNumber(rawValue);
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Field '${definition.fieldKey}' phải là số hợp lệ.`);
      }
      return {
        valueText: null,
        valueNumber: new Prisma.Decimal(value),
        valueDate: null,
        valueBool: null,
        valueJson: null,
        valueSource: definition.fieldType === CustomFieldType.FORMULA ? 'FORMULA' : 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.BOOLEAN) {
      return {
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueBool: this.toBool(rawValue, false),
        valueJson: null,
        valueSource: 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.DATE || definition.fieldType === CustomFieldType.DATETIME) {
      return {
        valueText: null,
        valueNumber: null,
        valueDate: this.parseDate(rawValue, definition.fieldKey),
        valueBool: null,
        valueJson: null,
        valueSource: 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.MULTISELECT) {
      if (!Array.isArray(rawValue)) {
        throw new BadRequestException(`Field '${definition.fieldKey}' phải là mảng.`);
      }
      const values = this.normalizeSelectOptionValues(
        definition,
        rawValue.map((item) => this.readString(item)).filter(Boolean)
      );
      return {
        valueText: values.join(','),
        valueNumber: null,
        valueDate: null,
        valueBool: null,
        valueJson: values as Prisma.InputJsonValue,
        valueSource: 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.SELECT) {
      const value = this.normalizeSelectOptionValues(definition, [this.readString(rawValue)])[0] ?? '';
      return {
        valueText: value,
        valueNumber: null,
        valueDate: null,
        valueBool: null,
        valueJson: null,
        valueSource: 'MANUAL'
      };
    }

    if (definition.fieldType === CustomFieldType.RELATION) {
      const relationEntity = definition.relationEntityType;
      if (!relationEntity) {
        throw new BadRequestException(`Field '${definition.fieldKey}' thiếu relationEntityType.`);
      }
      const relationId = this.readString(rawValue);
      if (!relationId) {
        return {
          valueText: null,
          valueNumber: null,
          valueDate: null,
          valueBool: null,
          valueJson: null,
          valueSource: 'MANUAL'
        };
      }
      await this.ensureEntityExists(relationEntity, relationId);
      return {
        valueText: relationId,
        valueNumber: null,
        valueDate: null,
        valueBool: null,
        valueJson: null,
        valueSource: 'MANUAL'
      };
    }

    return {
      valueText: this.readString(rawValue),
      valueNumber: null,
      valueDate: null,
      valueBool: null,
      valueJson: null,
      valueSource: 'MANUAL'
    };
  }

  private evaluateFormula(expressionRaw: string, context: Record<string, unknown>) {
    const expression = String(expressionRaw ?? '').trim();
    if (!expression) {
      return null;
    }

    const tokenized = expression.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (token) => {
      const value = context[token];
      const number = typeof value === 'number' ? value : Number(value ?? 0);
      return Number.isFinite(number) ? String(number) : '0';
    });

    if (!/^[0-9+\-*/().\s]+$/.test(tokenized)) {
      throw new BadRequestException('Formula expression chỉ hỗ trợ + - * / ( ) và field numeric cùng record.');
    }

    // eslint-disable-next-line no-new-func
    const computed = Function(`return (${tokenized});`)() as unknown;
    const number = Number(computed);
    if (!Number.isFinite(number)) {
      return null;
    }
    return number;
  }

  private async ensureEntityExists(entityType: CustomFieldEntityType, entityId: string) {
    const delegate = this.resolveEntityDelegate(entityType);
    const row = await delegate.findFirst({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw new NotFoundException(`Entity '${entityType}' với id '${entityId}' không tồn tại.`);
    }
  }

  private async listEntityIds(entityType: CustomFieldEntityType, limit: number) {
    const delegate = this.resolveEntityDelegate(entityType);
    const rows = await delegate.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return rows
      .map((row) => this.readString(row.id))
      .filter((id) => Boolean(id));
  }

  private async updateEntitySchemaVersion(entityType: CustomFieldEntityType, entityId: string, schemaVersion: number | null) {
    const delegate = this.resolveEntityDelegate(entityType);
    await delegate.updateMany({
      where: { id: entityId },
      data: {
        customFieldSchemaVersion: schemaVersion
      }
    });
  }

  private resolveEntityDelegate(entityType: CustomFieldEntityType): {
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  } {
    switch (entityType) {
      case CustomFieldEntityType.CUSTOMER:
        return this.prisma.client.customer as any;
      case CustomFieldEntityType.PRODUCT:
        return this.prisma.client.product as any;
      case CustomFieldEntityType.EMPLOYEE:
        return this.prisma.client.employee as any;
      case CustomFieldEntityType.SALES_ORDER:
        return this.prisma.client.order as any;
      case CustomFieldEntityType.PURCHASE_ORDER:
        return this.prisma.client.purchaseOrder as any;
      case CustomFieldEntityType.INVOICE:
        return this.prisma.client.invoice as any;
      case CustomFieldEntityType.PROJECT:
        return this.prisma.client.project as any;
      case CustomFieldEntityType.HR_EVENT:
        return this.prisma.client.hrEvent as any;
      case CustomFieldEntityType.WORKFLOW_DEFINITION:
        return this.prisma.client.workflowDefinition as any;
      case CustomFieldEntityType.SERVICE_CONTRACT:
        return this.prisma.client.serviceContract as any;
      case CustomFieldEntityType.VEHICLE:
        return this.prisma.client.vehicle as any;
      case CustomFieldEntityType.INSURANCE_POLICY:
        // Map insurance policy custom fields to ServiceContract (insurance contracts only).
        return this.prisma.client.serviceContract as any;
      default:
        throw new BadRequestException(`Unsupported entityType: ${entityType}`);
    }
  }

  private normalizeDraftField(raw: unknown, allowPublished = false): DraftFieldInput {
    const item = this.toRecord(raw);
    const fieldKey = this.readString(item.fieldKey);
    if (!FIELD_KEY_PATTERN.test(fieldKey)) {
      throw new BadRequestException(`fieldKey '${fieldKey}' không hợp lệ. Dùng mẫu namespace__field_key.`);
    }

    const fieldType = this.normalizeFieldType(item.fieldType);
    const status = this.normalizeLifecycleStatus(item.status, allowPublished ? CustomFieldLifecycleStatus.ACTIVE : CustomFieldLifecycleStatus.DRAFT);

    const relationEntityType = item.relationEntityType
      ? this.normalizeEntityType(this.readString(item.relationEntityType))
      : null;

    const formulaExpression = this.readString(item.formulaExpression) || null;

    if (fieldType === CustomFieldType.RELATION && !relationEntityType) {
      throw new BadRequestException(`Field '${fieldKey}' kiểu RELATION bắt buộc relationEntityType.`);
    }

    if (fieldType === CustomFieldType.FORMULA && !formulaExpression) {
      throw new BadRequestException(`Field '${fieldKey}' kiểu FORMULA bắt buộc formulaExpression.`);
    }

    const options = this.normalizeOptions(item.options);
    if ((fieldType === CustomFieldType.SELECT || fieldType === CustomFieldType.MULTISELECT) && options.length === 0) {
      throw new BadRequestException(`Field '${fieldKey}' kiểu ${fieldType} phải có options.`);
    }

    return {
      fieldKey,
      label: this.readString(item.label, fieldKey),
      description: this.readString(item.description) || undefined,
      fieldType,
      required: this.toBool(item.required, false),
      defaultValueJson: this.toNullableJson(item.defaultValue),
      optionsJson: options.length > 0 ? (options as Prisma.InputJsonValue) : null,
      relationEntityType,
      formulaExpression,
      filterable: this.toBool(item.filterable, false),
      searchable: this.toBool(item.searchable, false),
      reportable: this.toBool(item.reportable, false),
      status
    };
  }

  private normalizeFieldType(raw: unknown) {
    const value = this.readString(raw).toUpperCase();
    if ((Object.values(CustomFieldType) as string[]).includes(value)) {
      return value as CustomFieldType;
    }
    throw new BadRequestException(`Unsupported fieldType: ${raw}`);
  }

  private normalizeLifecycleStatus(raw: unknown, fallback: CustomFieldLifecycleStatus) {
    const value = this.readString(raw, fallback).toUpperCase();
    if ((Object.values(CustomFieldLifecycleStatus) as string[]).includes(value)) {
      return value as CustomFieldLifecycleStatus;
    }
    throw new BadRequestException(`Unsupported field status: ${raw}`);
  }

  private normalizeWidgetChartType(raw: unknown) {
    const value = this.readString(raw, CustomFieldWidgetChartType.TABLE).toUpperCase();
    if ((Object.values(CustomFieldWidgetChartType) as string[]).includes(value)) {
      return value as CustomFieldWidgetChartType;
    }
    throw new BadRequestException(`Unsupported chartType: ${raw}`);
  }

  private normalizeOptions(raw: unknown) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const deduped = new Map<string, CustomFieldOptionRow>();

    raw.forEach((entry, index) => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        const key = this.normalizeOptionKey(label);
        if (!key) {
          return;
        }
        if (deduped.has(key)) {
          return;
        }
        deduped.set(key, {
          key,
          label: label || key,
          order: index + 1
        });
        return;
      }

      if (!this.isPlainObject(entry)) {
        return;
      }

      const record = this.toRecord(entry);
      const keyCandidate = this.readString(record.key || record.value || record.id || record.code);
      const labelCandidate = this.readString(record.label || record.name || record.title || keyCandidate);
      const key = this.normalizeOptionKey(keyCandidate || labelCandidate);
      if (!key) {
        return;
      }
      if (deduped.has(key)) {
        return;
      }

      deduped.set(key, {
        key,
        label: labelCandidate || key,
        order: this.toInt(record.order ?? record.position ?? record.rank, index + 1, 1, 10_000)
      });
    });

    return [...deduped.values()].sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.label.localeCompare(right.label);
    });
  }

  private isDefinitionChanged(current: {
    label: string;
    description: string | null;
    fieldType: CustomFieldType;
    required: boolean;
    defaultValueJson: Prisma.JsonValue | null;
    optionsJson: Prisma.JsonValue | null;
    relationEntityType: CustomFieldEntityType | null;
    formulaExpression: string | null;
    filterable: boolean;
    searchable: boolean;
    reportable: boolean;
    status: CustomFieldLifecycleStatus;
  }, next: DraftFieldInput) {
    return JSON.stringify({
      label: current.label,
      description: current.description,
      fieldType: current.fieldType,
      required: current.required,
      defaultValueJson: current.defaultValueJson,
      optionsJson: current.optionsJson,
      relationEntityType: current.relationEntityType,
      formulaExpression: current.formulaExpression,
      filterable: current.filterable,
      searchable: current.searchable,
      reportable: current.reportable,
      status: current.status
    }) !== JSON.stringify({
      label: next.label,
      description: next.description ?? null,
      fieldType: next.fieldType,
      required: next.required,
      defaultValueJson: next.defaultValueJson,
      optionsJson: next.optionsJson,
      relationEntityType: next.relationEntityType,
      formulaExpression: next.formulaExpression,
      filterable: next.filterable,
      searchable: next.searchable,
      reportable: next.reportable,
      status: next.status
    });
  }

  private buildIndexName(entityType: CustomFieldEntityType, fieldKey: string) {
    const compact = `${entityType.toLowerCase()}_${fieldKey.toLowerCase()}`.replace(/[^a-z0-9_]/g, '_').slice(0, 48);
    return `cf_idx_${compact}`;
  }

  private normalizeSelectOptionValues(definition: DraftFieldInput, values: string[]) {
    const options = this.normalizeOptions(definition.optionsJson);
    if (options.length === 0 || values.length === 0) {
      return values.filter(Boolean);
    }

    const keyMap = new Map(options.map((item) => [item.key, item.key]));
    const labelMap = new Map(options.map((item) => [item.label.toLowerCase(), item.key]));
    const normalizedValues: string[] = [];

    for (const rawValue of values) {
      const value = this.readString(rawValue);
      if (!value) {
        continue;
      }
      const matchedKey = keyMap.get(value) ?? labelMap.get(value.toLowerCase());
      if (!matchedKey) {
        throw new BadRequestException(`Giá trị '${value}' không nằm trong options của '${definition.fieldKey}'.`);
      }
      if (!normalizedValues.includes(matchedKey)) {
        normalizedValues.push(matchedKey);
      }
    }

    return normalizedValues;
  }

  private normalizeOptionKey(raw: unknown) {
    const normalized = this.readString(raw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized;
  }

  private resolveActorId() {
    const authRaw = this.cls.get<AuthUser | undefined>(AUTH_USER_CONTEXT_KEY);
    const auth = authRaw && typeof authRaw === 'object' ? authRaw : undefined;
    return this.readString(auth?.userId ?? auth?.sub ?? auth?.email ?? 'system');
  }

  private stringifyValue(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '__UNSET__';
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toNullableJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (Array.isArray(value)) {
      return value as Prisma.InputJsonValue;
    }
    if (this.isPlainObject(value)) {
      return value as Prisma.InputJsonValue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value as Prisma.InputJsonValue;
    }
    return null;
  }

  private toDbJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    const normalized = this.toNullableJson(value);
    return normalized === null ? Prisma.DbNull : normalized;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private omitKeys(source: Record<string, unknown>, keys: Set<string>) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!keys.has(key)) {
        output[key] = value;
      }
    }
    return output;
  }

  private readString(value: unknown, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  private toPositiveInt(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`schemaVersion không hợp lệ: ${value}`);
    }
    return Math.trunc(parsed);
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private toNumber(value: unknown) {
    return Number(value);
  }

  private parseDate(value: unknown, fieldName: string) {
    const date = new Date(String(value ?? ''));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date for ${fieldName}`);
    }
    return date;
  }
}
