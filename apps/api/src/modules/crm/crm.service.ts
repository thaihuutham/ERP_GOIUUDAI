import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { CustomerCareStatus, CustomerZaloNickType, GenericStatus, Prisma, ServiceContractProductType, ServiceContractStatus, UserRole, VehicleKind } from '@prisma/client';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildCursorListResponse,
  resolvePageLimit,
  resolveSortQuery,
  sliceCursorItems
} from '../../common/pagination/pagination-response';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { assertValidVietnamPhone, normalizeVietnamPhone } from '../../common/validation/phone.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { IamScopeFilterService } from '../iam/iam-scope-filter.service';
import { SearchService } from '../search/search.service';

type CustomerImportError = {
  rowIndex: number;
  identifier?: string;
  message: string;
};

type CustomerImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: CustomerImportError[];
};

type CustomerImportPreviewSummary = {
  totalRows: number;
  validRows: number;
  wouldCreateCount: number;
  wouldUpdateCount: number;
  skippedCount: number;
  errors: CustomerImportError[];
};

type CustomerImportUpsertResult = {
  operation: 'create' | 'update';
  customerId?: string;
};

type CustomerSavedFilterLogic = 'AND' | 'OR';
type CustomerSavedFilterField =
  | 'fullName'
  | 'phone'
  | 'email'
  | 'customerStage'
  | 'source'
  | 'status'
  | 'zaloNickType'
  | 'segment'
  | 'tags'
  | 'lastContactAt'
  | 'updatedAt'
  | 'contractPackageNames'
  | 'contractProductTypes'
  | 'nextContractExpiryAt'
  | 'contractServicePhones'
  | 'vehicleKinds'
  | 'vehicleTypes'
  | 'vehiclePlateNumbers'
  | 'insuranceExpiryDates'
  | 'insurancePolicyNumbers'
  | 'digitalServiceNames';
type CustomerSavedFilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'before'
  | 'after'
  | 'on'
  | 'between'
  | 'has'
  | 'not_has';

type CustomerSavedFilterCondition = {
  field: CustomerSavedFilterField;
  operator: CustomerSavedFilterOperator;
  value?: string;
  valueTo?: string;
};

type CustomerSavedFilter = {
  id: string;
  name: string;
  logic: CustomerSavedFilterLogic;
  conditions: CustomerSavedFilterCondition[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type CustomerSavedFiltersStore = {
  version: 1;
  defaultFilterId: string | null;
  filters: CustomerSavedFilter[];
};

type CustomerQueryFilter = {
  logic: CustomerSavedFilterLogic;
  conditions: CustomerSavedFilterCondition[];
};

const CUSTOMER_FILTER_STORE_VERSION = 1 as const;
const CUSTOMER_FILTER_STORE_KEY_PREFIX = 'crm.customers.filters.v1.';

const CUSTOMER_FILTER_FIELD_OPERATORS: Record<CustomerSavedFilterField, CustomerSavedFilterOperator[]> = {
  fullName: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  phone: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  email: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  customerStage: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  source: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  status: ['equals', 'not_equals'],
  zaloNickType: ['equals', 'not_equals'],
  segment: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  tags: ['has', 'not_has'],
  lastContactAt: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
  updatedAt: ['before', 'after', 'on', 'between'],
  contractPackageNames: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  contractProductTypes: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  nextContractExpiryAt: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
  contractServicePhones: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  vehicleKinds: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  vehicleTypes: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  vehiclePlateNumbers: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  insuranceExpiryDates: ['before', 'after', 'on', 'between', 'is_empty', 'is_not_empty'],
  insurancePolicyNumbers: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  digitalServiceNames: ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
};

@Injectable()
export class CrmService {
  private readonly customerSortableFields = [
    'updatedAt',
    'createdAt',
    'fullName',
    'phone',
    'customerStage',
    'source',
    'status',
    'lastContactAt',
    'totalSpent',
    'totalOrders',
    'id'
  ] as const;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Optional() @Inject(IamScopeFilterService) private readonly iamScopeFilter?: IamScopeFilterService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService
  ) {}

  async listCustomerSavedFilters() {
    const store = await this.loadCustomerSavedFiltersStore();
    return {
      items: [...store.filters].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      defaultFilterId: store.defaultFilterId ?? null,
    };
  }

  async upsertCustomerSavedFilter(payload: Record<string, unknown>) {
    const mutation = this.parseCustomerSavedFilterMutation(payload);
    const store = await this.loadCustomerSavedFiltersStore();
    const now = new Date().toISOString();

    if (mutation.id) {
      const currentIndex = store.filters.findIndex((item) => item.id === mutation.id);
      if (currentIndex < 0) {
        throw new NotFoundException('Không tìm thấy bộ lọc CRM để cập nhật.');
      }

      const current = store.filters[currentIndex];
      const nextName = mutation.name ?? current.name;
      const nextLogic = mutation.logic ?? current.logic;
      const nextConditions = mutation.conditions ?? current.conditions;

      if (!nextName) {
        throw new BadRequestException('Tên bộ lọc CRM không được để trống.');
      }
      if (!nextConditions || nextConditions.length === 0) {
        throw new BadRequestException('Bộ lọc CRM cần ít nhất 1 điều kiện.');
      }

      const next: CustomerSavedFilter = {
        ...current,
        name: nextName,
        logic: nextLogic,
        conditions: nextConditions,
        updatedAt: now,
      };
      store.filters[currentIndex] = next;

      if (mutation.isDefault === true) {
        store.defaultFilterId = next.id;
      } else if (mutation.isDefault === false && store.defaultFilterId === next.id) {
        store.defaultFilterId = null;
      }
    } else {
      if (!mutation.name) {
        throw new BadRequestException('Thiếu tên bộ lọc CRM.');
      }
      if (!mutation.conditions || mutation.conditions.length === 0) {
        throw new BadRequestException('Bộ lọc CRM cần ít nhất 1 điều kiện.');
      }

      const created: CustomerSavedFilter = {
        id: randomUUID(),
        name: mutation.name,
        logic: mutation.logic ?? 'AND',
        conditions: mutation.conditions,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
      store.filters.unshift(created);
      if (mutation.isDefault === true) {
        store.defaultFilterId = created.id;
      }
    }

    store.filters = this.applyCustomerSavedFilterDefaultState(store.filters, store.defaultFilterId);
    await this.saveCustomerSavedFiltersStore(store);

    const item = mutation.id
      ? store.filters.find((filter) => filter.id === mutation.id) ?? null
      : store.filters[0] ?? null;
    return {
      item,
      items: [...store.filters].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      defaultFilterId: store.defaultFilterId ?? null,
    };
  }

  async deleteCustomerSavedFilter(id: string) {
    const normalizedId = this.cleanString(id);
    if (!normalizedId) {
      throw new BadRequestException('Thiếu ID bộ lọc CRM cần xóa.');
    }

    const store = await this.loadCustomerSavedFiltersStore();
    const existing = store.filters.find((item) => item.id === normalizedId);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy bộ lọc CRM để xóa.');
    }

    store.filters = store.filters.filter((item) => item.id !== normalizedId);
    if (store.defaultFilterId === normalizedId) {
      store.defaultFilterId = null;
    }

    store.filters = this.applyCustomerSavedFilterDefaultState(store.filters, store.defaultFilterId);
    await this.saveCustomerSavedFiltersStore(store);
    return {
      items: [...store.filters].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      defaultFilterId: store.defaultFilterId ?? null,
    };
  }

  async listCustomers(
    query: PaginationQueryDto,
    filters: { status?: CustomerCareStatus | 'ALL'; stage?: string; tag?: string; customFilter?: unknown } = {},
    entityIds?: string[]
  ) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.customerSortableFields,
      defaultSortBy: 'updatedAt',
      defaultSortDir: 'desc',
      errorLabel: 'crm/customers'
    });
    const keyword = query.q?.trim();
    const normalizedTag = this.cleanString(filters.tag).toLowerCase();
    const customFilter = this.parseCustomerQueryFilter(filters.customFilter);
    const baseWhereClauses: Prisma.CustomerWhereInput[] = [];
    if (Array.isArray(entityIds)) {
      baseWhereClauses.push({ id: { in: entityIds } });
    }

    const scopeFilter = await this.resolveCustomerScopeFilter();
    if (!scopeFilter.companyWide) {
      if (scopeFilter.actorIds.length === 0) {
        baseWhereClauses.push({ id: { in: [] } });
      } else {
        baseWhereClauses.push({ ownerStaffId: { in: scopeFilter.actorIds } });
      }
    }

    let normalizedStage: string | undefined;
    if (filters.stage) {
      const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
      normalizedStage = this.resolveCustomerTaxonomyValue(
        this.cleanString(filters.stage),
        salesPolicy.customerTaxonomy.stages,
        'customerStage'
      );
    }
    const normalizedStatus = filters.status && filters.status !== 'ALL' ? filters.status : undefined;

    if (normalizedStatus) {
      baseWhereClauses.push({ status: normalizedStatus });
    }

    if (normalizedStage) {
      baseWhereClauses.push({ customerStage: normalizedStage });
    }

    if (normalizedTag) {
      baseWhereClauses.push({ tags: { has: normalizedTag } });
    }

    if (customFilter) {
      baseWhereClauses.push(this.buildCustomerCustomFilterWhere(customFilter));
    }

    const baseWhere = this.combineCustomerWhereClauses(baseWhereClauses);

    if (keyword && !customFilter && sortBy === 'updatedAt' && await this.search.shouldUseHybridSearch(keyword, query.cursor)) {
      const rankedIds = await this.search.searchCustomerIds(
        keyword,
        this.prisma.getTenantId(),
        take + 1,
        {
          status: normalizedStatus,
          stage: normalizedStage,
          tag: normalizedTag || undefined
        }
      );

      if (rankedIds !== null) {
        const lookupIds = rankedIds.slice(0, take + 1);
        const rankedRows = lookupIds.length > 0
          ? await this.prisma.client.customer.findMany({
              where: this.combineCustomerWhereClauses([
                baseWhere,
                { id: { in: lookupIds } },
              ]),
            })
          : [];

        const orderedRows = this.rankByIds(rankedRows, lookupIds);
        const { items, hasMore, nextCursor } = sliceCursorItems(orderedRows, take);
        const enrichedItems = await this.enrichCustomerListRows(items);
        return buildCursorListResponse(enrichedItems, {
          limit: take,
          hasMore,
          nextCursor,
          sortBy,
          sortDir,
          sortableFields,
          consistency: 'snapshot'
        });
      }
    }

    const keywordWhere = keyword
      ? {
          OR: [
            { fullName: { contains: keyword, mode: 'insensitive' as const } },
            { email: { contains: keyword, mode: 'insensitive' as const } },
            { phone: { contains: keyword } },
          ],
        }
      : null;
    const finalWhere = this.combineCustomerWhereClauses([
      baseWhere,
      ...(keywordWhere ? [keywordWhere] : []),
    ]);

    const rows = await this.prisma.client.customer.findMany({
      where: finalWhere,
      orderBy: this.buildCustomerSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    const enrichedItems = await this.enrichCustomerListRows(items);

    return buildCursorListResponse(enrichedItems, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  private buildCustomerSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.CustomerOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.CustomerOrderByWithRelationInput[];
  }

  private async enrichCustomerListRows<T extends { id: string | number }>(rows: T[]) {
    if (rows.length === 0) {
      return rows;
    }

    const customerIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.id ?? '').trim())
          .filter(Boolean)
      )
    );
    if (customerIds.length === 0) {
      return rows;
    }

    const [contracts, vehicles, contractCounts, activeContractCounts, nextActiveExpiries, vehicleCounts] = await Promise.all([
      this.prisma.client.serviceContract.findMany({
        where: {
          customerId: { in: customerIds },
        },
        orderBy: [{ endsAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          customerId: true,
          productType: true,
          endsAt: true,
          telecomLine: {
            select: {
              packageName: true,
              servicePhone: true,
              currentExpiryAt: true,
            }
          },
          autoInsuranceDetail: {
            select: {
              policyToAt: true,
              soGCN: true,
            }
          },
          motoInsuranceDetail: {
            select: {
              policyToAt: true,
              soGCN: true,
            }
          },
          digitalServiceDetail: {
            select: {
              serviceName: true,
              planName: true,
              provider: true,
            }
          },
        }
      }),
      this.prisma.client.vehicle.findMany({
        where: {
          ownerCustomerId: { in: customerIds },
          status: GenericStatus.ACTIVE,
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          ownerCustomerId: true,
          vehicleKind: true,
          vehicleType: true,
          plateNumber: true,
        }
      }),
      this.prisma.client.serviceContract.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
        },
        _count: {
          _all: true,
        }
      }),
      this.prisma.client.serviceContract.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          status: ServiceContractStatus.ACTIVE,
        },
        _count: {
          _all: true,
        }
      }),
      this.prisma.client.serviceContract.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          status: ServiceContractStatus.ACTIVE,
          endsAt: {
            gte: new Date(),
          }
        },
        _min: {
          endsAt: true,
        }
      }),
      this.prisma.client.vehicle.groupBy({
        by: ['ownerCustomerId'],
        where: {
          ownerCustomerId: { in: customerIds },
          status: GenericStatus.ACTIVE,
        },
        _count: {
          _all: true,
        }
      }),
    ]);

    type RelatedSnapshot = {
      packageNames: Set<string>;
      servicePhones: Set<string>;
      productTypes: Set<string>;
      contractExpiryDates: Set<string>;
      telecomExpiryDates: Set<string>;
      digitalServices: Set<string>;
      insuranceExpiryDates: Set<string>;
      autoInsuranceExpiryDates: Set<string>;
      motoInsuranceExpiryDates: Set<string>;
      insurancePolicyNumbers: Set<string>;
      vehicleTypes: Set<string>;
      vehicleKinds: Set<string>;
      vehiclePlateNumbers: Set<string>;
    };

    const snapshotByCustomer = new Map<string, RelatedSnapshot>();
    const ensureSnapshot = (customerId: string) => {
      const existing = snapshotByCustomer.get(customerId);
      if (existing) {
        return existing;
      }
      const created: RelatedSnapshot = {
        packageNames: new Set<string>(),
        servicePhones: new Set<string>(),
        productTypes: new Set<string>(),
        contractExpiryDates: new Set<string>(),
        telecomExpiryDates: new Set<string>(),
        digitalServices: new Set<string>(),
        insuranceExpiryDates: new Set<string>(),
        autoInsuranceExpiryDates: new Set<string>(),
        motoInsuranceExpiryDates: new Set<string>(),
        insurancePolicyNumbers: new Set<string>(),
        vehicleTypes: new Set<string>(),
        vehicleKinds: new Set<string>(),
        vehiclePlateNumbers: new Set<string>(),
      };
      snapshotByCustomer.set(customerId, created);
      return created;
    };

    for (const contract of contracts) {
      const customerId = String(contract.customerId ?? '').trim();
      if (!customerId) continue;
      const snapshot = ensureSnapshot(customerId);
      snapshot.productTypes.add(String(contract.productType));
      const contractExpiryDate = this.toCompactDateString(contract.endsAt);
      if (contractExpiryDate) {
        snapshot.contractExpiryDates.add(contractExpiryDate);
      }

      if (contract.telecomLine) {
        const packageName = this.cleanString(contract.telecomLine.packageName);
        const servicePhone = this.cleanString(contract.telecomLine.servicePhone);
        if (packageName) {
          snapshot.packageNames.add(packageName);
        }
        if (servicePhone) {
          snapshot.servicePhones.add(servicePhone);
        }
        const telecomExpiryDate = this.toCompactDateString(contract.telecomLine.currentExpiryAt);
        if (telecomExpiryDate) {
          snapshot.telecomExpiryDates.add(telecomExpiryDate);
        }
      }

      if (contract.autoInsuranceDetail) {
        const autoExpiryDate = this.toCompactDateString(contract.autoInsuranceDetail.policyToAt);
        if (autoExpiryDate) {
          snapshot.autoInsuranceExpiryDates.add(autoExpiryDate);
          snapshot.insuranceExpiryDates.add(autoExpiryDate);
        }
        const policyNo = this.cleanString(contract.autoInsuranceDetail.soGCN);
        if (policyNo) {
          snapshot.insurancePolicyNumbers.add(policyNo);
        }
      }

      if (contract.motoInsuranceDetail) {
        const motoExpiryDate = this.toCompactDateString(contract.motoInsuranceDetail.policyToAt);
        if (motoExpiryDate) {
          snapshot.motoInsuranceExpiryDates.add(motoExpiryDate);
          snapshot.insuranceExpiryDates.add(motoExpiryDate);
        }
        const policyNo = this.cleanString(contract.motoInsuranceDetail.soGCN);
        if (policyNo) {
          snapshot.insurancePolicyNumbers.add(policyNo);
        }
      }

      if (contract.digitalServiceDetail) {
        const serviceName = this.cleanString(contract.digitalServiceDetail.serviceName);
        const planName = this.cleanString(contract.digitalServiceDetail.planName);
        const provider = this.cleanString(contract.digitalServiceDetail.provider);
        const composed = [serviceName, planName, provider].filter(Boolean).join(' / ');
        if (composed) {
          snapshot.digitalServices.add(composed);
        }
      }
    }

    for (const vehicle of vehicles) {
      const customerId = String(vehicle.ownerCustomerId ?? '').trim();
      if (!customerId) continue;
      const snapshot = ensureSnapshot(customerId);
      const vehicleType = this.cleanString(vehicle.vehicleType);
      const vehicleKind = this.cleanString(vehicle.vehicleKind);
      const plate = this.cleanString(vehicle.plateNumber);
      if (vehicleType) {
        snapshot.vehicleTypes.add(vehicleType);
      }
      if (vehicleKind) {
        snapshot.vehicleKinds.add(vehicleKind);
      }
      if (plate) {
        snapshot.vehiclePlateNumbers.add(plate);
      }
    }

    const contractCountMap = new Map<string, number>();
    for (const row of contractCounts) {
      contractCountMap.set(String(row.customerId), row._count._all);
    }
    const activeContractCountMap = new Map<string, number>();
    for (const row of activeContractCounts) {
      activeContractCountMap.set(String(row.customerId), row._count._all);
    }
    const nextActiveExpiryMap = new Map<string, string>();
    for (const row of nextActiveExpiries) {
      if (!row._min.endsAt) continue;
      const compact = this.toCompactDateString(row._min.endsAt);
      if (compact) {
        nextActiveExpiryMap.set(String(row.customerId), compact);
      }
    }
    const vehicleCountMap = new Map<string, number>();
    for (const row of vehicleCounts) {
      const key = String(row.ownerCustomerId ?? '').trim();
      if (!key) continue;
      vehicleCountMap.set(key, row._count._all);
    }

    return rows.map((row) => {
      const customerId = String(row.id ?? '').trim();
      const snapshot = snapshotByCustomer.get(customerId);
      const enrichedRow: Record<string, unknown> = {
        ...row as Record<string, unknown>,
        contractCount: contractCountMap.get(customerId) ?? 0,
        activeContractCount: activeContractCountMap.get(customerId) ?? 0,
        nextContractExpiryAt: nextActiveExpiryMap.get(customerId) ?? null,
        vehicleCount: vehicleCountMap.get(customerId) ?? 0,
        contractPackageNames: this.joinSet(snapshot?.packageNames),
        contractServicePhones: this.joinSet(snapshot?.servicePhones),
        contractProductTypes: this.joinSet(snapshot?.productTypes),
        contractExpiryDates: this.joinSet(snapshot?.contractExpiryDates),
        telecomExpiryDates: this.joinSet(snapshot?.telecomExpiryDates),
        digitalServiceNames: this.joinSet(snapshot?.digitalServices),
        insuranceExpiryDates: this.joinSet(snapshot?.insuranceExpiryDates),
        autoInsuranceExpiryDates: this.joinSet(snapshot?.autoInsuranceExpiryDates),
        motoInsuranceExpiryDates: this.joinSet(snapshot?.motoInsuranceExpiryDates),
        insurancePolicyNumbers: this.joinSet(snapshot?.insurancePolicyNumbers),
        vehicleTypes: this.joinSet(snapshot?.vehicleTypes),
        vehicleKinds: this.joinSet(snapshot?.vehicleKinds),
        vehiclePlateNumbers: this.joinSet(snapshot?.vehiclePlateNumbers),
      };
      return enrichedRow as T;
    });
  }

  async getCustomerTaxonomy() {
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    return {
      customerTaxonomy: {
        stages: salesPolicy.customerTaxonomy.stages,
        sources: salesPolicy.customerTaxonomy.sources
      },
      tagRegistry: {
        customerTags: salesPolicy.tagRegistry.customerTags,
        interactionTags: salesPolicy.tagRegistry.interactionTags,
        interactionResultTags: salesPolicy.tagRegistry.interactionResultTags
      }
    };
  }

  async createCustomer(payload: Record<string, unknown>) {
    const phone = normalizeVietnamPhone(this.optionalString(payload.phone));
    const email = this.normalizeEmail(this.optionalString(payload.email));

    assertValidVietnamPhone(phone);
    this.assertValidEmail(email);
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const defaultCustomerStage = this.resolveDefaultCustomerStage(salesPolicy.customerTaxonomy.stages);
    const defaultCustomerSource = this.resolveDefaultCustomerSource(salesPolicy.customerTaxonomy.sources);
    const tags = this.parseTags(payload.tags, salesPolicy.tagRegistry.customerTags, 'customer.tags');
    const normalizedTaxonomy = this.resolveCustomerTaxonomy(
      this.optionalString(payload.customerStage),
      this.optionalString(payload.source),
      salesPolicy.customerTaxonomy
    );
    const parsedStatus = this.parseCustomerCareStatus(
      payload.status,
      CustomerCareStatus.MOI_CHUA_TU_VAN
    );
    const parsedZaloNickType = this.parseCustomerZaloNickType(
      payload.zaloNickType,
      CustomerZaloNickType.CHUA_KIEM_TRA
    );

    const duplicate = await this.findDuplicateCustomer(phone, email);
    if (duplicate) {
      const mergedTags = this.mergeTags(duplicate.tags, tags);
      const nextStatus = this.parseCustomerCareStatus(payload.status, duplicate.status);
      const nextStage = this.resolveCustomerStageForStatus(
        normalizedTaxonomy.stage ?? duplicate.customerStage,
        nextStatus,
        salesPolicy.customerTaxonomy.stages
      );
      const nextZaloNickType = this.parseCustomerZaloNickType(
        payload.zaloNickType,
        duplicate.zaloNickType
      );
      await this.prisma.client.customer.updateMany({
        where: { id: duplicate.id },
        data: {
          fullName: this.cleanString(payload.fullName) || duplicate.fullName,
          phone: phone ?? duplicate.phone,
          phoneNormalized: phone ?? duplicate.phoneNormalized,
          email: email ?? duplicate.email,
          emailNormalized: email ?? duplicate.emailNormalized,
          segment: this.optionalString(payload.segment) ?? duplicate.segment,
          source: normalizedTaxonomy.source ?? duplicate.source ?? defaultCustomerSource ?? null,
          needsSummary: this.optionalString(payload.needsSummary) ?? duplicate.needsSummary,
          ownerStaffId: this.optionalString(payload.ownerStaffId) ?? duplicate.ownerStaffId,
          consentStatus: this.optionalString(payload.consentStatus) ?? duplicate.consentStatus,
          customerStage: nextStage ?? duplicate.customerStage,
          status: nextStatus,
          zaloNickType: nextZaloNickType,
          tags: mergedTags,
        }
      });

      const customer = await this.prisma.client.customer.findFirst({ where: { id: duplicate.id } });
      if (customer) {
        await this.search.syncCustomerUpsert(customer);
      }
      return {
        deduplicated: true,
        message: 'Khách hàng đã tồn tại, hệ thống đã tự động gộp thông tin.',
        customer
      };
    }

    const created = await this.prisma.client.customer.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        fullName: this.requiredString(payload.fullName, 'Thiếu họ tên khách hàng.'),
        email: email ?? null,
        emailNormalized: email ?? null,
        phone: phone ?? null,
        phoneNormalized: phone ?? null,
        code: this.optionalString(payload.code) ?? null,
        segment: this.optionalString(payload.segment) ?? null,
        source: normalizedTaxonomy.source ?? defaultCustomerSource ?? null,
        needsSummary: this.optionalString(payload.needsSummary) ?? null,
        ownerStaffId: this.optionalString(payload.ownerStaffId) ?? null,
        consentStatus: this.optionalString(payload.consentStatus) ?? null,
        customerStage: this.resolveCustomerStageForStatus(
          normalizedTaxonomy.stage,
          parsedStatus,
          salesPolicy.customerTaxonomy.stages
        ) ?? defaultCustomerStage ?? null,
        status: parsedStatus,
        zaloNickType: parsedZaloNickType,
        tags,
      }
    });
    await this.search.syncCustomerUpsert(created);

    return {
      deduplicated: false,
      message: 'Đã tạo khách hàng mới.',
      customer: created
    };
  }

  async updateCustomer(id: string, payload: Record<string, unknown>) {
    const current = await this.prisma.client.customer.findFirst({ where: { id } });
    if (!current) {
      throw new NotFoundException('Không tìm thấy khách hàng.');
    }

    const nextPhone = payload.phone !== undefined
      ? normalizeVietnamPhone(this.optionalString(payload.phone))
      : current.phoneNormalized ?? undefined;
    const nextEmail = payload.email !== undefined
      ? this.normalizeEmail(this.optionalString(payload.email))
      : current.emailNormalized ?? undefined;

    assertValidVietnamPhone(nextPhone);
    this.assertValidEmail(nextEmail);
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const normalizedTaxonomy = this.resolveCustomerTaxonomy(
      payload.customerStage !== undefined ? this.cleanString(payload.customerStage) : undefined,
      payload.source !== undefined ? this.cleanString(payload.source) : undefined,
      salesPolicy.customerTaxonomy
    );

    const duplicate = await this.findDuplicateCustomer(nextPhone, nextEmail, current.id);
    if (duplicate) {
      throw new BadRequestException('Số điện thoại hoặc email đã được dùng bởi khách hàng khác.');
    }

    const hasStatusField = this.hasOwn(payload, 'status');
    const hasZaloNickTypeField = this.hasOwn(payload, 'zaloNickType');
    const hasCustomerStageField = this.hasOwn(payload, 'customerStage');
    const nextStatus = hasStatusField
      ? this.parseCustomerCareStatus(payload.status, current.status)
      : current.status;
    const nextZaloNickType = hasZaloNickTypeField
      ? this.parseCustomerZaloNickType(payload.zaloNickType, current.zaloNickType)
      : current.zaloNickType;
    const nextCustomerStage = this.resolveCustomerStageForStatus(
      hasCustomerStageField ? normalizedTaxonomy.stage : current.customerStage,
      nextStatus,
      salesPolicy.customerTaxonomy.stages
    );
    const shouldUpdateCustomerStage = hasCustomerStageField || hasStatusField;

    const parsedTags = payload.tags !== undefined
      ? this.parseTags(payload.tags, salesPolicy.tagRegistry.customerTags, 'customer.tags')
      : current.tags;

    const nextTotalSpent = payload.totalSpent !== undefined
      ? this.parseDecimal(payload.totalSpent, 'totalSpent')
      : undefined;
    const nextTotalOrders = payload.totalOrders !== undefined
      ? this.parseInteger(payload.totalOrders, 'totalOrders')
      : undefined;

    await this.prisma.client.customer.updateMany({
      where: { id },
      data: {
        fullName: payload.fullName ? String(payload.fullName) : undefined,
        email: nextEmail ?? null,
        emailNormalized: nextEmail ?? null,
        phone: nextPhone ?? null,
        phoneNormalized: nextPhone ?? null,
        code: payload.code ? String(payload.code) : undefined,
        segment: payload.segment ? String(payload.segment) : undefined,
        source: payload.source ? normalizedTaxonomy.source : undefined,
        needsSummary: payload.needsSummary !== undefined
          ? (this.optionalString(payload.needsSummary) ?? null)
          : undefined,
        ownerStaffId: payload.ownerStaffId ? String(payload.ownerStaffId) : undefined,
        consentStatus: payload.consentStatus ? String(payload.consentStatus) : undefined,
        customerStage: shouldUpdateCustomerStage ? (nextCustomerStage ?? null) : undefined,
        status: hasStatusField ? nextStatus : undefined,
        zaloNickType: hasZaloNickTypeField ? nextZaloNickType : undefined,
        tags: parsedTags,
        totalSpent: nextTotalSpent,
        totalOrders: nextTotalOrders,
        lastOrderAt: payload.lastOrderAt ? this.parseDate(payload.lastOrderAt, 'lastOrderAt') : undefined,
        lastContactAt: payload.lastContactAt ? this.parseDate(payload.lastContactAt, 'lastContactAt') : undefined
      }
    });

    const customer = await this.prisma.client.customer.findFirst({ where: { id } });
    if (customer) {
      await this.search.syncCustomerUpsert(customer);
    }
    return customer;
  }

  async softSkipCustomer(id: string) {
    const current = await this.prisma.client.customer.findFirst({ where: { id } });
    if (!current) {
      throw new NotFoundException('Không tìm thấy khách hàng.');
    }

    if (current.status !== CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA) {
      await this.prisma.client.customer.updateMany({
        where: { id },
        data: {
          status: CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA
        }
      });
    }

    const customer = await this.prisma.client.customer.findFirst({ where: { id } });
    if (customer) {
      await this.search.syncCustomerUpsert(customer);
    }
    return customer;
  }

  async listInteractions(query: PaginationQueryDto, customerId?: string) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = query.q?.trim();

    const where: Prisma.CustomerInteractionWhereInput = {};
    if (customerId) {
      where.customerId = customerId;
    }
    if (keyword) {
      where.OR = [
        { content: { contains: keyword, mode: 'insensitive' } },
        { staffName: { contains: keyword, mode: 'insensitive' } },
        { channel: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.customerInteraction.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        }
      },
      orderBy: { interactionAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async createInteraction(payload: Record<string, unknown>) {
    const customer = await this.resolveCustomerByPayload(payload);
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng theo thông tin bạn nhập.');
    }
    const interactionType = this.cleanString(payload.interactionType).toUpperCase() || 'TU_VAN';
    const channel = this.cleanString(payload.channel).toUpperCase() || 'ZALO';
    const content = this.requiredString(payload.content, 'Thiếu nội dung tương tác.');
    const resultTag = this.cleanString(payload.resultTag).toLowerCase() || null;
    const interactionAt = payload.interactionAt ? this.parseDate(payload.interactionAt, 'interactionAt') : new Date();
    const nextActionAt = payload.nextActionAt ? this.parseDate(payload.nextActionAt, 'nextActionAt') : null;
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const extraTags = this.parseTags(payload.tags, salesPolicy.tagRegistry.interactionTags, 'interaction.tags');
    const normalizedInteractionStage = this.resolveCustomerTaxonomyValue(
      this.optionalString(payload.customerStage),
      salesPolicy.customerTaxonomy.stages,
      'customerStage'
    );
    this.assertAllowedSingleTagValue(
      resultTag,
      salesPolicy.tagRegistry.interactionResultTags,
      'interaction.resultTag'
    );

    const interaction = await this.prisma.client.customerInteraction.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId: customer.id,
        interactionType,
        channel,
        content,
        resultTag,
        staffName: this.optionalString(payload.staffName) ?? null,
        staffCode: this.optionalString(payload.staffCode) ?? null,
        interactionAt,
        nextActionAt
      }
    });

    const mergedTags = this.mergeTags(customer.tags, resultTag ? [resultTag] : [], extraTags);
    await this.prisma.client.customer.updateMany({
      where: { id: customer.id },
      data: {
        lastContactAt: interactionAt,
        tags: mergedTags,
        customerStage: normalizedInteractionStage ?? undefined
      }
    });
    const updatedCustomer = await this.prisma.client.customer.findFirst({ where: { id: customer.id } });
    if (updatedCustomer) {
      await this.search.syncCustomerUpsert(updatedCustomer);
    }

    return interaction;
  }

  async listPaymentRequests(query: PaginationQueryDto, status?: string) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = query.q?.trim();
    const where: Prisma.PaymentRequestWhereInput = {};

    if (status && this.cleanString(status).toUpperCase() !== 'ALL') {
      where.status = this.cleanString(status).toUpperCase();
    }

    if (keyword) {
      where.OR = [
        { invoiceNo: { contains: keyword, mode: 'insensitive' } },
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { recipient: { contains: keyword, mode: 'insensitive' } },
        { customer: { fullName: { contains: keyword, mode: 'insensitive' } } }
      ];
    }

    const rows = await this.prisma.client.paymentRequest.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async createPaymentRequest(payload: Record<string, unknown>) {
    const customer = await this.resolveCustomerByPayload(payload, { optional: true });
    const invoiceNo = this.optionalString(payload.invoiceNo);
    const invoice = invoiceNo
      ? await this.prisma.client.invoice.findFirst({ where: { invoiceNo } })
      : null;

    const amountFromPayload = payload.amount !== undefined ? this.parseDecimal(payload.amount, 'amount') : undefined;
    const amount = amountFromPayload
      ?? (invoice?.totalAmount ? new Prisma.Decimal(invoice.totalAmount) : undefined);

    const channel = this.cleanString(payload.channel).toUpperCase() || 'ZALO';
    const recipient = this.optionalString(payload.recipient)
      ?? customer?.phone
      ?? customer?.email
      ?? null;
    const statusNormalized = this.cleanString(payload.status).toUpperCase();
    const status = statusNormalized || 'DA_GUI';

    const created = await this.prisma.client.paymentRequest.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId: customer?.id ?? null,
        invoiceId: invoice?.id ?? null,
        invoiceNo: invoiceNo ?? null,
        orderNo: this.optionalString(payload.orderNo) ?? null,
        channel,
        recipient,
        qrCodeUrl: this.optionalString(payload.qrCodeUrl) ?? null,
        amount,
        status,
        sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
        note: this.optionalString(payload.note) ?? null
      }
    });

    return created;
  }

  async markPaymentRequestPaid(id: string, payload: Record<string, unknown>) {
    const row = await this.prisma.client.paymentRequest.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy yêu cầu thanh toán.');
    }
    const actor = this.resolveCustomerActor();
    if (!actor.role || actor.role === UserRole.STAFF) {
      throw new ForbiddenException('Sale/Staff không được phép mark paid thủ công. Vui lòng dùng webhook hoặc kế toán/admin override.');
    }
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Chỉ kế toán/admin (vai trò quản lý) được phép mark paid thủ công.');
    }
    const reason = this.cleanString(payload.reason);
    const reference = this.cleanString(payload.reference);
    if (!reason) {
      throw new BadRequestException('Thiếu reason khi mark paid thủ công.');
    }
    if (!reference) {
      throw new BadRequestException('Thiếu reference khi mark paid thủ công.');
    }
    const note = this.cleanString(payload.note);
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const finalizedCustomerStage = this.resolveFinalizedCustomerStage(salesPolicy.customerTaxonomy.stages);
    const purchasedCustomerTag = this.resolvePurchasedCustomerTag(salesPolicy.tagRegistry.customerTags);
    const overrideNote = [
      this.cleanString(row.note),
      `[override] role=${actor.role}; by=${actor.userId || actor.email || 'unknown'}; reason=${reason}; reference=${reference}`,
      note
    ].filter(Boolean).join(' | ');

    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentRequest.updateMany({
        where: { id: row.id },
        data: {
          status: 'DA_THANH_TOAN',
          paidAt: new Date(),
          note: overrideNote
        }
      });

      if (row.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: row.customerId } });
        const mergedTags = this.mergeTags(customer?.tags, purchasedCustomerTag ? [purchasedCustomerTag] : []);
        const customerUpdateData: Prisma.CustomerUpdateManyMutationInput = {
          lastOrderAt: new Date(),
          tags: mergedTags
        };
        if (finalizedCustomerStage) {
          customerUpdateData.customerStage = finalizedCustomerStage;
        }

        await tx.customer.updateMany({
          where: { id: row.customerId },
          data: customerUpdateData
        });
      }

      if (row.invoiceId || row.invoiceNo) {
        const paidAmount = row.amount ?? undefined;
        const paidAt = new Date();
        await tx.invoice.updateMany({
          where: row.invoiceId ? { id: row.invoiceId } : { invoiceNo: row.invoiceNo ?? undefined },
          data: {
            status: GenericStatus.APPROVED,
            paidAmount,
            paidAt,
            closedAt: paidAt
          }
        });
      }
    });

    if (row.customerId) {
      const updatedCustomer = await this.prisma.client.customer.findFirst({ where: { id: row.customerId } });
      if (updatedCustomer) {
        await this.search.syncCustomerUpsert(updatedCustomer);
      }
    }

    return this.prisma.client.paymentRequest.findFirst({ where: { id: row.id } });
  }

  async importCustomers(payload: Record<string, unknown>): Promise<CustomerImportSummary> {
    const actor = this.resolveCustomerActor();
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin được phép import dữ liệu khách hàng bằng Excel.');
    }

    const summary = await this.processCustomerImportRows(payload, 'import');

    if (summary.importedCustomerIds.size > 0) {
      const customers = await this.prisma.client.customer.findMany({
        where: {
          id: {
            in: [...summary.importedCustomerIds],
          },
        },
      });
      for (const customer of customers) {
        await this.search.syncCustomerUpsert(customer);
      }
    }

    return {
      totalRows: summary.totalRows,
      importedCount: summary.validRows,
      skippedCount: summary.errors.length,
      errors: summary.errors,
    };
  }

  async previewCustomerImport(payload: Record<string, unknown>): Promise<CustomerImportPreviewSummary> {
    const actor = this.resolveCustomerActor();
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin được phép mô phỏng import dữ liệu khách hàng.');
    }

    const summary = await this.processCustomerImportRows(payload, 'preview');
    return {
      totalRows: summary.totalRows,
      validRows: summary.validRows,
      wouldCreateCount: summary.wouldCreateCount,
      wouldUpdateCount: summary.wouldUpdateCount,
      skippedCount: summary.errors.length,
      errors: summary.errors,
    };
  }

  async getDedupCandidates() {
    const customers = await this.prisma.client.customer.findMany({
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        phoneNormalized: true,
        emailNormalized: true,
        tags: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const grouped = new Map<string, typeof customers>();
    const putGroup = (key: string, customer: (typeof customers)[number]) => {
      const list = grouped.get(key) ?? [];
      list.push(customer);
      grouped.set(key, list);
    };

    for (const customer of customers) {
      if (customer.phoneNormalized) {
        putGroup(`PHONE:${customer.phoneNormalized}`, customer);
      }
      if (customer.emailNormalized) {
        putGroup(`EMAIL:${customer.emailNormalized}`, customer);
      }
    }

    const items = Array.from(grouped.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({
        dedupKey: key,
        rule: key.startsWith('PHONE:') ? 'TRÙNG_SỐ_ĐIỆN_THOẠI' : 'TRÙNG_EMAIL',
        customers: list
      }));

    return {
      items,
      total: items.length
    };
  }

  async mergeCustomers(payload: Record<string, unknown>) {
    const primaryCustomerId = this.requiredString(payload.primaryCustomerId, 'Thiếu ID khách hàng chính.');
    const mergedCustomerId = this.requiredString(payload.mergedCustomerId, 'Thiếu ID khách hàng cần gộp.');

    if (primaryCustomerId === mergedCustomerId) {
      throw new BadRequestException('Không thể gộp một khách hàng với chính nó.');
    }

    const [primary, merged] = await Promise.all([
      this.prisma.client.customer.findFirst({ where: { id: primaryCustomerId } }),
      this.prisma.client.customer.findFirst({ where: { id: mergedCustomerId } })
    ]);

    if (!primary || !merged) {
      throw new NotFoundException('Không tìm thấy khách hàng để gộp.');
    }

    const mergedTags = this.mergeTags(primary.tags, merged.tags);
    const mergedTotalOrders = Number(primary.totalOrders ?? 0) + Number(merged.totalOrders ?? 0);
    const mergedTotalSpent = Number(primary.totalSpent ?? 0) + Number(merged.totalSpent ?? 0);
    const mergedLastOrderAt = this.maxDate(primary.lastOrderAt, merged.lastOrderAt);
    const mergedLastContactAt = this.maxDate(primary.lastContactAt, merged.lastContactAt);

    const moved = await this.prisma.client.$transaction(async (tx) => {
      const ordersResult = await tx.order.updateMany({
        where: { customerId: merged.id },
        data: {
          customerId: primary.id,
          customerName: primary.fullName
        }
      });
      const interactionsResult = await tx.customerInteraction.updateMany({
        where: { customerId: merged.id },
        data: { customerId: primary.id }
      });
      const paymentResult = await tx.paymentRequest.updateMany({
        where: { customerId: merged.id },
        data: { customerId: primary.id }
      });

      await tx.customer.updateMany({
        where: { id: primary.id },
        data: {
          fullName: primary.fullName || merged.fullName,
          phone: primary.phone ?? merged.phone,
          phoneNormalized: primary.phoneNormalized ?? merged.phoneNormalized,
          email: primary.email ?? merged.email,
          emailNormalized: primary.emailNormalized ?? merged.emailNormalized,
          source: primary.source ?? merged.source,
          segment: primary.segment ?? merged.segment,
          ownerStaffId: primary.ownerStaffId ?? merged.ownerStaffId,
          consentStatus: primary.consentStatus ?? merged.consentStatus,
          customerStage: primary.customerStage ?? merged.customerStage,
          totalOrders: mergedTotalOrders,
          totalSpent: new Prisma.Decimal(mergedTotalSpent),
          lastOrderAt: mergedLastOrderAt,
          lastContactAt: mergedLastContactAt,
          tags: mergedTags
        }
      });

      await tx.customerMergeLog.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          primaryCustomerId: primary.id,
          mergedCustomerId: merged.id,
          mergedBy: this.optionalString(payload.mergedBy) ?? null,
          note: this.optionalString(payload.note) ?? null
        }
      });

      await tx.customer.deleteMany({ where: { id: merged.id } });

      return {
        movedOrders: ordersResult.count,
        movedInteractions: interactionsResult.count,
        movedPaymentRequests: paymentResult.count
      };
    });

    const customer = await this.prisma.client.customer.findFirst({ where: { id: primary.id } });
    if (customer) {
      await this.search.syncCustomerUpsert(customer);
    }
    await this.search.syncCustomerDelete(merged.id, merged.tenant_Id);
    return {
      message: 'Đã gộp hồ sơ khách hàng thành công.',
      customer,
      summary: moved
    };
  }

  private async upsertCustomerImportRow(
    row: Record<string, unknown>,
    salesPolicy: {
      customerTaxonomy: { stages: string[]; sources: string[] };
      tagRegistry: { customerTags: string[] };
    },
    options: { preview: boolean }
  ): Promise<CustomerImportUpsertResult> {
    const phoneInput = this.optionalString(row.phoneNormalized) ?? this.optionalString(row.phone);
    const emailInput = this.optionalString(row.emailNormalized) ?? this.optionalString(row.email);
    const phoneNormalized = normalizeVietnamPhone(phoneInput);
    const emailNormalized = this.normalizeEmail(emailInput);

    assertValidVietnamPhone(phoneNormalized);
    this.assertValidEmail(emailNormalized);

    if (!phoneNormalized && !emailNormalized) {
      throw new BadRequestException('Mỗi dòng import cần ít nhất phone hoặc email.');
    }

    let existing = null;
    if (phoneNormalized) {
      existing = await this.prisma.client.customer.findFirst({
        where: { phoneNormalized },
      });
    }
    if (!existing && emailNormalized) {
      existing = await this.prisma.client.customer.findFirst({
        where: { emailNormalized },
      });
    }

    const duplicate = await this.findDuplicateCustomer(phoneNormalized, emailNormalized, existing?.id);
    if (duplicate) {
      throw new BadRequestException('Số điện thoại hoặc email đã được dùng bởi khách hàng khác.');
    }

    const normalizedTaxonomy = this.resolveCustomerTaxonomy(
      this.optionalString(row.customerStage),
      this.optionalString(row.source),
      salesPolicy.customerTaxonomy
    );
    const defaultCustomerStage = this.resolveDefaultCustomerStage(salesPolicy.customerTaxonomy.stages);
    const defaultCustomerSource = this.resolveDefaultCustomerSource(salesPolicy.customerTaxonomy.sources);

    const tags = this.hasOwn(row, 'tags')
      ? this.parseTags(row.tags, salesPolicy.tagRegistry.customerTags, 'customer.tags')
      : (existing?.tags ?? []);

    const nextStatus = this.parseCustomerCareStatus(
      row.status,
      existing?.status ?? CustomerCareStatus.MOI_CHUA_TU_VAN
    );
    const nextZaloNickType = this.parseCustomerZaloNickType(
      row.zaloNickType,
      existing?.zaloNickType ?? CustomerZaloNickType.CHUA_KIEM_TRA
    );
    const nextCustomerStage = this.resolveCustomerStageForStatus(
      normalizedTaxonomy.stage ?? existing?.customerStage,
      nextStatus,
      salesPolicy.customerTaxonomy.stages
    ) ?? existing?.customerStage ?? defaultCustomerStage ?? null;

    const totalSpent = this.hasOwn(row, 'totalSpent')
      ? this.parseOptionalDecimal(row.totalSpent, 'totalSpent')
      : undefined;
    const totalOrders = this.hasOwn(row, 'totalOrders')
      ? this.parseOptionalInteger(row.totalOrders, 'totalOrders')
      : undefined;
    const lastOrderAt = this.hasOwn(row, 'lastOrderAt')
      ? this.parseOptionalDate(row.lastOrderAt, 'lastOrderAt')
      : undefined;
    const lastContactAt = this.hasOwn(row, 'lastContactAt')
      ? this.parseOptionalDate(row.lastContactAt, 'lastContactAt')
      : undefined;

    if (existing) {
      const fullName = this.optionalString(row.fullName) ?? existing.fullName;
      if (!fullName) {
        throw new BadRequestException('Thiếu fullName cho khách hàng cần cập nhật.');
      }

      if (options.preview) {
        return {
          operation: 'update',
          customerId: existing.id,
        };
      }

      await this.prisma.client.customer.updateMany({
        where: { id: existing.id },
        data: {
          code: this.hasOwn(row, 'code') ? (this.optionalString(row.code) ?? null) : undefined,
          fullName,
          email: this.hasOwn(row, 'email') ? (this.optionalString(row.email) ?? null) : undefined,
          emailNormalized: this.hasOwn(row, 'email') || this.hasOwn(row, 'emailNormalized')
            ? (emailNormalized ?? null)
            : undefined,
          phone: this.hasOwn(row, 'phone') ? (this.optionalString(row.phone) ?? null) : undefined,
          phoneNormalized: this.hasOwn(row, 'phone') || this.hasOwn(row, 'phoneNormalized')
            ? (phoneNormalized ?? null)
            : undefined,
          tags,
          customerStage: nextCustomerStage,
          ownerStaffId: this.hasOwn(row, 'ownerStaffId') ? (this.optionalString(row.ownerStaffId) ?? null) : undefined,
          consentStatus: this.hasOwn(row, 'consentStatus') ? (this.optionalString(row.consentStatus) ?? null) : undefined,
          segment: this.hasOwn(row, 'segment') ? (this.optionalString(row.segment) ?? null) : undefined,
          source: this.hasOwn(row, 'source')
            ? (normalizedTaxonomy.source ?? defaultCustomerSource ?? null)
            : undefined,
          needsSummary: this.hasOwn(row, 'needsSummary') ? (this.optionalString(row.needsSummary) ?? null) : undefined,
          totalSpent: this.hasOwn(row, 'totalSpent') ? totalSpent : undefined,
          totalOrders: this.hasOwn(row, 'totalOrders') ? (totalOrders ?? undefined) : undefined,
          lastOrderAt: this.hasOwn(row, 'lastOrderAt') ? lastOrderAt : undefined,
          lastContactAt: this.hasOwn(row, 'lastContactAt') ? lastContactAt : undefined,
          status: nextStatus,
          zaloNickType: nextZaloNickType,
        },
      });

      const updated = await this.prisma.client.customer.findFirst({
        where: { id: existing.id },
      });
      if (!updated) {
        throw new NotFoundException('Không tìm thấy khách hàng sau khi cập nhật import.');
      }
      return {
        operation: 'update',
        customerId: updated.id,
      };
    }

    const fullName = this.requiredString(row.fullName, 'Thiếu fullName cho dòng import khách hàng mới.');
    if (options.preview) {
      return {
        operation: 'create',
      };
    }

    const created = await this.prisma.client.customer.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: this.optionalString(row.code) ?? null,
        fullName,
        email: this.optionalString(row.email) ?? null,
        emailNormalized: emailNormalized ?? null,
        phone: this.optionalString(row.phone) ?? null,
        phoneNormalized: phoneNormalized ?? null,
        tags,
        customerStage: nextCustomerStage,
        ownerStaffId: this.optionalString(row.ownerStaffId) ?? null,
        consentStatus: this.optionalString(row.consentStatus) ?? null,
        segment: this.optionalString(row.segment) ?? null,
        source: normalizedTaxonomy.source ?? defaultCustomerSource ?? null,
        needsSummary: this.optionalString(row.needsSummary) ?? null,
        totalSpent: totalSpent ?? null,
        totalOrders: totalOrders ?? 0,
        lastOrderAt: lastOrderAt ?? null,
        lastContactAt: lastContactAt ?? null,
        status: nextStatus,
        zaloNickType: nextZaloNickType,
      },
    });
    return {
      operation: 'create',
      customerId: created.id,
    };
  }

  private async processCustomerImportRows(
    payload: Record<string, unknown>,
    mode: 'preview' | 'import'
  ) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException('Thiếu dữ liệu rows để import khách hàng.');
    }

    const maxRows = 2_000;
    const slicedRows = rows.slice(0, maxRows);
    const errors: CustomerImportError[] = [];
    const importedCustomerIds = new Set<string>();
    let validRows = 0;
    let wouldCreateCount = 0;
    let wouldUpdateCount = 0;
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();

    for (let index = 0; index < slicedRows.length; index += 1) {
      const rowIndex = index + 1;
      const row = this.ensureRecord(slicedRows[index]);
      const identifier = this.cleanString(row.phone)
        || this.cleanString(row.phoneNormalized)
        || this.cleanString(row.email)
        || this.cleanString(row.emailNormalized)
        || this.cleanString(row.fullName)
        || undefined;

      try {
        const upsertResult = await this.upsertCustomerImportRow(row, salesPolicy, {
          preview: mode === 'preview',
        });
        validRows += 1;
        if (upsertResult.operation === 'create') {
          wouldCreateCount += 1;
        } else {
          wouldUpdateCount += 1;
        }
        if (upsertResult.customerId) {
          importedCustomerIds.add(upsertResult.customerId);
        }
      } catch (error) {
        errors.push({
          rowIndex,
          identifier,
          message: error instanceof Error ? error.message : 'Không thể import dòng dữ liệu khách hàng.',
        });
      }
    }

    return {
      totalRows: slicedRows.length,
      validRows,
      wouldCreateCount,
      wouldUpdateCount,
      errors,
      importedCustomerIds,
    };
  }

  private async findDuplicateCustomer(phone?: string, email?: string, excludeId?: string) {
    const where: Prisma.CustomerWhereInput[] = [];
    if (phone) {
      where.push({ phoneNormalized: phone });
    }
    if (email) {
      where.push({ emailNormalized: email });
    }
    if (where.length === 0) {
      return null;
    }

    return this.prisma.client.customer.findFirst({
      where: {
        OR: where,
        ...(excludeId ? { NOT: { id: excludeId } } : {})
      }
    });
  }

  private async resolveCustomerByPayload(
    payload: Record<string, unknown>,
    options: { optional?: boolean } = {}
  ) {
    const customerId = this.optionalString(payload.customerId);
    const customerPhone = normalizeVietnamPhone(this.optionalString(payload.customerPhone));
    const customerEmail = this.normalizeEmail(this.optionalString(payload.customerEmail));

    let customer = null;
    if (customerId) {
      customer = await this.prisma.client.customer.findFirst({ where: { id: customerId } });
    } else if (customerPhone) {
      customer = await this.prisma.client.customer.findFirst({ where: { phoneNormalized: customerPhone } });
    } else if (customerEmail) {
      customer = await this.prisma.client.customer.findFirst({ where: { emailNormalized: customerEmail } });
    }

    if (!customer && !options.optional) {
      throw new NotFoundException('Không tìm thấy khách hàng theo thông tin bạn nhập.');
    }

    return customer;
  }

  private async loadCustomerSavedFiltersStore(): Promise<CustomerSavedFiltersStore> {
    const settingKey = this.resolveCustomerSavedFiltersSettingKey();
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey },
    });
    return this.normalizeCustomerSavedFiltersStore(row?.settingValue);
  }

  private async saveCustomerSavedFiltersStore(store: CustomerSavedFiltersStore) {
    const settingKey = this.resolveCustomerSavedFiltersSettingKey();
    const normalizedStore = this.normalizeCustomerSavedFiltersStore(store);
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey },
    });

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: {
          settingValue: normalizedStore as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await this.prisma.client.setting.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        settingKey,
        settingValue: normalizedStore as Prisma.InputJsonValue,
      },
    });
  }

  private resolveCustomerSavedFiltersSettingKey() {
    const actor = this.resolveCustomerActor();
    const actorKeyRaw = this.cleanString(actor.userId)
      || this.cleanString(actor.sub)
      || this.cleanString(actor.email)
      || this.cleanString(actor.role).toLowerCase()
      || 'anonymous';
    const actorKey = actorKeyRaw
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'anonymous';
    return `${CUSTOMER_FILTER_STORE_KEY_PREFIX}${actorKey}`;
  }

  private normalizeCustomerSavedFiltersStore(input: unknown): CustomerSavedFiltersStore {
    const now = new Date().toISOString();
    const record = this.ensureRecord(input);
    const filtersInput = Array.isArray(record.filters) ? record.filters : [];
    const filters: CustomerSavedFilter[] = [];

    filtersInput.forEach((item) => {
      const parsed = this.normalizeStoredCustomerSavedFilter(item, now);
      if (parsed) {
        filters.push(parsed);
      }
    });

    const defaultFilterIdRaw = this.cleanString(record.defaultFilterId);
    const defaultFilterId = filters.some((item) => item.id === defaultFilterIdRaw)
      ? defaultFilterIdRaw
      : null;

    return {
      version: CUSTOMER_FILTER_STORE_VERSION,
      defaultFilterId,
      filters: this.applyCustomerSavedFilterDefaultState(filters, defaultFilterId),
    };
  }

  private normalizeStoredCustomerSavedFilter(
    input: unknown,
    fallbackIso: string
  ): CustomerSavedFilter | null {
    const record = this.ensureRecord(input);
    const id = this.cleanString(record.id);
    const name = this.cleanString(record.name);
    const logicRaw = this.cleanString(record.logic).toUpperCase();
    const logic: CustomerSavedFilterLogic = logicRaw === 'OR' ? 'OR' : 'AND';

    if (!id || !name) {
      return null;
    }

    const conditionsInput = Array.isArray(record.conditions) ? record.conditions : [];
    const conditions = conditionsInput
      .map((condition, index) => {
        try {
          return this.normalizeCustomerSavedFilterCondition(condition, index + 1);
        } catch {
          return null;
        }
      })
      .filter((condition): condition is CustomerSavedFilterCondition => condition !== null);
    if (conditions.length === 0) {
      return null;
    }

    const createdAt = this.normalizeIsoDateTimeString(record.createdAt, fallbackIso);
    const updatedAt = this.normalizeIsoDateTimeString(record.updatedAt, createdAt);

    return {
      id,
      name,
      logic,
      conditions,
      isDefault: false,
      createdAt,
      updatedAt,
    };
  }

  private parseCustomerSavedFilterMutation(payload: Record<string, unknown>) {
    const hasConditions = this.hasOwn(payload, 'conditions');
    const hasName = this.hasOwn(payload, 'name');
    const hasLogic = this.hasOwn(payload, 'logic');

    const id = this.cleanString(payload.id) || undefined;
    const name = hasName ? this.cleanString(payload.name) : undefined;
    const logicRaw = hasLogic ? this.cleanString(payload.logic).toUpperCase() : '';
    const logic: CustomerSavedFilterLogic | undefined = logicRaw === 'AND' || logicRaw === 'OR'
      ? (logicRaw as CustomerSavedFilterLogic)
      : undefined;
    const isDefault = typeof payload.isDefault === 'boolean' ? payload.isDefault : undefined;

    if (hasName && !name) {
      throw new BadRequestException('Tên bộ lọc CRM không được để trống.');
    }
    if (hasLogic && !logic) {
      throw new BadRequestException('Logic bộ lọc CRM chỉ chấp nhận AND hoặc OR.');
    }

    const conditions = hasConditions ? this.parseCustomerSavedFilterConditions(payload.conditions) : undefined;
    if (!id && (!name || !conditions || conditions.length === 0)) {
      throw new BadRequestException('Tạo bộ lọc CRM mới cần đủ: name + conditions.');
    }

    return {
      id,
      name,
      logic,
      conditions,
      isDefault,
    };
  }

  private parseCustomerSavedFilterConditions(input: unknown) {
    if (!Array.isArray(input)) {
      throw new BadRequestException('Điều kiện bộ lọc CRM phải là mảng.');
    }
    if (input.length === 0) {
      throw new BadRequestException('Bộ lọc CRM cần ít nhất 1 điều kiện.');
    }
    if (input.length > 20) {
      throw new BadRequestException('Bộ lọc CRM tối đa 20 điều kiện.');
    }
    return input.map((condition, index) => this.normalizeCustomerSavedFilterCondition(condition, index + 1));
  }

  private normalizeCustomerSavedFilterCondition(
    input: unknown,
    rowIndex: number
  ): CustomerSavedFilterCondition {
    const record = this.ensureRecord(input);
    const fieldRaw = this.cleanString(record.field) as CustomerSavedFilterField;
    const operatorRaw = this.cleanString(record.operator) as CustomerSavedFilterOperator;
    const fieldOperators = CUSTOMER_FILTER_FIELD_OPERATORS[fieldRaw];

    if (!fieldOperators) {
      throw new BadRequestException(`Điều kiện #${rowIndex}: field '${fieldRaw}' không hợp lệ.`);
    }
    if (!fieldOperators.includes(operatorRaw)) {
      throw new BadRequestException(
        `Điều kiện #${rowIndex}: operator '${operatorRaw}' không hợp lệ cho field '${fieldRaw}'.`
      );
    }

    const expectsValue = !['is_empty', 'is_not_empty'].includes(operatorRaw);
    const expectsValueTo = operatorRaw === 'between';
    const rawValue = this.cleanString(record.value);
    const rawValueTo = this.cleanString(record.valueTo);

    let value = rawValue || undefined;
    let valueTo = rawValueTo || undefined;

    if (expectsValue && !value) {
      throw new BadRequestException(`Điều kiện #${rowIndex}: thiếu giá trị value.`);
    }
    if (expectsValueTo && !valueTo) {
      throw new BadRequestException(`Điều kiện #${rowIndex}: thiếu giá trị valueTo cho toán tử between.`);
    }

    if (['before', 'after', 'on', 'between'].includes(operatorRaw)) {
      value = value ? this.normalizeDateInput(value, `Điều kiện #${rowIndex}: value`) : undefined;
      valueTo = valueTo ? this.normalizeDateInput(valueTo, `Điều kiện #${rowIndex}: valueTo`) : undefined;
    }

    return {
      field: fieldRaw,
      operator: operatorRaw,
      ...(value ? { value } : {}),
      ...(valueTo ? { valueTo } : {}),
    };
  }

  private parseCustomerQueryFilter(input: unknown): CustomerQueryFilter | null {
    if (input === null || input === undefined || this.cleanString(input) === '') {
      return null;
    }

    let payload: unknown = input;
    if (typeof input === 'string') {
      try {
        payload = JSON.parse(input);
      } catch {
        throw new BadRequestException('customFilter phải là JSON hợp lệ.');
      }
    }

    const record = this.ensureRecord(payload);
    const logicRaw = this.cleanString(record.logic).toUpperCase();
    if (logicRaw && logicRaw !== 'AND' && logicRaw !== 'OR') {
      throw new BadRequestException('customFilter.logic chỉ chấp nhận AND hoặc OR.');
    }

    const conditions = this.parseCustomerSavedFilterConditions(record.conditions);
    return {
      logic: logicRaw === 'OR' ? 'OR' : 'AND',
      conditions,
    };
  }

  private combineCustomerWhereClauses(clauses: Prisma.CustomerWhereInput[]) {
    const valid = clauses.filter((item) => Object.keys(item ?? {}).length > 0);
    if (valid.length === 0) {
      return {};
    }
    if (valid.length === 1) {
      return valid[0];
    }
    return { AND: valid };
  }

  private buildCustomerCustomFilterWhere(filter: CustomerQueryFilter): Prisma.CustomerWhereInput {
    const conditionWheres = filter.conditions.map((condition) =>
      this.buildCustomerCustomFilterConditionWhere(condition)
    );

    if (conditionWheres.length === 0) {
      return {};
    }

    if (filter.logic === 'OR') {
      return { OR: conditionWheres };
    }
    return { AND: conditionWheres };
  }

  private buildCustomerCustomFilterConditionWhere(condition: CustomerSavedFilterCondition): Prisma.CustomerWhereInput {
    switch (condition.field) {
      case 'fullName':
        return this.buildCustomerStringFilterCondition('fullName', condition.operator, condition.value, {
          nullable: false,
          caseInsensitive: true,
        });
      case 'phone':
        return this.buildCustomerStringFilterCondition('phone', condition.operator, condition.value, {
          nullable: true,
          caseInsensitive: true,
        });
      case 'email':
        return this.buildCustomerStringFilterCondition('email', condition.operator, condition.value, {
          nullable: true,
          caseInsensitive: true,
        });
      case 'customerStage':
        return this.buildCustomerStringFilterCondition('customerStage', condition.operator, condition.value, {
          nullable: true,
          caseInsensitive: true,
        });
      case 'source':
        return this.buildCustomerStringFilterCondition('source', condition.operator, condition.value, {
          nullable: true,
          caseInsensitive: true,
        });
      case 'segment':
        return this.buildCustomerStringFilterCondition('segment', condition.operator, condition.value, {
          nullable: true,
          caseInsensitive: true,
        });
      case 'status': {
        const status = this.normalizeCustomerCareStatusFilterValue(condition.value);
        if (condition.operator === 'equals') {
          return { status };
        }
        if (condition.operator === 'not_equals') {
          return { NOT: { status } };
        }
        break;
      }
      case 'zaloNickType': {
        const nickType = this.normalizeCustomerZaloNickTypeFilterValue(condition.value);
        if (condition.operator === 'equals') {
          return { zaloNickType: nickType };
        }
        if (condition.operator === 'not_equals') {
          return { NOT: { zaloNickType: nickType } };
        }
        break;
      }
      case 'tags': {
        const tagValue = this.cleanString(condition.value).toLowerCase();
        if (!tagValue) {
          throw new BadRequestException('Điều kiện tags thiếu value.');
        }
        if (condition.operator === 'has') {
          return { tags: { has: tagValue } };
        }
        if (condition.operator === 'not_has') {
          return { NOT: { tags: { has: tagValue } } };
        }
        break;
      }
      case 'lastContactAt': {
        if (condition.operator === 'is_empty') {
          return { lastContactAt: null };
        }
        if (condition.operator === 'is_not_empty') {
          return { NOT: { lastContactAt: null } };
        }
        return {
          lastContactAt: this.buildCustomerDateFilter(condition.operator, condition.value, condition.valueTo),
        };
      }
      case 'updatedAt':
        return {
          updatedAt: this.buildCustomerDateFilter(condition.operator, condition.value, condition.valueTo),
        };
      case 'contractPackageNames': {
        const relationHasValue: Prisma.ServiceContractWhereInput = {
          telecomLine: { isNot: null },
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: relationHasValue } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: relationHasValue } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện contractPackageNames thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        if (condition.operator === 'not_equals') {
          return {
            serviceContracts: {
              none: {
                telecomLine: { is: { packageName: equalsFilter } },
              },
            },
          };
        }
        const packageNameFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          serviceContracts: {
            some: {
              telecomLine: { is: { packageName: packageNameFilter } },
            },
          },
        };
      }
      case 'contractProductTypes': {
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: {} } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: {} } };
        }
        const productType = this.normalizeServiceContractProductTypeFilterValue(condition.value);
        if (condition.operator === 'not_equals') {
          return {
            serviceContracts: {
              none: { productType },
            },
          };
        }
        return {
          serviceContracts: {
            some: { productType },
          },
        };
      }
      case 'nextContractExpiryAt': {
        const activeFutureContract: Prisma.ServiceContractWhereInput = {
          status: ServiceContractStatus.ACTIVE,
          endsAt: { gte: new Date() },
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: activeFutureContract } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: activeFutureContract } };
        }
        return {
          serviceContracts: {
            some: {
              AND: [
                activeFutureContract,
                { endsAt: this.buildCustomerDateFilter(condition.operator, condition.value, condition.valueTo) },
              ],
            },
          },
        };
      }
      case 'contractServicePhones': {
        const relationHasValue: Prisma.ServiceContractWhereInput = {
          telecomLine: { isNot: null },
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: relationHasValue } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: relationHasValue } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện contractServicePhones thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        if (condition.operator === 'not_equals') {
          return {
            serviceContracts: {
              none: {
                telecomLine: { is: { servicePhone: equalsFilter } },
              },
            },
          };
        }
        const phoneFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          serviceContracts: {
            some: {
              telecomLine: { is: { servicePhone: phoneFilter } },
            },
          },
        };
      }
      case 'vehicleKinds': {
        const activeVehicle: Prisma.VehicleWhereInput = { status: GenericStatus.ACTIVE };
        if (condition.operator === 'is_empty') {
          return { ownedVehicles: { none: activeVehicle } };
        }
        if (condition.operator === 'is_not_empty') {
          return { ownedVehicles: { some: activeVehicle } };
        }
        const kind = this.normalizeVehicleKindFilterValue(condition.value);
        if (condition.operator === 'not_equals') {
          return {
            ownedVehicles: {
              none: { ...activeVehicle, vehicleKind: kind },
            },
          };
        }
        return {
          ownedVehicles: {
            some: { ...activeVehicle, vehicleKind: kind },
          },
        };
      }
      case 'vehicleTypes': {
        const activeVehicle: Prisma.VehicleWhereInput = { status: GenericStatus.ACTIVE };
        if (condition.operator === 'is_empty') {
          return { ownedVehicles: { none: activeVehicle } };
        }
        if (condition.operator === 'is_not_empty') {
          return { ownedVehicles: { some: activeVehicle } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện vehicleTypes thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        if (condition.operator === 'not_equals') {
          return {
            ownedVehicles: {
              none: { ...activeVehicle, vehicleType: equalsFilter },
            },
          };
        }
        const typeFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          ownedVehicles: {
            some: { ...activeVehicle, vehicleType: typeFilter },
          },
        };
      }
      case 'vehiclePlateNumbers': {
        const activeVehicle: Prisma.VehicleWhereInput = { status: GenericStatus.ACTIVE };
        if (condition.operator === 'is_empty') {
          return { ownedVehicles: { none: activeVehicle } };
        }
        if (condition.operator === 'is_not_empty') {
          return { ownedVehicles: { some: activeVehicle } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện vehiclePlateNumbers thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        if (condition.operator === 'not_equals') {
          return {
            ownedVehicles: {
              none: { ...activeVehicle, plateNumber: equalsFilter },
            },
          };
        }
        const plateFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          ownedVehicles: {
            some: { ...activeVehicle, plateNumber: plateFilter },
          },
        };
      }
      case 'insuranceExpiryDates': {
        const hasInsuranceDetail: Prisma.ServiceContractWhereInput = {
          OR: [
            { autoInsuranceDetail: { isNot: null } },
            { motoInsuranceDetail: { isNot: null } },
          ],
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: hasInsuranceDetail } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: hasInsuranceDetail } };
        }
        const dateFilter = this.buildCustomerDateFilter(condition.operator, condition.value, condition.valueTo);
        return {
          serviceContracts: {
            some: {
              OR: [
                { autoInsuranceDetail: { is: { policyToAt: dateFilter } } },
                { motoInsuranceDetail: { is: { policyToAt: dateFilter } } },
              ],
            },
          },
        };
      }
      case 'insurancePolicyNumbers': {
        const hasInsuranceDetail: Prisma.ServiceContractWhereInput = {
          OR: [
            { autoInsuranceDetail: { isNot: null } },
            { motoInsuranceDetail: { isNot: null } },
          ],
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: hasInsuranceDetail } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: hasInsuranceDetail } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện insurancePolicyNumbers thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        const relationEquals: Prisma.ServiceContractWhereInput = {
          OR: [
            { autoInsuranceDetail: { is: { soGCN: equalsFilter } } },
            { motoInsuranceDetail: { is: { soGCN: equalsFilter } } },
          ],
        };
        if (condition.operator === 'not_equals') {
          return { serviceContracts: { none: relationEquals } };
        }
        const textFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          serviceContracts: {
            some: {
              OR: [
                { autoInsuranceDetail: { is: { soGCN: textFilter } } },
                { motoInsuranceDetail: { is: { soGCN: textFilter } } },
              ],
            },
          },
        };
      }
      case 'digitalServiceNames': {
        const hasDigitalService: Prisma.ServiceContractWhereInput = {
          digitalServiceDetail: { isNot: null },
        };
        if (condition.operator === 'is_empty') {
          return { serviceContracts: { none: hasDigitalService } };
        }
        if (condition.operator === 'is_not_empty') {
          return { serviceContracts: { some: hasDigitalService } };
        }
        const rawValue = this.cleanString(condition.value);
        if (!rawValue) {
          throw new BadRequestException('Điều kiện digitalServiceNames thiếu value.');
        }
        const equalsFilter = { equals: rawValue, mode: 'insensitive' as const };
        const serviceNameEquals: Prisma.ServiceContractWhereInput = {
          digitalServiceDetail: {
            is: {
              OR: [
                { serviceName: equalsFilter },
                { planName: equalsFilter },
                { provider: equalsFilter },
              ],
            },
          },
        };
        if (condition.operator === 'not_equals') {
          return { serviceContracts: { none: serviceNameEquals } };
        }
        const textFilter = condition.operator === 'contains'
          ? { contains: rawValue, mode: 'insensitive' as const }
          : equalsFilter;
        return {
          serviceContracts: {
            some: {
              digitalServiceDetail: {
                is: {
                  OR: [
                    { serviceName: textFilter },
                    { planName: textFilter },
                    { provider: textFilter },
                  ],
                },
              },
            },
          },
        };
      }
      default:
        break;
    }

    throw new BadRequestException(
      `Điều kiện customFilter không hợp lệ cho field '${condition.field}' với operator '${condition.operator}'.`
    );
  }

  private buildCustomerStringFilterCondition(
    field: string,
    operator: CustomerSavedFilterOperator,
    value: string | undefined,
    options: { nullable: boolean; caseInsensitive: boolean }
  ): Prisma.CustomerWhereInput {
    const rawValue = this.cleanString(value);
    const mode = options.caseInsensitive ? { mode: 'insensitive' as const } : {};
    const fieldWhere = (fieldFilter: unknown) => ({ [field]: fieldFilter } as unknown as Prisma.CustomerWhereInput);

    if (operator === 'is_empty') {
      if (options.nullable) {
        return {
          OR: [
            fieldWhere(null),
            fieldWhere({ equals: '' }),
          ],
        };
      }
      return fieldWhere({ equals: '' });
    }

    if (operator === 'is_not_empty') {
      if (options.nullable) {
        return {
          AND: [
            { NOT: fieldWhere(null) },
            { NOT: fieldWhere({ equals: '' }) },
          ],
        };
      }
      return { NOT: fieldWhere({ equals: '' }) };
    }

    if (!rawValue) {
      throw new BadRequestException(`Điều kiện customFilter cho '${field}' đang thiếu value.`);
    }

    if (operator === 'contains') {
      return fieldWhere({ contains: rawValue, ...mode });
    }
    if (operator === 'equals') {
      return fieldWhere({ equals: rawValue, ...mode });
    }
    if (operator === 'not_equals') {
      return { NOT: fieldWhere({ equals: rawValue, ...mode }) };
    }

    throw new BadRequestException(
      `Operator '${operator}' không hỗ trợ cho customFilter field '${field}'.`
    );
  }

  private buildCustomerDateFilter(
    operator: CustomerSavedFilterOperator,
    value: string | undefined,
    valueTo: string | undefined
  ): Prisma.DateTimeFilter {
    if (!['before', 'after', 'on', 'between'].includes(operator)) {
      throw new BadRequestException(`Operator '${operator}' không hỗ trợ cho điều kiện ngày.`);
    }

    const fromDate = this.toStartOfDayUtc(value, 'customFilter.value');
    if (operator === 'before') {
      return { lt: this.toNextDayUtc(fromDate) };
    }
    if (operator === 'after') {
      return { gte: fromDate };
    }
    if (operator === 'on') {
      return { gte: fromDate, lt: this.toNextDayUtc(fromDate) };
    }

    const toDate = this.toStartOfDayUtc(valueTo ?? value, 'customFilter.valueTo');
    const left = fromDate <= toDate ? fromDate : toDate;
    const right = fromDate <= toDate ? toDate : fromDate;
    return {
      gte: left,
      lt: this.toNextDayUtc(right),
    };
  }

  private toStartOfDayUtc(input: string | undefined, fieldName: string) {
    const value = this.cleanString(input);
    if (!value) {
      throw new BadRequestException(`${fieldName} không được để trống.`);
    }
    const normalized = this.normalizeDateInput(value, fieldName);
    return new Date(`${normalized}T00:00:00.000Z`);
  }

  private toNextDayUtc(day: Date) {
    return new Date(day.getTime() + 24 * 60 * 60 * 1000);
  }

  private applyCustomerSavedFilterDefaultState(
    filters: CustomerSavedFilter[],
    defaultFilterId: string | null
  ) {
    return filters.map((filter) => ({
      ...filter,
      isDefault: Boolean(defaultFilterId) && filter.id === defaultFilterId,
    }));
  }

  private normalizeIsoDateTimeString(input: unknown, fallback: string) {
    const candidate = this.cleanString(input);
    if (!candidate) {
      return fallback;
    }
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }
    return parsed.toISOString();
  }

  private normalizeDateInput(input: string, fieldName: string) {
    const parsed = new Date(String(input));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} không phải ngày hợp lệ.`);
    }
    return parsed.toISOString().slice(0, 10);
  }

  private parseTags(input: unknown, allowedValues: string[] = [], fieldName = 'tags'): string[] {
    const normalizedAllowList = Array.from(
      new Set(
        allowedValues
          .map((item) => this.cleanString(item).toLowerCase())
          .filter(Boolean)
      )
    );

    const assertAllowedValues = (values: string[]) => {
      if (normalizedAllowList.length === 0 || values.length === 0) {
        return;
      }
      const invalid = values.filter((value) => !normalizedAllowList.includes(value));
      if (invalid.length === 0) {
        return;
      }
      throw new BadRequestException(
        `${fieldName} chứa giá trị không hợp lệ: ${invalid.join(', ')}.`
      );
    };

    if (Array.isArray(input)) {
      const parsed = Array.from(
        new Set(
          input
            .map((item) => this.cleanString(item).toLowerCase())
            .filter(Boolean)
        )
      );
      assertAllowedValues(parsed);
      return parsed;
    }

    const raw = this.cleanString(input);
    if (!raw) {
      return [];
    }

    const parsed = Array.from(
      new Set(
        raw
          .split(/[;,]/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    assertAllowedValues(parsed);
    return parsed;
  }

  private mergeTags(...groups: Array<string[] | null | undefined>) {
    return Array.from(
      new Set(
        groups
          .flatMap((group) => group ?? [])
          .map((item) => this.cleanString(item).toLowerCase())
          .filter(Boolean)
      )
    );
  }

  private resolveCustomerTaxonomy(
    stage: string | undefined,
    source: string | undefined,
    policy: { stages: string[]; sources: string[] }
  ) {
    return {
      stage: this.resolveCustomerTaxonomyValue(stage, policy.stages, 'customerStage'),
      source: this.resolveCustomerTaxonomyValue(source, policy.sources, 'source')
    };
  }

  private resolveCustomerTaxonomyValue(
    input: string | undefined,
    allowedValues: string[],
    fieldName: 'customerStage' | 'source'
  ) {
    const candidate = this.cleanString(input);
    if (!candidate) {
      return undefined;
    }

    if (allowedValues.length === 0) {
      return candidate;
    }

    const directMatch = allowedValues.find((item) => this.cleanString(item) === candidate);
    if (directMatch) {
      return directMatch;
    }

    const lowercaseCandidate = candidate.toLowerCase();
    const caseInsensitiveMatch = allowedValues.find(
      (item) => this.cleanString(item).toLowerCase() === lowercaseCandidate
    );
    if (caseInsensitiveMatch) {
      return caseInsensitiveMatch;
    }

    throw new BadRequestException(`${fieldName} '${candidate}' không nằm trong taxonomy đã cấu hình.`);
  }

  private assertAllowedSingleTagValue(value: string | null, allowedValues: string[], fieldName: string) {
    if (!value) {
      return;
    }
    const normalizedAllowedValues = allowedValues
      .map((item) => this.cleanString(item).toLowerCase())
      .filter(Boolean);
    if (normalizedAllowedValues.length === 0) {
      return;
    }
    if (!normalizedAllowedValues.includes(value)) {
      throw new BadRequestException(
        `${fieldName} '${value}' không nằm trong CRM tag registry đã cấu hình.`
      );
    }
  }

  private resolveCustomerStageForStatus(
    inputStage: string | null | undefined,
    status: CustomerCareStatus,
    allowedStages: string[]
  ) {
    if (status === CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH) {
      return inputStage ?? this.resolveFinalizedCustomerStage(allowedStages);
    }
    return inputStage ?? undefined;
  }

  private resolveDefaultCustomerStage(stages: string[]) {
    for (const candidate of stages) {
      const normalized = this.cleanString(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private resolveFinalizedCustomerStage(stages: string[]) {
    for (let index = stages.length - 1; index >= 0; index -= 1) {
      const normalized = this.cleanString(stages[index]);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private resolveDefaultCustomerSource(sources: string[]) {
    for (const candidate of sources) {
      const normalized = this.cleanString(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private resolvePurchasedCustomerTag(customerTags: string[]) {
    for (const candidate of customerTags) {
      const normalized = this.cleanString(candidate).toLowerCase().replace(/[\s-]+/g, '_');
      if (normalized === 'da_mua') {
        return this.cleanString(candidate).toLowerCase();
      }
    }
    return undefined;
  }

  private normalizeServiceContractProductTypeFilterValue(input: string | undefined) {
    const candidate = this.cleanString(input).toUpperCase();
    if ((Object.values(ServiceContractProductType) as string[]).includes(candidate)) {
      return candidate as ServiceContractProductType;
    }
    throw new BadRequestException(`Giá trị productType '${candidate}' không hợp lệ cho customFilter.`);
  }

  private normalizeVehicleKindFilterValue(input: string | undefined) {
    const candidate = this.cleanString(input).toUpperCase();
    if ((Object.values(VehicleKind) as string[]).includes(candidate)) {
      return candidate as VehicleKind;
    }
    throw new BadRequestException(`Giá trị vehicleKind '${candidate}' không hợp lệ cho customFilter.`);
  }

  private normalizeCustomerCareStatusFilterValue(input: string | undefined) {
    const candidate = this.cleanString(input).toUpperCase();
    if (
      candidate === CustomerCareStatus.MOI_CHUA_TU_VAN
      || candidate === CustomerCareStatus.DANG_SUY_NGHI
      || candidate === CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH
      || candidate === CustomerCareStatus.KH_TU_CHOI
      || candidate === CustomerCareStatus.KH_DA_MUA_BEN_KHAC
      || candidate === CustomerCareStatus.NGUOI_NHA_LAM_THUE_BAO
      || candidate === CustomerCareStatus.KHONG_NGHE_MAY_LAN_1
      || candidate === CustomerCareStatus.KHONG_NGHE_MAY_LAN_2
      || candidate === CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA
    ) {
      return candidate as CustomerCareStatus;
    }
    throw new BadRequestException(`Giá trị status '${candidate}' không hợp lệ cho customFilter.`);
  }

  private normalizeCustomerZaloNickTypeFilterValue(input: string | undefined) {
    const candidate = this.cleanString(input).toUpperCase();
    if (
      candidate === CustomerZaloNickType.CHUA_KIEM_TRA
      || candidate === CustomerZaloNickType.CHUA_CO_NICK_ZALO
      || candidate === CustomerZaloNickType.CHAN_NGUOI_LA
      || candidate === CustomerZaloNickType.GUI_DUOC_TIN_NHAN
    ) {
      return candidate as CustomerZaloNickType;
    }
    throw new BadRequestException(`Giá trị zaloNickType '${candidate}' không hợp lệ cho customFilter.`);
  }

  private parseCustomerCareStatus(input: unknown, fallback: CustomerCareStatus): CustomerCareStatus {
    const candidate = this.cleanString(input).toUpperCase();
    if (
      candidate === CustomerCareStatus.MOI_CHUA_TU_VAN
      || candidate === CustomerCareStatus.DANG_SUY_NGHI
      || candidate === CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH
      || candidate === CustomerCareStatus.KH_TU_CHOI
      || candidate === CustomerCareStatus.KH_DA_MUA_BEN_KHAC
      || candidate === CustomerCareStatus.NGUOI_NHA_LAM_THUE_BAO
      || candidate === CustomerCareStatus.KHONG_NGHE_MAY_LAN_1
      || candidate === CustomerCareStatus.KHONG_NGHE_MAY_LAN_2
      || candidate === CustomerCareStatus.SAI_SO_KHONG_TON_TAI_BO_QUA_XOA
    ) {
      return candidate as CustomerCareStatus;
    }
    return fallback;
  }

  private parseCustomerZaloNickType(
    input: unknown,
    fallback: CustomerZaloNickType
  ): CustomerZaloNickType {
    const candidate = this.cleanString(input).toUpperCase();
    if (
      candidate === CustomerZaloNickType.CHUA_KIEM_TRA
      || candidate === CustomerZaloNickType.CHUA_CO_NICK_ZALO
      || candidate === CustomerZaloNickType.CHAN_NGUOI_LA
      || candidate === CustomerZaloNickType.GUI_DUOC_TIN_NHAN
    ) {
      return candidate as CustomerZaloNickType;
    }
    return fallback;
  }

  private joinSet(values?: Set<string> | null) {
    if (!values || values.size === 0) {
      return null;
    }
    const normalized = Array.from(values)
      .map((value) => this.cleanString(value))
      .filter(Boolean);
    return normalized.length > 0 ? normalized.join(', ') : null;
  }

  private toCompactDateString(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }

  private parseDecimal(input: unknown, fieldName: string) {
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return new Prisma.Decimal(value);
  }

  private parseInteger(input: unknown, fieldName: string) {
    const value = Number(input);
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${fieldName} phải là số nguyên không âm.`);
    }
    return value;
  }

  private parseDate(input: unknown, fieldName: string) {
    const value = new Date(String(input));
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return value;
  }

  private parseOptionalDecimal(input: unknown, fieldName: string) {
    if (input === null || input === undefined || this.cleanString(input) === '') {
      return null;
    }
    return this.parseDecimal(input, fieldName);
  }

  private parseOptionalInteger(input: unknown, fieldName: string) {
    if (input === null || input === undefined || this.cleanString(input) === '') {
      return null;
    }
    return this.parseInteger(input, fieldName);
  }

  private parseOptionalDate(input: unknown, fieldName: string) {
    if (input === null || input === undefined || this.cleanString(input) === '') {
      return null;
    }
    return this.parseDate(input, fieldName);
  }

  private ensureRecord(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input as Record<string, unknown>;
  }

  private hasOwn(source: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  private optionalString(input: unknown) {
    const value = this.cleanString(input);
    return value || undefined;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.cleanString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private cleanString(input: unknown) {
    if (input === null || input === undefined) {
      return '';
    }
    return String(input).trim();
  }

  private normalizeEmail(input?: string) {
    if (!input) {
      return undefined;
    }
    return input.trim().toLowerCase();
  }

  private assertValidEmail(email?: string) {
    if (!email) {
      return;
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValid) {
      throw new BadRequestException('Email không hợp lệ.');
    }
  }

  private maxDate(left?: Date | null, right?: Date | null) {
    if (!left) return right ?? null;
    if (!right) return left;
    return left >= right ? left : right;
  }

  private rankByIds<T extends { id: string }>(rows: T[], orderedIds: string[]) {
    const rankMap = new Map(orderedIds.map((id, index) => [id, index]));
    return [...rows].sort((left, right) => {
      const leftRank = rankMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }

  private async resolveCustomerScopeFilter() {
    if (!this.iamScopeFilter) {
      return {
        companyWide: true,
        actorIds: []
      };
    }

    const scope = await this.iamScopeFilter.resolveForCurrentActor('crm');
    return {
      companyWide: scope.companyWide,
      actorIds: scope.actorIds
    };
  }

  private resolveCustomerActor() {
    const auth = this.ensureRecord(this.cls?.get(AUTH_USER_CONTEXT_KEY));
    const roleRaw = this.cleanString(auth.role).toUpperCase();
    const role = (Object.values(UserRole) as string[]).includes(roleRaw)
      ? (roleRaw as UserRole)
      : null;
    const sub = this.cleanString(auth.sub);
    const email = this.cleanString(auth.email);
    const userId = this.cleanString(auth.userId)
      || sub
      || email;

    return {
      role,
      userId,
      sub,
      email,
    };
  }
}
