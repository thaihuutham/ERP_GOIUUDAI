import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerCareStatus, GenericStatus, Prisma } from '@prisma/client';
import { MeiliSearch } from 'meilisearch';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GlobalSearchQueryDto } from './dto/global-search.dto';
import {
  FederatedSearchEntity,
  FederatedSearchResponse,
  FederatedSearchResultGroup,
  SEARCH_ENTITIES,
  SearchCustomersFilters,
  SearchEntity,
  SearchOrdersFilters,
  SearchProductsFilters,
  SearchReindexEntity,
  SearchReindexItemResult,
  SearchReindexResult,
  SearchStatusResponse
} from './search.types';

type CustomerSearchSource = {
  id: string;
  tenant_Id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  status: CustomerCareStatus;
  customerStage: string | null;
  totalSpent: Prisma.Decimal | number | string | null;
  updatedAt: Date;
};

type OrderSearchSource = {
  id: string;
  tenant_Id: string;
  orderNo: string | null;
  customerName: string | null;
  status: GenericStatus;
  totalAmount: Prisma.Decimal | number | string | null;
  createdAt: Date;
};

type ProductSearchSource = {
  id: string;
  tenant_Id: string;
  name: string;
  sku: string | null;
  categoryPath: string | null;
  status: GenericStatus;
  archivedAt: Date | null;
  unitPrice: Prisma.Decimal | number | string;
  createdAt: Date;
};

type CustomerSearchDocument = {
  id: string;
  tenant_Id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  status: string;
  customerStage: string | null;
  totalSpent: number | null;
  updatedAt: string;
};

type OrderSearchDocument = {
  id: string;
  tenant_Id: string;
  orderNo: string | null;
  customerName: string | null;
  status: string;
  totalAmount: number | null;
  createdAt: string;
};

type ProductSearchDocument = {
  id: string;
  tenant_Id: string;
  name: string;
  sku: string | null;
  categoryPath: string | null;
  status: string;
  archivedAt: string | null;
  unitPrice: number;
  createdAt: string;
};

const INDEX_SETTINGS: Record<SearchEntity, { searchable: string[]; filterable: string[]; sortable: string[] }> = {
  customers: {
    searchable: ['fullName', 'email', 'phone', 'tags'],
    filterable: ['tenant_Id', 'status', 'customerStage'],
    sortable: ['updatedAt', 'totalSpent']
  },
  orders: {
    searchable: ['orderNo', 'customerName'],
    filterable: ['tenant_Id', 'status'],
    sortable: ['createdAt', 'totalAmount']
  },
  products: {
    searchable: ['name', 'sku', 'categoryPath'],
    filterable: ['tenant_Id', 'status', 'archivedAt'],
    sortable: ['createdAt', 'unitPrice']
  }
};

const REINDEX_BATCH_SIZE = 500;
const FEDERATED_SEARCH_MIN_QUERY_LENGTH = 2;
const FEDERATED_DEFAULT_LIMIT = 6;
const FEDERATED_MAX_LIMIT = 20;

const FEDERATED_GROUP_META: Record<FederatedSearchEntity, { label: string; icon: string; modulePath: string }> = {
  customers: { label: 'Khách hàng', icon: 'users', modulePath: '/modules/crm' },
  orders: { label: 'Đơn hàng', icon: 'shopping-cart', modulePath: '/modules/sales' },
  invoices: { label: 'Hóa đơn', icon: 'file-text', modulePath: '/modules/finance' },
  products: { label: 'Sản phẩm', icon: 'package', modulePath: '/modules/catalog' },
  employees: { label: 'Nhân sự', icon: 'user-check', modulePath: '/modules/hr' },
  projects: { label: 'Dự án', icon: 'folder-kanban', modulePath: '/modules/projects' },
  purchaseOrders: { label: 'Mua hàng (PO)', icon: 'truck', modulePath: '/modules/scm' },
  workflowTasks: { label: 'Workflow / Tasks', icon: 'git-branch', modulePath: '/modules/workflows' },
  reports: { label: 'Báo cáo', icon: 'bar-chart-3', modulePath: '/modules/reports' }
};

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private client: MeiliSearch | null = null;
  private indexesReady = false;
  private ensureIndexesPromise: Promise<void> | null = null;
  private runtimePolicy: {
    engine: 'sql' | 'meili_hybrid';
    timeoutMs: number;
    indexPrefix: string;
    writeSyncEnabled: boolean;
    expiresAt: number;
  } = {
    engine: 'sql',
    timeoutMs: 45_000,
    indexPrefix: 'erp',
    writeSyncEnabled: false,
    expiresAt: 0
  };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async globalSearch(query: GlobalSearchQueryDto): Promise<FederatedSearchResponse> {
    const keyword = String(query.q ?? '').trim();
    if (keyword.length < FEDERATED_SEARCH_MIN_QUERY_LENGTH) {
      throw new BadRequestException(
        `Từ khóa tìm kiếm phải có ít nhất ${FEDERATED_SEARCH_MIN_QUERY_LENGTH} ký tự.`
      );
    }

    const limitPerGroup = this.normalizeFederatedLimit(query.limit);
    const tenantId = this.prisma.getTenantId();
    const contains = { contains: keyword, mode: 'insensitive' as const };

    const [
      customers,
      orders,
      invoices,
      products,
      employees,
      projects,
      purchaseOrders,
      workflowInstances,
      projectTasks,
      reports
    ] = await Promise.all([
      this.prisma.client.customer.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [
            { fullName: contains },
            { email: contains },
            { phone: contains },
            { code: contains }
          ]
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.order.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ orderNo: contains }, { customerName: contains }, { id: contains }]
        },
        select: {
          id: true,
          orderNo: true,
          customerName: true,
          status: true,
          totalAmount: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.invoice.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ invoiceNo: contains }, { partnerName: contains }, { id: contains }]
        },
        select: {
          id: true,
          invoiceNo: true,
          partnerName: true,
          status: true,
          totalAmount: true,
          dueAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.product.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ name: contains }, { sku: contains }, { categoryPath: contains }]
        },
        select: {
          id: true,
          sku: true,
          name: true,
          categoryPath: true,
          status: true,
          unitPrice: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.employee.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [
            { fullName: contains },
            { email: contains },
            { phone: contains },
            { code: contains },
            { department: contains },
            { position: contains }
          ]
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          email: true,
          department: true,
          position: true,
          status: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.project.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ code: contains }, { name: contains }, { description: contains }]
        },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          startAt: true,
          endAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.purchaseOrder.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [
            { poNo: contains },
            { relatedSalesOrderNo: contains },
            { notes: contains },
            { vendor: { is: { name: contains } } }
          ]
        },
        select: {
          id: true,
          poNo: true,
          relatedSalesOrderNo: true,
          lifecycleStatus: true,
          status: true,
          totalAmount: true,
          updatedAt: true,
          vendor: {
            select: {
              name: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.workflowInstance.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [
            { targetType: contains },
            { targetId: contains },
            { currentStep: contains }
          ]
        },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          currentStep: true,
          status: true,
          updatedAt: true,
          definition: {
            select: {
              name: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.projectTask.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ title: contains }, { assignedTo: contains }]
        },
        select: {
          id: true,
          title: true,
          assignedTo: true,
          status: true,
          updatedAt: true,
          project: {
            select: {
              code: true,
              name: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      }),
      this.prisma.client.report.findMany({
        where: {
          tenant_Id: tenantId,
          OR: [{ name: contains }, { reportType: contains }, { moduleName: contains }, { templateCode: contains }]
        },
        select: {
          id: true,
          name: true,
          reportType: true,
          moduleName: true,
          outputFormat: true,
          status: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: limitPerGroup
      })
    ]);

    const workflowTaskItems = [
      ...workflowInstances.map((item) => ({
        id: item.id,
        title: item.definition?.name
          ? `${item.definition.name} • ${item.targetId || item.id}`
          : `${item.targetType} • ${item.targetId || item.id}`,
        snippet: [
          item.targetType ? `Loại: ${item.targetType}` : '',
          item.currentStep ? `Bước: ${item.currentStep}` : ''
        ]
          .filter(Boolean)
          .join(' • '),
        status: item.status,
        meta: this.relativeTimeLabel(item.updatedAt),
        target: this.buildModuleTarget('workflowTasks', item.targetId || item.id),
        sortTime: item.updatedAt.getTime()
      })),
      ...projectTasks.map((item) => ({
        id: item.id,
        title: item.project?.code
          ? `[${item.project.code}] ${item.title}`
          : item.title,
        snippet: [
          item.project?.name ? `Dự án: ${item.project.name}` : '',
          item.assignedTo ? `Phụ trách: ${item.assignedTo}` : ''
        ]
          .filter(Boolean)
          .join(' • '),
        status: item.status,
        meta: this.relativeTimeLabel(item.updatedAt),
        target: this.buildModuleTarget('workflowTasks', item.title),
        sortTime: item.updatedAt.getTime()
      }))
    ]
      .sort((left, right) => right.sortTime - left.sortTime)
      .slice(0, limitPerGroup)
      .map((item) => ({
        id: item.id,
        title: item.title,
        snippet: item.snippet,
        status: item.status,
        meta: item.meta,
        target: item.target
      }));

    const groups: FederatedSearchResultGroup[] = [
      this.buildFederatedGroup(
        'customers',
        customers.map((item) => ({
          id: item.id,
          title: item.code ? `${item.fullName} (${item.code})` : item.fullName,
          snippet: [item.email, item.phone].filter(Boolean).join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('customers', item.fullName)
        }))
      ),
      this.buildFederatedGroup(
        'orders',
        orders.map((item) => ({
          id: item.id,
          title: item.orderNo ? `Đơn ${item.orderNo}` : `Đơn ${item.id}`,
          snippet: [item.customerName, this.currencyLabel(item.totalAmount)].filter(Boolean).join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('orders', item.orderNo || item.id)
        }))
      ),
      this.buildFederatedGroup(
        'invoices',
        invoices.map((item) => ({
          id: item.id,
          title: item.invoiceNo ? `Hóa đơn ${item.invoiceNo}` : `Hóa đơn ${item.id}`,
          snippet: [
            item.partnerName,
            this.currencyLabel(item.totalAmount),
            item.dueAt ? `Hạn: ${item.dueAt.toLocaleDateString('vi-VN')}` : ''
          ]
            .filter(Boolean)
            .join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('invoices', item.invoiceNo || item.id)
        }))
      ),
      this.buildFederatedGroup(
        'products',
        products.map((item) => ({
          id: item.id,
          title: item.sku ? `${item.name} (${item.sku})` : item.name,
          snippet: [item.categoryPath, this.currencyLabel(item.unitPrice)].filter(Boolean).join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('products', item.sku || item.name)
        }))
      ),
      this.buildFederatedGroup(
        'employees',
        employees.map((item) => ({
          id: item.id,
          title: item.code ? `${item.fullName} (${item.code})` : item.fullName,
          snippet: [item.department, item.position, item.email].filter(Boolean).join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('employees', item.fullName)
        }))
      ),
      this.buildFederatedGroup(
        'projects',
        projects.map((item) => ({
          id: item.id,
          title: item.code ? `${item.name} (${item.code})` : item.name,
          snippet: [item.startAt ? `Bắt đầu: ${item.startAt.toLocaleDateString('vi-VN')}` : '', item.endAt ? `Kết thúc: ${item.endAt.toLocaleDateString('vi-VN')}` : '']
            .filter(Boolean)
            .join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('projects', item.code || item.name)
        }))
      ),
      this.buildFederatedGroup(
        'purchaseOrders',
        purchaseOrders.map((item) => ({
          id: item.id,
          title: item.poNo ? `PO ${item.poNo}` : `PO ${item.id}`,
          snippet: [
            item.vendor?.name,
            item.relatedSalesOrderNo ? `SO: ${item.relatedSalesOrderNo}` : '',
            this.currencyLabel(item.totalAmount),
            item.lifecycleStatus
          ]
            .filter(Boolean)
            .join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('purchaseOrders', item.poNo || item.id)
        }))
      ),
      this.buildFederatedGroup('workflowTasks', workflowTaskItems),
      this.buildFederatedGroup(
        'reports',
        reports.map((item) => ({
          id: item.id,
          title: item.name,
          snippet: [item.reportType, item.moduleName, item.outputFormat].filter(Boolean).join(' • '),
          status: item.status,
          meta: this.relativeTimeLabel(item.updatedAt),
          target: this.buildModuleTarget('reports', item.name)
        }))
      )
    ].filter((group) => group.count > 0);

    return {
      query: keyword,
      total: groups.reduce((sum, group) => sum + group.count, 0),
      limitPerGroup,
      generatedAt: new Date().toISOString(),
      groups
    };
  }

  async shouldUseHybridSearch(keyword?: string, cursor?: string): Promise<boolean> {
    await this.refreshRuntimePolicy();
    return this.isHybridEnabled() && !!keyword?.trim() && !cursor;
  }

  async searchCustomerIds(
    keyword: string,
    tenantId: string,
    limit: number,
    filters: SearchCustomersFilters = {}
  ): Promise<string[] | null> {
    const clauses: string[] = [];

    if (filters.status) {
      clauses.push(`status = ${this.toFilterValue(filters.status)}`);
    }
    if (filters.stage) {
      clauses.push(`customerStage = ${this.toFilterValue(filters.stage)}`);
    }
    if (filters.tag) {
      clauses.push(`tags = ${this.toFilterValue(filters.tag)}`);
    }

    return this.searchIds('customers', keyword, tenantId, limit, clauses);
  }

  async searchOrderIds(
    keyword: string,
    tenantId: string,
    limit: number,
    filters: SearchOrdersFilters = {}
  ): Promise<string[] | null> {
    const clauses: string[] = [];
    if (filters.status) {
      clauses.push(`status = ${this.toFilterValue(filters.status)}`);
    }

    return this.searchIds('orders', keyword, tenantId, limit, clauses);
  }

  async searchProductIds(
    keyword: string,
    tenantId: string,
    limit: number,
    filters: SearchProductsFilters = {}
  ): Promise<string[] | null> {
    const clauses: string[] = [];

    if (filters.status) {
      clauses.push(`status = ${this.toFilterValue(filters.status)}`);
    }
    if (!filters.includeArchived) {
      clauses.push('archivedAt IS NULL');
    }

    return this.searchIds('products', keyword, tenantId, limit, clauses);
  }

  async syncCustomerUpsert(customer: CustomerSearchSource): Promise<void> {
    await this.runWriteSync('customers', customer.id, customer.tenant_Id, async () => {
      const index = this.getIndex('customers');
      await index.addDocuments([this.mapCustomerDocument(customer)], { primaryKey: 'id' });
    });
  }

  async syncCustomerDelete(id: string, tenantId: string): Promise<void> {
    await this.runWriteSync('customers', id, tenantId, async () => {
      const index = this.getIndex('customers');
      await index.deleteDocument(id);
    });
  }

  async syncOrderUpsert(order: OrderSearchSource): Promise<void> {
    await this.runWriteSync('orders', order.id, order.tenant_Id, async () => {
      const index = this.getIndex('orders');
      await index.addDocuments([this.mapOrderDocument(order)], { primaryKey: 'id' });
    });
  }

  async syncOrderDelete(id: string, tenantId: string): Promise<void> {
    await this.runWriteSync('orders', id, tenantId, async () => {
      const index = this.getIndex('orders');
      await index.deleteDocument(id);
    });
  }

  async syncProductUpsert(product: ProductSearchSource): Promise<void> {
    await this.runWriteSync('products', product.id, product.tenant_Id, async () => {
      const index = this.getIndex('products');
      await index.addDocuments([this.mapProductDocument(product)], { primaryKey: 'id' });
    });
  }

  async syncProductDelete(id: string, tenantId: string): Promise<void> {
    await this.runWriteSync('products', id, tenantId, async () => {
      const index = this.getIndex('products');
      await index.deleteDocument(id);
    });
  }

  async getStatus(): Promise<SearchStatusResponse> {
    await this.refreshRuntimePolicy(true);
    const checkedAt = new Date().toISOString();
    const meiliConfigured = this.isMeiliConfigured();

    if (!meiliConfigured) {
      return {
        engine: this.getSearchEngine(),
        hybridEnabled: this.isHybridEnabled(),
        writeSyncEnabled: this.isWriteSyncEnabled(),
        meiliConfigured,
        meiliHost: null,
        indexPrefix: this.getIndexPrefix(),
        timeoutMs: this.getTimeoutMs(),
        healthy: false,
        checkedAt,
        indexes: {}
      };
    }

    const indexes: Partial<Record<SearchEntity, { numberOfDocuments: number; isIndexing: boolean }>> = {};

    try {
      await this.ensureIndexes();
      await this.getClient().health();

      for (const entity of SEARCH_ENTITIES) {
        try {
          const stats = await this.getIndex(entity).getStats();
          indexes[entity] = {
            numberOfDocuments: Number(stats.numberOfDocuments ?? 0),
            isIndexing: Boolean(stats.isIndexing)
          };
        } catch (error) {
          this.logger.warn(
            `Không lấy được stats index ${this.getIndexUid(entity)}: ${this.describeError(error)}`
          );
        }
      }

      return {
        engine: this.getSearchEngine(),
        hybridEnabled: this.isHybridEnabled(),
        writeSyncEnabled: this.isWriteSyncEnabled(),
        meiliConfigured,
        meiliHost: this.getMeiliHost(),
        indexPrefix: this.getIndexPrefix(),
        timeoutMs: this.getTimeoutMs(),
        healthy: true,
        checkedAt,
        indexes
      };
    } catch (error) {
      return {
        engine: this.getSearchEngine(),
        hybridEnabled: this.isHybridEnabled(),
        writeSyncEnabled: this.isWriteSyncEnabled(),
        meiliConfigured,
        meiliHost: this.getMeiliHost(),
        indexPrefix: this.getIndexPrefix(),
        timeoutMs: this.getTimeoutMs(),
        healthy: false,
        error: this.describeError(error),
        checkedAt,
        indexes
      };
    }
  }

  async reindex(entity: SearchReindexEntity): Promise<SearchReindexResult> {
    await this.refreshRuntimePolicy();
    if (!this.isMeiliConfigured()) {
      throw new BadRequestException('MEILI_HOST chưa được cấu hình. Không thể reindex.');
    }

    await this.ensureIndexes();

    const startedAt = new Date();
    const targets = entity === 'all' ? [...SEARCH_ENTITIES] : [entity];
    const results: SearchReindexItemResult[] = [];

    for (const target of targets) {
      const targetStartedAt = new Date();
      const indexedCount = await this.reindexEntity(target);
      const targetFinishedAt = new Date();
      results.push({
        entity: target,
        indexedCount,
        startedAt: targetStartedAt.toISOString(),
        finishedAt: targetFinishedAt.toISOString(),
        durationMs: targetFinishedAt.getTime() - targetStartedAt.getTime()
      });
    }

    const finishedAt = new Date();
    return {
      entity,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      results
    };
  }

  private async searchIds(
    entity: SearchEntity,
    keyword: string,
    tenantId: string,
    limit: number,
    additionalClauses: string[]
  ): Promise<string[] | null> {
    await this.refreshRuntimePolicy();
    if (!keyword.trim()) {
      return [];
    }
    if (!this.isMeiliConfigured()) {
      return null;
    }

    try {
      await this.ensureIndexes();
      const index = this.getIndex(entity);
      const clauses = [`tenant_Id = ${this.toFilterValue(tenantId)}`, ...additionalClauses];
      const filterExpression = clauses.join(' AND ');
      const response = await index.search<{ id: string }>(keyword, {
        attributesToRetrieve: ['id'],
        filter: filterExpression,
        limit: this.normalizeLimit(limit)
      });

      return (response.hits ?? [])
        .map((item) => String(item.id))
        .filter((id) => !!id);
    } catch (error) {
      this.logger.warn(
        `Search Meili lỗi ở entity=${entity}, tenant=${tenantId}. Fallback SQL. ${this.describeError(error)}`
      );
      return null;
    }
  }

  private async runWriteSync(
    entity: SearchEntity,
    id: string,
    tenantId: string,
    fn: () => Promise<void>
  ): Promise<void> {
    await this.refreshRuntimePolicy();
    if (!this.isWriteSyncEnabled() || !this.isMeiliConfigured()) {
      return;
    }

    try {
      await this.ensureIndexes();
      await fn();
    } catch (error) {
      this.logger.warn(
        `Write sync lỗi entity=${entity} id=${id} tenant=${tenantId}: ${this.describeError(error)}`
      );
    }
  }

  private async ensureIndexes(): Promise<void> {
    await this.refreshRuntimePolicy();
    if (!this.isMeiliConfigured() || this.indexesReady) {
      return;
    }

    if (this.ensureIndexesPromise) {
      await this.ensureIndexesPromise;
      return;
    }

    this.ensureIndexesPromise = this.doEnsureIndexes();
    try {
      await this.ensureIndexesPromise;
      this.indexesReady = true;
    } finally {
      this.ensureIndexesPromise = null;
    }
  }

  private async doEnsureIndexes(): Promise<void> {
    for (const entity of SEARCH_ENTITIES) {
      const indexUid = this.getIndexUid(entity);
      const index = this.getIndex(entity);

      try {
        const task = await this.getClient().createIndex(indexUid, { primaryKey: 'id' });
        await this.waitForTask(task.taskUid);
      } catch (error) {
        if (!this.isIndexAlreadyExistsError(error)) {
          throw error;
        }
      }

      const settings = INDEX_SETTINGS[entity];
      const searchableTask = await index.updateSearchableAttributes(settings.searchable);
      await this.waitForTask(searchableTask.taskUid);

      const filterableTask = await index.updateFilterableAttributes(settings.filterable);
      await this.waitForTask(filterableTask.taskUid);

      const sortableTask = await index.updateSortableAttributes(settings.sortable);
      await this.waitForTask(sortableTask.taskUid);
    }
  }

  private async reindexEntity(entity: SearchEntity): Promise<number> {
    switch (entity) {
      case 'customers':
        return this.reindexCustomers();
      case 'orders':
        return this.reindexOrders();
      case 'products':
        return this.reindexProducts();
      default:
        return 0;
    }
  }

  private async reindexCustomers(): Promise<number> {
    const index = this.getIndex('customers');
    const deleteTask = await index.deleteAllDocuments();
    await this.waitForTask(deleteTask.taskUid);

    let cursor: string | undefined;
    let indexedCount = 0;

    while (true) {
      const rows = await this.prisma.client.customer.findMany({
        select: {
          id: true,
          tenant_Id: true,
          fullName: true,
          email: true,
          phone: true,
          tags: true,
          status: true,
          customerStage: true,
          totalSpent: true,
          updatedAt: true
        },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: REINDEX_BATCH_SIZE
      });

      if (rows.length === 0) {
        break;
      }

      const docs = rows.map((row) => this.mapCustomerDocument(row));
      const task = await index.addDocuments(docs, { primaryKey: 'id' });
      await this.waitForTask(task.taskUid);

      indexedCount += docs.length;
      cursor = rows[rows.length - 1]?.id;
    }

    return indexedCount;
  }

  private async reindexOrders(): Promise<number> {
    const index = this.getIndex('orders');
    const deleteTask = await index.deleteAllDocuments();
    await this.waitForTask(deleteTask.taskUid);

    let cursor: string | undefined;
    let indexedCount = 0;

    while (true) {
      const rows = await this.prisma.client.order.findMany({
        select: {
          id: true,
          tenant_Id: true,
          orderNo: true,
          customerName: true,
          status: true,
          totalAmount: true,
          createdAt: true
        },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: REINDEX_BATCH_SIZE
      });

      if (rows.length === 0) {
        break;
      }

      const docs = rows.map((row) => this.mapOrderDocument(row));
      const task = await index.addDocuments(docs, { primaryKey: 'id' });
      await this.waitForTask(task.taskUid);

      indexedCount += docs.length;
      cursor = rows[rows.length - 1]?.id;
    }

    return indexedCount;
  }

  private async reindexProducts(): Promise<number> {
    const index = this.getIndex('products');
    const deleteTask = await index.deleteAllDocuments();
    await this.waitForTask(deleteTask.taskUid);

    let cursor: string | undefined;
    let indexedCount = 0;

    while (true) {
      const rows = await this.prisma.client.product.findMany({
        select: {
          id: true,
          tenant_Id: true,
          name: true,
          sku: true,
          categoryPath: true,
          status: true,
          archivedAt: true,
          unitPrice: true,
          createdAt: true
        },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: REINDEX_BATCH_SIZE
      });

      if (rows.length === 0) {
        break;
      }

      const docs = rows.map((row) => this.mapProductDocument(row));
      const task = await index.addDocuments(docs, { primaryKey: 'id' });
      await this.waitForTask(task.taskUid);

      indexedCount += docs.length;
      cursor = rows[rows.length - 1]?.id;
    }

    return indexedCount;
  }

  private mapCustomerDocument(row: CustomerSearchSource): CustomerSearchDocument {
    return {
      id: row.id,
      tenant_Id: row.tenant_Id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      tags: Array.isArray(row.tags) ? row.tags : [],
      status: String(row.status),
      customerStage: row.customerStage,
      totalSpent: this.toNullableNumber(row.totalSpent),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private mapOrderDocument(row: OrderSearchSource): OrderSearchDocument {
    return {
      id: row.id,
      tenant_Id: row.tenant_Id,
      orderNo: row.orderNo,
      customerName: row.customerName,
      status: String(row.status),
      totalAmount: this.toNullableNumber(row.totalAmount),
      createdAt: row.createdAt.toISOString()
    };
  }

  private mapProductDocument(row: ProductSearchSource): ProductSearchDocument {
    return {
      id: row.id,
      tenant_Id: row.tenant_Id,
      name: row.name,
      sku: row.sku,
      categoryPath: row.categoryPath,
      status: String(row.status),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      unitPrice: this.toNumber(row.unitPrice),
      createdAt: row.createdAt.toISOString()
    };
  }

  private toNumber(value: Prisma.Decimal | number | string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toNullableNumber(value: Prisma.Decimal | number | string | null): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private currencyLabel(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) {
      return '';
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return '';
    }
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private normalizeFederatedLimit(limitRaw?: number) {
    const limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit <= 0) {
      return FEDERATED_DEFAULT_LIMIT;
    }
    return Math.min(Math.trunc(limit), FEDERATED_MAX_LIMIT);
  }

  private buildModuleTarget(entity: FederatedSearchEntity, q: string) {
    const moduleMeta = FEDERATED_GROUP_META[entity];
    const keyword = String(q ?? '').trim();
    if (!keyword) {
      return moduleMeta.modulePath;
    }
    const params = new URLSearchParams({ q: keyword });
    return `${moduleMeta.modulePath}?${params.toString()}`;
  }

  private buildFederatedGroup(
    entity: FederatedSearchEntity,
    items: FederatedSearchResultGroup['items']
  ): FederatedSearchResultGroup {
    const meta = FEDERATED_GROUP_META[entity];
    return {
      entity,
      label: meta.label,
      icon: meta.icon,
      count: items.length,
      items
    };
  }

  private relativeTimeLabel(value: Date | null | undefined) {
    if (!value) {
      return '';
    }
    const deltaMs = Date.now() - value.getTime();
    if (!Number.isFinite(deltaMs)) {
      return '';
    }
    const minutes = Math.max(1, Math.floor(deltaMs / 60_000));
    if (minutes < 60) {
      return `${minutes} phút trước`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} giờ trước`;
    }
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return 50;
    }
    return Math.min(Math.round(limit), 500);
  }

  private getIndex(entity: SearchEntity) {
    return this.getClient().index(this.getIndexUid(entity));
  }

  private getIndexUid(entity: SearchEntity): string {
    return `${this.runtimePolicy.indexPrefix}_${entity}`;
  }

  private getClient(): MeiliSearch {
    if (this.client) {
      return this.client;
    }

    const host = this.getMeiliHost();
    if (!host) {
      throw new Error('MEILI_HOST is not configured');
    }

    this.client = new MeiliSearch({
      host,
      apiKey: this.getMeiliMasterKey()
    });

    return this.client;
  }

  private async waitForTask(taskUid: number): Promise<void> {
    await this.getClient().tasks.waitForTask(taskUid, {
      timeout: this.runtimePolicy.timeoutMs,
      interval: 50
    });
  }

  private isIndexAlreadyExistsError(error: unknown): boolean {
    const code = this.readErrorField(error, 'code');
    return code === 'index_already_exists';
  }

  private describeError(error: unknown): string {
    const message = this.readErrorField(error, 'message');
    if (message) {
      return message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private readErrorField(error: unknown, field: 'code' | 'message'): string {
    if (!error || typeof error !== 'object') {
      return '';
    }

    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : '';
  }

  private toFilterValue(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  private isHybridEnabled(): boolean {
    return this.getSearchEngine() === 'meili_hybrid';
  }

  private isWriteSyncEnabled(): boolean {
    return this.runtimePolicy.writeSyncEnabled;
  }

  private getSearchEngine(): string {
    return this.runtimePolicy.engine;
  }

  private isMeiliConfigured(): boolean {
    return !!this.getMeiliHost();
  }

  private getMeiliHost(): string | null {
    const value = this.readString('MEILI_HOST', '');
    return value ? value : null;
  }

  private getMeiliMasterKey(): string | undefined {
    const value = this.readString('MEILI_MASTER_KEY', '');
    return value || undefined;
  }

  private getIndexPrefix(): string {
    return this.runtimePolicy.indexPrefix;
  }

  private getTimeoutMs(): number {
    return this.runtimePolicy.timeoutMs;
  }

  private async refreshRuntimePolicy(force = false) {
    const now = Date.now();
    if (!force && this.runtimePolicy.expiresAt > now) {
      return;
    }

    const settingsPolicy = await this.runtimeSettings.getSearchPerformanceRuntime();
    this.runtimePolicy = {
      engine: settingsPolicy.engine === 'meili_hybrid' ? 'meili_hybrid' : 'sql',
      timeoutMs: settingsPolicy.timeoutMs,
      indexPrefix: settingsPolicy.indexPrefix || 'erp',
      writeSyncEnabled: settingsPolicy.writeSyncEnabled,
      expiresAt: now + 10_000
    };
  }

  private readString(name: string, fallback: string): string {
    const value = this.config.get<string>(name);
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
  }

  private readBoolean(name: string, fallback: boolean): boolean {
    const value = this.config.get<string>(name)?.trim().toLowerCase();
    if (!value) {
      return fallback;
    }
    if (value === '1' || value === 'true' || value === 'yes') {
      return true;
    }
    if (value === '0' || value === 'false' || value === 'no') {
      return false;
    }
    return fallback;
  }

  private readInt(name: string, fallback: number, min: number, max: number): number {
    const raw = this.config.get<string>(name);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }
}
