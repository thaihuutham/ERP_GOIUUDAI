import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CustomerCareStatus, CustomerZaloNickType, GenericStatus, Prisma, UserRole } from '@prisma/client';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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

@Injectable()
export class CrmService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Optional() @Inject(IamScopeFilterService) private readonly iamScopeFilter?: IamScopeFilterService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService
  ) {}

  async listCustomers(
    query: PaginationQueryDto,
    filters: { status?: CustomerCareStatus | 'ALL'; stage?: string; tag?: string } = {},
    entityIds?: string[]
  ) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = query.q?.trim();
    const normalizedTag = this.cleanString(filters.tag).toLowerCase();

    const where: Prisma.CustomerWhereInput = {
      ...(Array.isArray(entityIds) ? { id: { in: entityIds } } : {})
    };

    const scopeFilter = await this.resolveCustomerScopeFilter();
    if (!scopeFilter.companyWide) {
      if (scopeFilter.actorIds.length === 0) {
        where.id = { in: [] };
      } else {
        where.ownerStaffId = { in: scopeFilter.actorIds };
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
      where.status = normalizedStatus;
    }

    if (normalizedStage) {
      where.customerStage = normalizedStage;
    }

    if (normalizedTag) {
      where.tags = { has: normalizedTag };
    }

    if (keyword && await this.search.shouldUseHybridSearch(keyword, query.cursor)) {
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
              where: {
                ...where,
                id: { in: lookupIds }
              }
            })
          : [];

        const orderedRows = this.rankByIds(rankedRows, lookupIds);
        const hasMore = rankedIds.length > take;
        const items = hasMore ? orderedRows.slice(0, take) : orderedRows;

        return {
          items,
          nextCursor: null,
          limit: take
        };
      }
    }

    if (keyword) {
      where.OR = [
        { fullName: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } }
      ];
    }

    const rows = await this.prisma.client.customer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
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
        nextStatus
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
          source: normalizedTaxonomy.source ?? duplicate.source,
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
        source: normalizedTaxonomy.source ?? null,
        needsSummary: this.optionalString(payload.needsSummary) ?? null,
        ownerStaffId: this.optionalString(payload.ownerStaffId) ?? null,
        consentStatus: this.optionalString(payload.consentStatus) ?? null,
        customerStage: this.resolveCustomerStageForStatus(normalizedTaxonomy.stage ?? 'MOI', parsedStatus) ?? 'MOI',
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
      nextStatus
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

  async markPaymentRequestPaid(id: string) {
    const row = await this.prisma.client.paymentRequest.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy yêu cầu thanh toán.');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.paymentRequest.updateMany({
        where: { id: row.id },
        data: {
          status: 'DA_THANH_TOAN',
          paidAt: new Date()
        }
      });

      if (row.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: row.customerId } });
        const mergedTags = this.mergeTags(customer?.tags, ['da_mua']);

        await tx.customer.updateMany({
          where: { id: row.customerId },
          data: {
            customerStage: 'DA_MUA',
            lastOrderAt: new Date(),
            tags: mergedTags
          }
        });
      }

      if (row.invoiceId || row.invoiceNo) {
        await tx.invoice.updateMany({
          where: row.invoiceId ? { id: row.invoiceId } : { invoiceNo: row.invoiceNo ?? undefined },
          data: { status: GenericStatus.APPROVED }
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
      normalizedTaxonomy.stage ?? existing?.customerStage ?? 'MOI',
      nextStatus
    ) ?? 'MOI';

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
            ? (normalizedTaxonomy.source ?? null)
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
        source: normalizedTaxonomy.source ?? null,
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
    status: CustomerCareStatus
  ) {
    if (status === CustomerCareStatus.DONG_Y_CHUYEN_THANH_KH) {
      return 'DA_MUA';
    }
    return inputStage ?? undefined;
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
    const userId = this.cleanString(auth.userId)
      || this.cleanString(auth.sub)
      || this.cleanString(auth.email);

    return {
      role,
      userId,
    };
  }
}
