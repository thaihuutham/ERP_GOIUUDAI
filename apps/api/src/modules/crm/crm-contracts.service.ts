import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import {
  ContractRenewalReminderStatus,
  ConversationChannel,
  CustomerCareStatus,
  CustomerSocialPlatform,
  GenericStatus,
  InboundPolicyExtractionStatus,
  InboundPolicyReviewStatus,
  InboundPolicyDocumentSourceType,
  Prisma,
  ServiceContractProductType,
  ServiceContractSourceType,
  ServiceContractStatus,
  TelecomBeneficiaryType,
  UserRole,
  VehicleKind
} from '@prisma/client';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { normalizeVietnamPhone } from '../../common/validation/phone.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  addDays,
  buildReminderDedupeKey,
  computeReminderDueAt,
  computeRenewalBaseDate,
  formatDateKeyInTimeZone,
  resolveTelecomTermDays,
  TELECOM_TERM_DAY_MAP
} from './crm-renewal.util';

type RenewalReminderPolicy = {
  globalLeadDays: number;
  productLeadDays: Partial<Record<ServiceContractProductType, number>>;
};

type IngestionSummary = {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<Record<string, unknown>>;
};

type VehicleImportError = {
  rowIndex: number;
  plateNumber?: string;
  message: string;
};

type VehicleImportSummary = {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: VehicleImportError[];
};

@Injectable()
export class CrmContractsService {
  private readonly logger = new Logger(CrmContractsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService
  ) {}

  async getCustomerDetail(customerId: string) {
    const id = this.requiredString(customerId, 'Thiếu customerId.');
    const customer = await this.prisma.client.customer.findFirst({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng.');
    }

    const [socialIdentities, contracts, vehicles] = await Promise.all([
      this.prisma.client.customerSocialIdentity.findMany({
        where: { customerId: id },
        orderBy: [{ platform: 'asc' }, { updatedAt: 'desc' }]
      }),
      this.prisma.client.serviceContract.findMany({
        where: { customerId: id },
        orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          telecomLine: true,
          autoInsuranceDetail: true,
          motoInsuranceDetail: true,
          digitalServiceDetail: true
        },
        take: 100
      }),
      this.prisma.client.vehicle.findMany({
        where: { ownerCustomerId: id },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200
      })
    ]);

    const now = new Date();
    const activeContracts = contracts.filter((item) => item.status === ServiceContractStatus.ACTIVE);
    const nextExpiringContract = activeContracts
      .filter((item) => item.endsAt.getTime() >= now.getTime())
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())[0] ?? null;

    return {
      customer,
      socialIdentities,
      contractSummary: {
        totalContracts: contracts.length,
        activeContracts: activeContracts.length,
        expiredContracts: contracts.filter((item) => item.status === ServiceContractStatus.EXPIRED).length,
        nextExpiringAt: nextExpiringContract?.endsAt ?? null,
        byProduct: this.buildContractProductSummary(contracts)
      },
      recentContracts: contracts.slice(0, 30),
      vehicles
    };
  }

  async getCustomer360(customerId: string) {
    const id = this.requiredString(customerId, 'Thiếu customerId.');
    const detail = await this.getCustomerDetail(id);

    const [ordersCount, recentOrders, recentInteractions] = await Promise.all([
      this.prisma.client.order.count({
        where: {
          customerId: id
        }
      }),
      this.prisma.client.order.findMany({
        where: {
          customerId: id
        },
        include: {
          items: true,
          invoices: {
            select: {
              id: true,
              invoiceNo: true,
              status: true,
              createdAt: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 30
      }),
      this.prisma.client.customerInteraction.findMany({
        where: {
          customerId: id
        },
        orderBy: [{ interactionAt: 'desc' }],
        take: 50
      })
    ]);

    return {
      ...detail,
      orderSummary: {
        totalOrders: ordersCount,
        totalSpent: detail.customer.totalSpent ?? null,
        lastOrderAt: detail.customer.lastOrderAt ?? recentOrders[0]?.createdAt ?? null
      },
      recentOrders,
      recentInteractions
    };
  }

  async listContracts(query: PaginationQueryDto, filters: Record<string, unknown> = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = this.cleanString(query.q);
    const customerId = this.cleanString(filters.customerId);
    const productType = this.optionalProductType(filters.productType);
    const status = this.optionalContractStatus(filters.status);

    const where: Prisma.ServiceContractWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (productType) {
      where.productType = productType;
    }

    if (status) {
      where.status = status;
    }

    if (keyword) {
      where.OR = [
        { sourceRef: { contains: keyword, mode: 'insensitive' } },
        { customer: { fullName: { contains: keyword, mode: 'insensitive' } } },
        { telecomLine: { servicePhone: { contains: keyword } } },
        { autoInsuranceDetail: { soGCN: { contains: keyword, mode: 'insensitive' } } },
        { motoInsuranceDetail: { soGCN: { contains: keyword, mode: 'insensitive' } } }
      ];
    }

    const rows = await this.prisma.client.serviceContract.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            ownerStaffId: true
          }
        },
        telecomLine: true,
        autoInsuranceDetail: true,
        motoInsuranceDetail: true,
        digitalServiceDetail: true
      },
      orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
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

  async listCustomerContracts(customerId: string, query: PaginationQueryDto) {
    const id = this.requiredString(customerId, 'Thiếu customerId.');
    return this.listContracts(query, { customerId: id });
  }

  async renewContractPreview(contractId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(contractId, 'Thiếu contractId.');
    const contract = await this.prisma.client.serviceContract.findFirst({
      where: { id },
      include: { telecomLine: true }
    });

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng.');
    }

    const transactionAt = payload.transactionDate
      ? this.parseDate(payload.transactionDate, 'transactionDate')
      : new Date();

    const termDays = this.resolveContractTermDays(contract.productType, payload, contract.telecomLine?.termDays ?? undefined);
    if (!termDays || termDays <= 0) {
      throw new BadRequestException('Không xác định được kỳ hạn gia hạn (termDays).');
    }

    const currentExpiryAt = contract.telecomLine?.currentExpiryAt ?? contract.endsAt;
    const baseDate = computeRenewalBaseDate(currentExpiryAt, transactionAt);
    const nextExpiryAt = addDays(baseDate, termDays);
    const reminderLeadDays = await this.resolveContractLeadDays(contract);

    return {
      contractId: contract.id,
      productType: contract.productType,
      currentExpiryAt,
      transactionAt,
      baseDate,
      termDays,
      nextExpiryAt,
      reminderLeadDays,
      reminderDueAt: computeReminderDueAt(nextExpiryAt, reminderLeadDays)
    };
  }

  async listRenewalWorklist(query: PaginationQueryDto, filters: Record<string, unknown> = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const status = this.optionalReminderStatus(filters.status);
    const assigneeStaffId = this.cleanString(filters.assigneeStaffId);

    const where: Prisma.ContractRenewalReminderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (assigneeStaffId) {
      where.assigneeStaffId = assigneeStaffId;
    }

    const rows = await this.prisma.client.contractRenewalReminder.findMany({
      where,
      include: {
        contract: {
          include: {
            customer: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                ownerStaffId: true
              }
            },
            telecomLine: true,
            autoInsuranceDetail: {
              include: {
                vehicle: true
              }
            },
            motoInsuranceDetail: {
              include: {
                vehicle: true
              }
            },
            digitalServiceDetail: true
          }
        }
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
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

  async runRenewalReminderSweep(payload: Record<string, unknown> = {}) {
    const now = payload.now ? this.parseDate(payload.now, 'now') : new Date();
    const maxScan = this.toInt(payload.limit, 1000, 10, 5000);
    const pendingOnly = this.toBool(payload.pendingOnly, true);
    const timezone = this.resolveReminderTimezone();

    const where: Prisma.ServiceContractWhereInput = {
      status: pendingOnly ? ServiceContractStatus.ACTIVE : undefined,
      endsAt: {
        gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      }
    };

    const contracts = await this.prisma.client.serviceContract.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            ownerStaffId: true
          }
        },
        telecomLine: true,
        autoInsuranceDetail: {
          include: {
            vehicle: true
          }
        },
        motoInsuranceDetail: {
          include: {
            vehicle: true
          }
        },
        digitalServiceDetail: true
      },
      orderBy: [{ endsAt: 'asc' }],
      take: maxScan
    });

    let created = 0;
    let notified = 0;
    let skipped = 0;

    for (const contract of contracts) {
      const leadDays = await this.resolveContractLeadDays(contract);
      const dueAt = computeReminderDueAt(contract.endsAt, leadDays);
      if (dueAt.getTime() > now.getTime()) {
        skipped += 1;
        continue;
      }

      const dueDateKey = formatDateKeyInTimeZone(dueAt, timezone);
      const dedupeKey = buildReminderDedupeKey(this.prisma.getTenantId(), contract.id, dueDateKey);
      const existing = await this.prisma.client.contractRenewalReminder.findFirst({
        where: { dedupeKey }
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const assigneeStaffId = this.cleanString(contract.ownerStaffId)
        || this.cleanString(contract.customer?.ownerStaffId)
        || null;

      const reminder = await this.prisma.client.contractRenewalReminder.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          contractId: contract.id,
          dueAt,
          leadDays,
          assigneeStaffId,
          status: ContractRenewalReminderStatus.PENDING,
          dedupeKey
        }
      });
      created += 1;

      if (assigneeStaffId) {
        const title = this.buildReminderTitle(contract.productType);
        const content = this.buildReminderContent(contract);
        await this.notifications.create({
          userId: assigneeStaffId,
          title,
          content,
          templateVersion: 'crm-renewal-v1'
        });
        notified += 1;
      }

      this.logger.log(`Created renewal reminder ${reminder.id} contract=${contract.id} dueAt=${dueAt.toISOString()}`);
    }

    return {
      scanned: contracts.length,
      created,
      notified,
      skipped,
      executedAt: now.toISOString()
    };
  }

  async createSocialIdentity(customerId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(customerId, 'Thiếu customerId.');
    await this.ensureCustomerExists(id);

    const platform = this.parseSocialPlatform(payload.platform);
    const externalUserId = this.requiredString(payload.externalUserId, 'Thiếu externalUserId.');

    const existing = await this.prisma.client.customerSocialIdentity.findFirst({
      where: {
        platform,
        externalUserId
      }
    });

    if (existing && existing.customerId !== id) {
      throw new BadRequestException('externalUserId đã được gán cho khách hàng khác.');
    }

    if (existing) {
      const metadataJson = Object.prototype.hasOwnProperty.call(payload, 'metadataJson')
        ? (this.toDbJson(payload.metadataJson) ?? Prisma.JsonNull)
        : (existing.metadataJson as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined);
      await this.prisma.client.customerSocialIdentity.updateMany({
        where: { id: existing.id },
        data: {
          displayName: this.cleanString(payload.displayName) || existing.displayName,
          phoneHint: this.cleanString(payload.phoneHint) || existing.phoneHint,
          lastSeenAt: payload.lastSeenAt ? this.parseDate(payload.lastSeenAt, 'lastSeenAt') : new Date(),
          metadataJson
        }
      });
      return this.prisma.client.customerSocialIdentity.findFirst({ where: { id: existing.id } });
    }

    return this.prisma.client.customerSocialIdentity.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId: id,
        platform,
        externalUserId,
        displayName: this.cleanString(payload.displayName) || null,
        phoneHint: normalizeVietnamPhone(this.cleanString(payload.phoneHint)) || null,
        lastSeenAt: payload.lastSeenAt ? this.parseDate(payload.lastSeenAt, 'lastSeenAt') : new Date(),
        metadataJson: this.toDbJson(payload.metadataJson) ?? undefined
      }
    });
  }

  async deleteSocialIdentity(identityId: string) {
    const id = this.requiredString(identityId, 'Thiếu identityId.');
    const existing = await this.prisma.client.customerSocialIdentity.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy social identity.');
    }
    await this.prisma.client.customerSocialIdentity.deleteMany({ where: { id } });
    return existing;
  }

  async listVehicles(query: PaginationQueryDto, filters: Record<string, unknown> = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = this.cleanString(query.q);
    const ownerCustomerId = this.cleanString(filters.ownerCustomerId);
    const vehicleKind = this.optionalVehicleKind(filters.vehicleKind);

    const where: Prisma.VehicleWhereInput = {};
    if (ownerCustomerId) {
      where.ownerCustomerId = ownerCustomerId;
    }
    if (vehicleKind) {
      where.vehicleKind = vehicleKind;
    }

    if (keyword) {
      where.OR = [
        { plateNumber: { contains: keyword, mode: 'insensitive' } },
        { chassisNumber: { contains: keyword, mode: 'insensitive' } },
        { engineNumber: { contains: keyword, mode: 'insensitive' } },
        { ownerFullName: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.vehicle.findMany({
      where,
      include: {
        ownerCustomer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            ownerStaffId: true
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }],
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

  async createVehicle(payload: Record<string, unknown>) {
    const body = this.ensureRecord(payload);
    const vehicleKind = this.parseVehicleKind(payload.vehicleKind);
    const ownerCustomerId = this.cleanString(payload.ownerCustomerId) || null;
    const ownerCustomer = ownerCustomerId ? await this.findCustomerOwnership(ownerCustomerId) : null;

    await this.assertVehicleWriteAccess(ownerCustomerId, this.cleanString(ownerCustomer?.ownerStaffId) || null);
    const ownerFullName = this.cleanString(body.ownerFullName) || this.cleanString(ownerCustomer?.fullName);
    if (!ownerFullName) {
      throw new BadRequestException('Thiếu ownerFullName.');
    }

    const data = {
      tenant_Id: this.prisma.getTenantId(),
      ownerCustomerId,
      ownerFullName,
      ownerAddress: this.cleanString(payload.ownerAddress) || null,
      plateNumber: this.requiredString(payload.plateNumber, 'Thiếu plateNumber.').toUpperCase(),
      chassisNumber: this.requiredString(payload.chassisNumber, 'Thiếu chassisNumber.').toUpperCase(),
      engineNumber: this.requiredString(payload.engineNumber, 'Thiếu engineNumber.').toUpperCase(),
      vehicleKind,
      vehicleType: this.requiredString(payload.vehicleType, 'Thiếu vehicleType.'),
      seatCount: this.toOptionalInt(payload.seatCount, 'seatCount'),
      loadKg: this.toOptionalInt(payload.loadKg, 'loadKg'),
      status: this.optionalGenericStatus(payload.status) ?? GenericStatus.ACTIVE
    };

    return this.prisma.client.vehicle.create({ data });
  }

  async importVehicles(payload: Record<string, unknown>): Promise<VehicleImportSummary> {
    const actor = this.resolveVehicleActor();
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin được phép import dữ liệu xe bằng Excel.');
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException('Thiếu dữ liệu rows để import xe.');
    }

    const maxRows = 1000;
    const slicedRows = rows.slice(0, maxRows);
    const errors: VehicleImportError[] = [];
    let importedCount = 0;

    for (let index = 0; index < slicedRows.length; index += 1) {
      const rowRaw = slicedRows[index];
      const row = this.ensureRecord(rowRaw);
      const rowIndex = index + 1;
      const plateNumber = this.cleanString(row.plateNumber) || undefined;

      try {
        const ownerCustomerId = await this.resolveVehicleImportOwnerCustomerId(row);
        await this.createVehicle({
          ...row,
          ownerCustomerId
        });
        importedCount += 1;
      } catch (error) {
        errors.push({
          rowIndex,
          plateNumber,
          message: error instanceof Error ? error.message : 'Không thể import dòng dữ liệu xe.'
        });
      }
    }

    return {
      totalRows: slicedRows.length,
      importedCount,
      skippedCount: slicedRows.length - importedCount,
      errors
    };
  }

  async updateVehicle(vehicleId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(vehicleId, 'Thiếu vehicleId.');
    const body = this.ensureRecord(payload);
    const existing = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: {
        ownerCustomer: {
          select: {
            id: true,
            fullName: true,
            ownerStaffId: true
          }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy xe.');
    }

    await this.assertVehicleWriteAccess(
      existing.ownerCustomerId,
      this.cleanString(existing.ownerCustomer?.ownerStaffId) || null
    );

    let nextOwnerCustomerId = existing.ownerCustomerId;
    let nextOwnerCustomer = existing.ownerCustomer;
    if (this.hasOwn(body, 'ownerCustomerId')) {
      const requestedOwnerCustomerId = this.cleanString(body.ownerCustomerId) || null;
      nextOwnerCustomerId = requestedOwnerCustomerId;
      nextOwnerCustomer = requestedOwnerCustomerId ? await this.findCustomerOwnership(requestedOwnerCustomerId) : null;
      await this.assertVehicleWriteAccess(
        requestedOwnerCustomerId,
        this.cleanString(nextOwnerCustomer?.ownerStaffId) || null
      );
    }

    const data: Prisma.VehicleUncheckedUpdateManyInput = {};

    if (this.hasOwn(body, 'ownerCustomerId')) {
      data.ownerCustomerId = nextOwnerCustomerId;
    }

    if (this.hasOwn(body, 'ownerFullName')) {
      const ownerFullName = this.cleanString(body.ownerFullName) || this.cleanString(nextOwnerCustomer?.fullName);
      if (!ownerFullName) {
        throw new BadRequestException('Thiếu ownerFullName.');
      }
      data.ownerFullName = ownerFullName;
    }

    if (this.hasOwn(body, 'ownerAddress')) {
      data.ownerAddress = this.cleanString(body.ownerAddress) || null;
    }

    if (this.hasOwn(body, 'plateNumber')) {
      data.plateNumber = this.requiredString(body.plateNumber, 'Thiếu plateNumber.').toUpperCase();
    }

    if (this.hasOwn(body, 'chassisNumber')) {
      data.chassisNumber = this.requiredString(body.chassisNumber, 'Thiếu chassisNumber.').toUpperCase();
    }

    if (this.hasOwn(body, 'engineNumber')) {
      data.engineNumber = this.requiredString(body.engineNumber, 'Thiếu engineNumber.').toUpperCase();
    }

    if (this.hasOwn(body, 'vehicleKind')) {
      data.vehicleKind = this.parseVehicleKind(body.vehicleKind);
    }

    if (this.hasOwn(body, 'vehicleType')) {
      data.vehicleType = this.requiredString(body.vehicleType, 'Thiếu vehicleType.');
    }

    if (this.hasOwn(body, 'seatCount')) {
      data.seatCount = this.toOptionalInt(body.seatCount, 'seatCount');
    }

    if (this.hasOwn(body, 'loadKg')) {
      data.loadKg = this.toOptionalInt(body.loadKg, 'loadKg');
    }

    if (this.hasOwn(body, 'status')) {
      const status = this.optionalGenericStatus(body.status);
      if (!status) {
        throw new BadRequestException('status không hợp lệ.');
      }
      data.status = status;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.client.vehicle.updateMany({
        where: { id },
        data
      });
    }

    const updated = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: {
        ownerCustomer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            ownerStaffId: true
          }
        }
      }
    });

    if (!updated) {
      throw new NotFoundException('Không tìm thấy xe sau khi cập nhật.');
    }

    return updated;
  }

  async archiveVehicle(vehicleId: string) {
    const id = this.requiredString(vehicleId, 'Thiếu vehicleId.');
    const existing = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: {
        ownerCustomer: {
          select: {
            id: true,
            ownerStaffId: true
          }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy xe.');
    }

    await this.assertVehicleWriteAccess(
      existing.ownerCustomerId,
      this.cleanString(existing.ownerCustomer?.ownerStaffId) || null
    );

    await this.prisma.client.vehicle.updateMany({
      where: { id },
      data: {
        status: GenericStatus.ARCHIVED
      }
    });

    const archived = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: {
        ownerCustomer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            ownerStaffId: true
          }
        }
      }
    });

    if (!archived) {
      throw new NotFoundException('Không tìm thấy xe sau khi lưu trữ.');
    }

    return archived;
  }

  async getVehiclePolicies(vehicleId: string) {
    const id = this.requiredString(vehicleId, 'Thiếu vehicleId.');
    const vehicle = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: {
        ownerCustomer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        autoInsurancePolicies: {
          include: {
            contract: {
              include: {
                customer: {
                  select: {
                    id: true,
                    fullName: true,
                    phone: true
                  }
                }
              }
            }
          },
          orderBy: [{ policyToAt: 'desc' }]
        },
        motoInsurancePolicies: {
          include: {
            contract: {
              include: {
                customer: {
                  select: {
                    id: true,
                    fullName: true,
                    phone: true
                  }
                }
              }
            }
          },
          orderBy: [{ policyToAt: 'desc' }]
        }
      }
    });

    if (!vehicle) {
      throw new NotFoundException('Không tìm thấy xe.');
    }

    return vehicle;
  }

  async createPolicyDocument(payload: Record<string, unknown>) {
    const customerId = this.cleanString(payload.customerId) || null;
    const vehicleId = this.cleanString(payload.vehicleId) || null;
    if (customerId) {
      await this.ensureCustomerExists(customerId);
    }
    if (vehicleId) {
      await this.ensureVehicleExists(vehicleId);
    }

    return this.prisma.client.inboundPolicyDocument.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId,
        vehicleId,
        uploadUrl: this.requiredString(payload.uploadUrl, 'Thiếu uploadUrl.'),
        sourceType: this.parseDocumentSourceType(payload.sourceType),
        sourceRef: this.cleanString(payload.sourceRef) || null,
        extractionStatus: InboundPolicyExtractionStatus.PENDING,
        reviewStatus: InboundPolicyReviewStatus.PENDING,
        uploadedBy: this.cleanString(payload.uploadedBy) || null
      }
    });
  }

  async extractPolicyDocument(documentId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(documentId, 'Thiếu documentId.');
    const document = await this.prisma.client.inboundPolicyDocument.findFirst({ where: { id } });
    if (!document) {
      throw new NotFoundException('Không tìm thấy policy document.');
    }

    const provider = this.cleanString(payload.provider)
      || this.cleanString(this.config.get<string>('CRM_OCR_DEFAULT_PROVIDER'))
      || 'mock';

    const extraction = this.runOcrExtraction(provider, payload);

    const created = await this.prisma.client.inboundPolicyExtraction.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        documentId: id,
        extractionStatus: extraction.extractionStatus,
        reviewStatus: InboundPolicyReviewStatus.PENDING,
        rawPayloadJson: this.toDbJson(extraction.rawPayload) ?? undefined,
        normalizedPayloadJson: this.toDbJson(extraction.normalizedPayload) ?? undefined,
        confidence: extraction.confidence !== null ? new Prisma.Decimal(extraction.confidence.toFixed(4)) : null,
        provider,
        errorMessage: extraction.errorMessage
      }
    });

    await this.prisma.client.inboundPolicyDocument.updateMany({
      where: { id },
      data: {
        extractionStatus: extraction.extractionStatus,
        reviewStatus: InboundPolicyReviewStatus.PENDING
      }
    });

    return created;
  }

  async approvePolicyDocument(documentId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(documentId, 'Thiếu documentId.');
    const approved = this.toBool(payload.approved, true);
    const reviewedBy = this.cleanString(payload.reviewedBy) || 'system';

    const document = await this.prisma.client.inboundPolicyDocument.findFirst({
      where: { id },
      include: {
        extractions: {
          orderBy: [{ createdAt: 'desc' }]
        }
      }
    });

    if (!document) {
      throw new NotFoundException('Không tìm thấy policy document.');
    }

    const extractionId = this.cleanString(payload.extractionId);
    const extraction = extractionId
      ? document.extractions.find((item) => item.id === extractionId)
      : document.extractions[0];

    if (!extraction) {
      throw new BadRequestException('Không tìm thấy bản trích xuất cần duyệt.');
    }

    if (!approved) {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.inboundPolicyExtraction.updateMany({
          where: { id: extraction.id },
          data: {
            reviewStatus: InboundPolicyReviewStatus.REJECTED,
            reviewedBy,
            reviewedAt: new Date()
          }
        });

        await tx.inboundPolicyDocument.updateMany({
          where: { id: document.id },
          data: {
            reviewStatus: InboundPolicyReviewStatus.REJECTED,
            reviewedBy,
            reviewedAt: new Date()
          }
        });
      });

      return {
        documentId: document.id,
        extractionId: extraction.id,
        status: 'REJECTED'
      };
    }

    if (extraction.extractionStatus !== InboundPolicyExtractionStatus.EXTRACTED) {
      throw new BadRequestException('Bản trích xuất chưa ở trạng thái EXTRACTED.');
    }

    const normalizedPayload = this.ensureRecord(extraction.normalizedPayloadJson);
    const result = await this.prisma.client.$transaction(async (tx) => {
      const upserted = await this.upsertContractBundleFromPayload(tx, normalizedPayload, {
        sourceType: ServiceContractSourceType.OCR_APPROVED,
        sourceRef: this.cleanString(document.sourceRef) || `doc:${document.id}`,
        fallbackCustomerId: document.customerId ?? undefined,
        fallbackVehicleId: document.vehicleId ?? undefined
      });

      await tx.inboundPolicyExtraction.updateMany({
        where: { id: extraction.id },
        data: {
          reviewStatus: InboundPolicyReviewStatus.APPROVED,
          reviewedBy,
          reviewedAt: new Date()
        }
      });

      await tx.inboundPolicyDocument.updateMany({
        where: { id: document.id },
        data: {
          customerId: upserted.customerId ?? document.customerId,
          vehicleId: upserted.vehicleId ?? document.vehicleId,
          reviewStatus: InboundPolicyReviewStatus.APPROVED,
          extractionStatus: InboundPolicyExtractionStatus.EXTRACTED,
          reviewedBy,
          reviewedAt: new Date()
        }
      });

      return upserted;
    });

    return {
      documentId: document.id,
      extractionId: extraction.id,
      status: 'APPROVED',
      ...result
    };
  }

  async syncInsuranceOrders(payload: Record<string, unknown>) {
    const sourceSystem = this.requiredString(payload.sourceSystem, 'Thiếu sourceSystem.');
    const orders = Array.isArray(payload.orders) ? payload.orders : [];

    const summary: IngestionSummary = {
      total: orders.length,
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (let i = 0; i < orders.length; i += 1) {
      const row = this.ensureRecord(orders[i]);
      try {
        const externalOrderId = this.requiredString(row.externalOrderId, 'Thiếu externalOrderId.');
        const existed = await this.prisma.client.externalOrderIngest.findFirst({
          where: {
            sourceSystem,
            externalOrderId
          }
        });
        if (existed) {
          summary.skipped += 1;
          continue;
        }

        const result = await this.prisma.client.$transaction(async (tx) => {
          const upserted = await this.upsertContractBundleFromPayload(tx, row, {
            sourceType: ServiceContractSourceType.EXTERNAL_SYNC,
            sourceRef: `${sourceSystem}:${externalOrderId}`
          });

          await tx.externalOrderIngest.create({
            data: {
              tenant_Id: this.prisma.getTenantId(),
              sourceSystem,
              externalOrderId,
              customerId: upserted.customerId ?? null,
              salesOrderId: upserted.salesOrderId ?? null,
              serviceContractId: upserted.contractId,
              payloadJson: this.toDbJson(row) ?? undefined,
              status: GenericStatus.ACTIVE
            }
          });

          return upserted;
        });

        if (result.contractId) {
          summary.imported += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      sourceSystem,
      summary
    };
  }

  private async upsertContractBundleFromPayload(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    options: {
      sourceType: ServiceContractSourceType;
      sourceRef?: string;
      fallbackCustomerId?: string;
      fallbackVehicleId?: string;
    }
  ) {
    const productType = this.parseProductType(payload.productType);

    const customerId = await this.resolveCustomerForContract(tx, payload.customer, this.cleanString(payload.customerId) || options.fallbackCustomerId);
    const salesOrderId = await this.resolveSalesOrderForContract(tx, payload, customerId);

    const contractSeed = this.ensureRecord(payload.contract);
    const startsAt = this.resolveContractStartDate(productType, payload, contractSeed);
    const endsAt = this.resolveContractEndDate(productType, payload, contractSeed);

    const ownerStaffId = this.cleanString(contractSeed.ownerStaffId)
      || this.cleanString(payload.ownerStaffId)
      || (customerId
        ? (await tx.customer.findFirst({ where: { id: customerId }, select: { ownerStaffId: true } }))?.ownerStaffId
        : null)
      || null;

    const createdContract = await tx.serviceContract.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId: customerId ?? this.requiredString(payload.customerId, 'Thiếu customerId.'),
        salesOrderId: salesOrderId ?? null,
        productType,
        status: this.resolveContractStatus(endsAt),
        startsAt,
        endsAt,
        renewalLeadDaysOverride: this.toOptionalInt(contractSeed.renewalLeadDaysOverride ?? payload.renewalLeadDaysOverride, 'renewalLeadDaysOverride'),
        ownerStaffId,
        sourceType: options.sourceType,
        sourceRef: (options.sourceRef ?? this.cleanString(payload.sourceRef)) || null,
        metadataJson: this.toDbJson(contractSeed.metadataJson ?? payload.metadataJson) ?? undefined
      }
    });

    let vehicleId: string | null = null;

    if (productType === ServiceContractProductType.TELECOM_PACKAGE) {
      const telecom = this.ensureRecord(payload.telecom);
      const termDays = this.resolveContractTermDays(productType, telecom, undefined);
      if (!termDays || termDays <= 0) {
        throw new BadRequestException('Thiếu termDays cho gói viễn thông.');
      }

      const beneficiaryType = this.parseTelecomBeneficiaryType(telecom.beneficiaryType);
      const beneficiaryCustomerId = this.cleanString(telecom.beneficiaryCustomerId) || null;
      if (beneficiaryCustomerId) {
        await this.ensureCustomerExists(beneficiaryCustomerId, tx);
      }

      await tx.telecomServiceLine.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          contractId: createdContract.id,
          servicePhone: this.requiredString(telecom.servicePhone, 'Thiếu servicePhone cho telecom.').trim(),
          servicePhoneNormalized: normalizeVietnamPhone(this.cleanString(telecom.servicePhone)),
          packageCode: this.cleanString(telecom.packageCode) || null,
          packageName: this.requiredString(telecom.packageName, 'Thiếu packageName cho telecom.'),
          termDays,
          currentExpiryAt: endsAt,
          beneficiaryType,
          beneficiaryCustomerId,
          beneficiaryName: this.cleanString(telecom.beneficiaryName) || null,
          beneficiaryPhone: this.cleanString(telecom.beneficiaryPhone) || null,
          beneficiaryPhoneNormalized: normalizeVietnamPhone(this.cleanString(telecom.beneficiaryPhone)) || null,
          beneficiaryRelation: this.cleanString(telecom.beneficiaryRelation) || null
        }
      });
    }

    if (productType === ServiceContractProductType.AUTO_INSURANCE || productType === ServiceContractProductType.MOTO_INSURANCE) {
      const vehicle = this.ensureRecord(payload.vehicle);
      const resolvedVehicleId = options.fallbackVehicleId ?? this.cleanString(payload.vehicleId);
      if (resolvedVehicleId) {
        await this.ensureVehicleExists(resolvedVehicleId, tx);
        vehicleId = resolvedVehicleId;
      } else {
        const upsertedVehicle = await this.findOrCreateVehicle(tx, vehicle, productType, customerId);
        vehicleId = upsertedVehicle.id;
      }

      if (productType === ServiceContractProductType.AUTO_INSURANCE) {
        const autoPolicy = this.ensureRecord(payload.autoPolicy);
        await tx.autoInsurancePolicyDetail.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            contractId: createdContract.id,
            vehicleId,
            soGCN: this.requiredString(autoPolicy.soGCN ?? payload.soGCN, 'Thiếu soGCN bảo hiểm ô tô.'),
            policyFromAt: this.parseDate(autoPolicy.policyFromAt ?? startsAt, 'autoPolicy.policyFromAt'),
            policyToAt: this.parseDate(autoPolicy.policyToAt ?? endsAt, 'autoPolicy.policyToAt'),
            premiumWithVat: this.toOptionalDecimal(autoPolicy.premiumWithVat, 'autoPolicy.premiumWithVat'),
            issuedAt: this.toOptionalDate(autoPolicy.issuedAt, 'autoPolicy.issuedAt'),
            voluntary: this.toBool(autoPolicy.voluntary, false),
            tnDriverSeatCount: this.toOptionalInt(autoPolicy.tnDriverSeatCount, 'autoPolicy.tnDriverSeatCount'),
            tnPassengerSeatCount: this.toOptionalInt(autoPolicy.tnPassengerSeatCount, 'autoPolicy.tnPassengerSeatCount'),
            tnInsuredAmountPerEvent: this.toOptionalDecimal(autoPolicy.tnInsuredAmountPerEvent, 'autoPolicy.tnInsuredAmountPerEvent'),
            tnPremium: this.toOptionalDecimal(autoPolicy.tnPremium, 'autoPolicy.tnPremium')
          }
        });
      }

      if (productType === ServiceContractProductType.MOTO_INSURANCE) {
        const motoPolicy = this.ensureRecord(payload.motoPolicy);
        await tx.motoInsurancePolicyDetail.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            contractId: createdContract.id,
            vehicleId,
            soGCN: this.requiredString(motoPolicy.soGCN ?? payload.soGCN, 'Thiếu soGCN bảo hiểm xe máy.'),
            policyFromAt: this.parseDate(motoPolicy.policyFromAt ?? startsAt, 'motoPolicy.policyFromAt'),
            policyToAt: this.parseDate(motoPolicy.policyToAt ?? endsAt, 'motoPolicy.policyToAt'),
            premiumWithVat: this.toOptionalDecimal(motoPolicy.premiumWithVat, 'motoPolicy.premiumWithVat'),
            issuedAt: this.toOptionalDate(motoPolicy.issuedAt, 'motoPolicy.issuedAt'),
            voluntary: this.toBool(motoPolicy.voluntary, false),
            tnInsuredPersons: this.cleanString(motoPolicy.tnInsuredPersons) || null,
            tnInsuredAmountPerEvent: this.toOptionalDecimal(motoPolicy.tnInsuredAmountPerEvent, 'motoPolicy.tnInsuredAmountPerEvent'),
            tnPremium: this.toOptionalDecimal(motoPolicy.tnPremium, 'motoPolicy.tnPremium')
          }
        });
      }
    }

    if (productType === ServiceContractProductType.DIGITAL_SERVICE) {
      const digital = this.ensureRecord(payload.digital);
      await tx.digitalServiceDetail.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          contractId: createdContract.id,
          serviceName: this.requiredString(digital.serviceName ?? payload.serviceName, 'Thiếu serviceName cho dịch vụ số.'),
          planName: this.cleanString(digital.planName) || null,
          termDays: this.toOptionalInt(digital.termDays, 'digital.termDays'),
          serviceAccountRef: this.cleanString(digital.serviceAccountRef) || null,
          provider: this.cleanString(digital.provider) || null,
          metadataJson: this.toDbJson(digital.metadataJson) ?? undefined
        }
      });
    }

    return {
      contractId: createdContract.id,
      customerId: createdContract.customerId,
      salesOrderId: createdContract.salesOrderId,
      vehicleId
    };
  }

  private resolveContractStartDate(
    productType: ServiceContractProductType,
    payload: Record<string, unknown>,
    contractSeed: Record<string, unknown>
  ) {
    const fromContract = contractSeed.startsAt ?? contractSeed.startAt;
    const fromPayload = payload.startsAt ?? payload.startAt;

    if (fromContract || fromPayload) {
      return this.parseDate(fromContract ?? fromPayload, 'startsAt');
    }

    if (productType === ServiceContractProductType.AUTO_INSURANCE) {
      const autoPolicy = this.ensureRecord(payload.autoPolicy);
      return this.parseDate(autoPolicy.policyFromAt, 'autoPolicy.policyFromAt');
    }

    if (productType === ServiceContractProductType.MOTO_INSURANCE) {
      const motoPolicy = this.ensureRecord(payload.motoPolicy);
      return this.parseDate(motoPolicy.policyFromAt, 'motoPolicy.policyFromAt');
    }

    return new Date();
  }

  private resolveContractEndDate(
    productType: ServiceContractProductType,
    payload: Record<string, unknown>,
    contractSeed: Record<string, unknown>
  ) {
    const fromContract = contractSeed.endsAt ?? contractSeed.endAt;
    const fromPayload = payload.endsAt ?? payload.endAt;

    if (fromContract || fromPayload) {
      return this.parseDate(fromContract ?? fromPayload, 'endsAt');
    }

    if (productType === ServiceContractProductType.AUTO_INSURANCE) {
      const autoPolicy = this.ensureRecord(payload.autoPolicy);
      return this.parseDate(autoPolicy.policyToAt, 'autoPolicy.policyToAt');
    }

    if (productType === ServiceContractProductType.MOTO_INSURANCE) {
      const motoPolicy = this.ensureRecord(payload.motoPolicy);
      return this.parseDate(motoPolicy.policyToAt, 'motoPolicy.policyToAt');
    }

    if (productType === ServiceContractProductType.TELECOM_PACKAGE) {
      const telecom = this.ensureRecord(payload.telecom);
      const termDays = this.resolveContractTermDays(productType, telecom, undefined)
        || this.resolveContractTermDays(productType, payload, undefined)
        || 30;
      const startAt = this.resolveContractStartDate(productType, payload, contractSeed);
      return addDays(startAt, termDays);
    }

    const startAt = this.resolveContractStartDate(productType, payload, contractSeed);
    const termDays = this.resolveContractTermDays(productType, payload, undefined) || 30;
    return addDays(startAt, termDays);
  }

  private resolveContractStatus(endsAt: Date) {
    if (endsAt.getTime() < Date.now()) {
      return ServiceContractStatus.EXPIRED;
    }
    return ServiceContractStatus.ACTIVE;
  }

  private resolveContractTermDays(
    productType: ServiceContractProductType,
    payload: Record<string, unknown>,
    fallback?: number
  ) {
    if (productType !== ServiceContractProductType.TELECOM_PACKAGE) {
      const direct = this.toOptionalInt(payload.termDays, 'termDays');
      return direct ?? fallback ?? null;
    }

    const direct = resolveTelecomTermDays(payload.termDays);
    if (direct) {
      return direct;
    }

    const packageTerm = resolveTelecomTermDays(payload.packageTerm);
    if (packageTerm) {
      return packageTerm;
    }

    const packageCode = this.cleanString(payload.packageCode).toLowerCase();
    if (packageCode && TELECOM_TERM_DAY_MAP[packageCode]) {
      return TELECOM_TERM_DAY_MAP[packageCode];
    }

    return fallback ?? null;
  }

  private async findOrCreateVehicle(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    productType: ServiceContractProductType,
    ownerCustomerId: string | null
  ) {
    const plateNumber = this.requiredString(payload.plateNumber, 'Thiếu plateNumber.').toUpperCase();
    const chassisNumber = this.requiredString(payload.chassisNumber, 'Thiếu chassisNumber.').toUpperCase();
    const engineNumber = this.requiredString(payload.engineNumber, 'Thiếu engineNumber.').toUpperCase();

    const existed = await tx.vehicle.findFirst({
      where: {
        plateNumber,
        chassisNumber,
        engineNumber
      }
    });

    if (existed) {
      return existed;
    }

    const vehicleKind = productType === ServiceContractProductType.AUTO_INSURANCE ? VehicleKind.AUTO : VehicleKind.MOTO;

    return tx.vehicle.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        ownerCustomerId,
        ownerFullName: this.requiredString(payload.ownerFullName, 'Thiếu ownerFullName.'),
        ownerAddress: this.cleanString(payload.ownerAddress) || null,
        plateNumber,
        chassisNumber,
        engineNumber,
        vehicleKind,
        vehicleType: this.requiredString(payload.vehicleType, 'Thiếu vehicleType.'),
        seatCount: this.toOptionalInt(payload.seatCount, 'seatCount'),
        loadKg: this.toOptionalInt(payload.loadKg, 'loadKg'),
        status: GenericStatus.ACTIVE
      }
    });
  }

  private async resolveCustomerForContract(
    tx: Prisma.TransactionClient,
    customerPayload: unknown,
    customerIdHint?: string
  ) {
    const hintedId = this.cleanString(customerIdHint);
    if (hintedId) {
      await this.ensureCustomerExists(hintedId, tx);
      return hintedId;
    }

    const customerData = this.ensureRecord(customerPayload);
    const rawPhone = this.cleanString(customerData.phone);
    const phoneNormalized = normalizeVietnamPhone(rawPhone);
    const emailNormalized = this.normalizeEmail(customerData.email);

    if (phoneNormalized) {
      const byPhone = await tx.customer.findFirst({
        where: {
          phoneNormalized
        }
      });
      if (byPhone) {
        return byPhone.id;
      }
    }

    if (emailNormalized) {
      const byEmail = await tx.customer.findFirst({
        where: {
          emailNormalized
        }
      });
      if (byEmail) {
        return byEmail.id;
      }
    }

    const fullName = this.cleanString(customerData.fullName) || this.cleanString(customerData.name);
    if (!fullName) {
      return null;
    }

    const created = await tx.customer.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        fullName,
        phone: rawPhone || null,
        phoneNormalized: phoneNormalized || null,
        email: this.cleanString(customerData.email) || null,
        emailNormalized: emailNormalized || null,
        source: this.cleanString(customerData.source) || 'EXTERNAL_SYNC',
        status: CustomerCareStatus.MOI_CHUA_TU_VAN
      }
    });

    return created.id;
  }

  private async resolveSalesOrderForContract(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    customerId: string | null
  ) {
    const salesOrder = this.ensureRecord(payload.salesOrder);
    const salesOrderId = this.cleanString(payload.salesOrderId) || this.cleanString(salesOrder.id);
    if (salesOrderId) {
      const existed = await tx.order.findFirst({ where: { id: salesOrderId } });
      if (existed) {
        return existed.id;
      }
    }

    const orderNo = this.cleanString(salesOrder.orderNo) || this.cleanString(payload.orderNo);
    if (!orderNo && !salesOrderId) {
      return null;
    }

    const existingByOrderNo = orderNo
      ? await tx.order.findFirst({ where: { orderNo } })
      : null;
    if (existingByOrderNo) {
      return existingByOrderNo.id;
    }

    const created = await tx.order.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        orderNo: orderNo || null,
        customerId: customerId || null,
        customerName: this.cleanString(salesOrder.customerName) || null,
        employeeId: this.cleanString(salesOrder.employeeId) || null,
        totalAmount: this.toOptionalDecimal(salesOrder.totalAmount, 'salesOrder.totalAmount'),
        status: GenericStatus.ACTIVE,
        createdBy: this.cleanString(salesOrder.createdBy) || 'system'
      }
    });

    const orderItems = Array.isArray(salesOrder.items) ? salesOrder.items : [];
    if (orderItems.length > 0) {
      await tx.orderItem.createMany({
        data: orderItems.map((item) => {
          const row = this.ensureRecord(item);
          return {
            tenant_Id: this.prisma.getTenantId(),
            orderId: created.id,
            productId: this.cleanString(row.productId) || null,
            productName: this.cleanString(row.productName) || null,
            quantity: this.toInt(row.quantity, 1, 1, 100000),
            unitPrice: this.toRequiredDecimal(row.unitPrice, 'salesOrder.items.unitPrice')
          };
        })
      });
    }

    return created.id;
  }

  private runOcrExtraction(provider: string, payload: Record<string, unknown>) {
    const normalizedProvider = provider.toLowerCase();
    if (normalizedProvider !== 'mock') {
      throw new BadRequestException(`Provider OCR '${provider}' chưa được hỗ trợ trong phase hiện tại.`);
    }

    if (this.toBool(payload.forceFail, false)) {
      return {
        extractionStatus: InboundPolicyExtractionStatus.FAILED,
        rawPayload: payload.rawPayload ?? null,
        normalizedPayload: null,
        confidence: null,
        errorMessage: 'Forced OCR failure by request payload.'
      };
    }

    const normalizedPayload = this.ensureRecord(payload.normalizedPayload ?? payload.rawPayload ?? {});
    const confidence = this.toNumber(payload.confidence, 0.6, 0, 1);

    return {
      extractionStatus: InboundPolicyExtractionStatus.EXTRACTED,
      rawPayload: this.ensureRecord(payload.rawPayload ?? normalizedPayload),
      normalizedPayload,
      confidence,
      errorMessage: null
    };
  }

  private buildContractProductSummary(contracts: Array<{ productType: ServiceContractProductType }>) {
    const initial: Record<ServiceContractProductType, number> = {
      TELECOM_PACKAGE: 0,
      AUTO_INSURANCE: 0,
      MOTO_INSURANCE: 0,
      DIGITAL_SERVICE: 0
    };

    for (const row of contracts) {
      initial[row.productType] += 1;
    }

    return initial;
  }

  private buildReminderTitle(productType: ServiceContractProductType) {
    switch (productType) {
      case ServiceContractProductType.TELECOM_PACKAGE:
        return 'Nhắc gia hạn gói cước viễn thông';
      case ServiceContractProductType.AUTO_INSURANCE:
        return 'Nhắc gia hạn bảo hiểm ô tô';
      case ServiceContractProductType.MOTO_INSURANCE:
        return 'Nhắc gia hạn bảo hiểm xe máy';
      case ServiceContractProductType.DIGITAL_SERVICE:
        return 'Nhắc gia hạn dịch vụ số';
      default:
        return 'Nhắc gia hạn dịch vụ';
    }
  }

  private buildReminderContent(contract: {
    id: string;
    endsAt: Date;
    customer?: { fullName?: string | null; } | null;
    telecomLine?: { servicePhone?: string | null; packageName?: string | null } | null;
    autoInsuranceDetail?: { soGCN?: string | null; vehicle?: { plateNumber?: string | null } | null } | null;
    motoInsuranceDetail?: { soGCN?: string | null; vehicle?: { plateNumber?: string | null } | null } | null;
    digitalServiceDetail?: { serviceName?: string | null } | null;
  }) {
    const customerName = this.cleanString(contract.customer?.fullName) || 'Khách hàng chưa rõ';
    const expiry = contract.endsAt.toISOString();

    if (contract.telecomLine) {
      return `${customerName} - ${contract.telecomLine.packageName ?? 'Gói cước'} (${contract.telecomLine.servicePhone ?? 'N/A'}) sắp hết hạn vào ${expiry}.`;
    }

    if (contract.autoInsuranceDetail) {
      return `${customerName} - BH ô tô ${contract.autoInsuranceDetail.soGCN ?? 'N/A'} (${contract.autoInsuranceDetail.vehicle?.plateNumber ?? 'N/A'}) sắp hết hạn vào ${expiry}.`;
    }

    if (contract.motoInsuranceDetail) {
      return `${customerName} - BH xe máy ${contract.motoInsuranceDetail.soGCN ?? 'N/A'} (${contract.motoInsuranceDetail.vehicle?.plateNumber ?? 'N/A'}) sắp hết hạn vào ${expiry}.`;
    }

    if (contract.digitalServiceDetail) {
      return `${customerName} - Dịch vụ ${contract.digitalServiceDetail.serviceName ?? 'N/A'} sắp hết hạn vào ${expiry}.`;
    }

    return `${customerName} có hợp đồng ${contract.id} sắp hết hạn vào ${expiry}.`;
  }

  private async resolveContractLeadDays(contract: {
    productType: ServiceContractProductType;
    renewalLeadDaysOverride?: number | null;
  }) {
    if (typeof contract.renewalLeadDaysOverride === 'number' && Number.isFinite(contract.renewalLeadDaysOverride)) {
      return Math.max(1, Math.trunc(contract.renewalLeadDaysOverride));
    }

    const policy = await this.getRenewalReminderPolicy();
    return policy.productLeadDays[contract.productType] ?? policy.globalLeadDays;
  }

  private async getRenewalReminderPolicy(): Promise<RenewalReminderPolicy> {
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime() as Record<string, unknown>;
    const renewalReminder = this.ensureRecord(salesPolicy.renewalReminder);
    const productLeadDays = this.ensureRecord(renewalReminder.productLeadDays);

    return {
      globalLeadDays: this.toInt(renewalReminder.globalLeadDays, 30, 1, 365),
      productLeadDays: {
        TELECOM_PACKAGE: this.toOptionalInt(productLeadDays.TELECOM_PACKAGE, 'renewalReminder.productLeadDays.TELECOM_PACKAGE') ?? undefined,
        AUTO_INSURANCE: this.toOptionalInt(productLeadDays.AUTO_INSURANCE, 'renewalReminder.productLeadDays.AUTO_INSURANCE') ?? undefined,
        MOTO_INSURANCE: this.toOptionalInt(productLeadDays.MOTO_INSURANCE, 'renewalReminder.productLeadDays.MOTO_INSURANCE') ?? undefined,
        DIGITAL_SERVICE: this.toOptionalInt(productLeadDays.DIGITAL_SERVICE, 'renewalReminder.productLeadDays.DIGITAL_SERVICE') ?? undefined
      }
    };
  }

  private resolveReminderTimezone() {
    const envTimezone = this.cleanString(this.config.get<string>('CRM_REMINDER_TIMEZONE'));
    if (envTimezone) {
      return envTimezone;
    }
    return 'Asia/Ho_Chi_Minh';
  }

  async resolveCustomerIdForExternalIdentity(
    channel: ConversationChannel,
    senderExternalId?: string,
    _fallbackPhone?: string
  ) {
    const externalId = this.cleanString(senderExternalId);
    const platform = this.mapConversationChannelToSocialPlatform(channel);

    if (platform && externalId) {
      const bySocial = await this.prisma.client.customerSocialIdentity.findFirst({
        where: {
          platform,
          externalUserId: externalId
        },
        select: {
          customerId: true
        }
      });
      if (bySocial?.customerId) {
        return bySocial.customerId;
      }
    }

    return null;
  }

  private mapConversationChannelToSocialPlatform(channel: ConversationChannel): CustomerSocialPlatform | null {
    if (channel === ConversationChannel.ZALO_OA || channel === ConversationChannel.ZALO_PERSONAL) {
      return CustomerSocialPlatform.ZALO;
    }
    if (channel === ConversationChannel.FACEBOOK) {
      return CustomerSocialPlatform.FACEBOOK;
    }
    return null;
  }

  private parseProductType(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(ServiceContractProductType) as string[]).includes(normalized)) {
      return normalized as ServiceContractProductType;
    }
    throw new BadRequestException('productType không hợp lệ.');
  }

  private optionalProductType(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if (!normalized || normalized === 'ALL') {
      return null;
    }
    if ((Object.values(ServiceContractProductType) as string[]).includes(normalized)) {
      return normalized as ServiceContractProductType;
    }
    throw new BadRequestException('productType không hợp lệ.');
  }

  private optionalContractStatus(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if (!normalized || normalized === 'ALL') {
      return null;
    }
    if ((Object.values(ServiceContractStatus) as string[]).includes(normalized)) {
      return normalized as ServiceContractStatus;
    }
    throw new BadRequestException('status hợp đồng không hợp lệ.');
  }

  private optionalReminderStatus(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if (!normalized || normalized === 'ALL') {
      return null;
    }
    if ((Object.values(ContractRenewalReminderStatus) as string[]).includes(normalized)) {
      return normalized as ContractRenewalReminderStatus;
    }
    throw new BadRequestException('status reminder không hợp lệ.');
  }

  private parseSocialPlatform(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(CustomerSocialPlatform) as string[]).includes(normalized)) {
      return normalized as CustomerSocialPlatform;
    }
    throw new BadRequestException('platform không hợp lệ (ZALO/FACEBOOK/TIKTOK).');
  }

  private parseVehicleKind(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(VehicleKind) as string[]).includes(normalized)) {
      return normalized as VehicleKind;
    }
    throw new BadRequestException('vehicleKind không hợp lệ (AUTO/MOTO).');
  }

  private optionalVehicleKind(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if (!normalized || normalized === 'ALL') {
      return null;
    }
    if ((Object.values(VehicleKind) as string[]).includes(normalized)) {
      return normalized as VehicleKind;
    }
    throw new BadRequestException('vehicleKind không hợp lệ.');
  }

  private parseDocumentSourceType(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(InboundPolicyDocumentSourceType) as string[]).includes(normalized)) {
      return normalized as InboundPolicyDocumentSourceType;
    }
    return InboundPolicyDocumentSourceType.MANUAL_UPLOAD;
  }

  private parseTelecomBeneficiaryType(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if ((Object.values(TelecomBeneficiaryType) as string[]).includes(normalized)) {
      return normalized as TelecomBeneficiaryType;
    }
    return TelecomBeneficiaryType.SELF;
  }

  private optionalGenericStatus(input: unknown) {
    const normalized = this.cleanString(input).toUpperCase();
    if (!normalized) {
      return null;
    }
    if ((Object.values(GenericStatus) as string[]).includes(normalized)) {
      return normalized as GenericStatus;
    }
    throw new BadRequestException('status không hợp lệ.');
  }

  private parseDate(input: unknown, fieldName: string) {
    const date = input instanceof Date ? input : new Date(String(input));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return date;
  }

  private toOptionalDate(input: unknown, fieldName: string) {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    return this.parseDate(input, fieldName);
  }

  private requiredString(input: unknown, message: string) {
    const normalized = this.cleanString(input);
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private cleanString(input: unknown) {
    if (input === null || input === undefined) {
      return '';
    }
    return String(input).trim();
  }

  private toBool(input: unknown, fallback: boolean) {
    if (typeof input === 'boolean') {
      return input;
    }
    const normalized = this.cleanString(input).toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private toNumber(input: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  private toInt(input: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private toOptionalInt(input: unknown, fieldName: string) {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    const parsed = Number(input);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(`${fieldName} phải là số nguyên không âm.`);
    }
    return parsed;
  }

  private toRequiredDecimal(input: unknown, fieldName: string) {
    const decimal = this.toOptionalDecimal(input, fieldName);
    if (!decimal) {
      throw new BadRequestException(`${fieldName} là bắt buộc.`);
    }
    return decimal;
  }

  private toOptionalDecimal(input: unknown, fieldName: string) {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    try {
      return new Prisma.Decimal(input as Prisma.Decimal.Value);
    } catch {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
  }

  private ensureRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input as Record<string, unknown>;
  }

  private hasOwn(input: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(input, key);
  }

  private toDbJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value as Prisma.InputJsonValue;
  }

  private normalizeEmail(input: unknown) {
    const normalized = this.cleanString(input).toLowerCase();
    return normalized || null;
  }

  private async ensureCustomerExists(customerId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma.client;
    const existing = await client.customer.findFirst({ where: { id: customerId }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy khách hàng: ${customerId}`);
    }
    return existing;
  }

  private async ensureVehicleExists(vehicleId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma.client;
    const existing = await client.vehicle.findFirst({ where: { id: vehicleId }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy xe: ${vehicleId}`);
    }
    return existing;
  }

  private async findCustomerOwnership(customerId: string) {
    const existing = await this.prisma.client.customer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        ownerStaffId: true
      }
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy khách hàng: ${customerId}`);
    }
    return existing;
  }

  private async resolveVehicleImportOwnerCustomerId(row: Record<string, unknown>) {
    const ownerCustomerId = this.cleanString(row.ownerCustomerId) || this.cleanString(row.customerId);
    if (ownerCustomerId) {
      return ownerCustomerId;
    }

    const ownerPhoneRaw = this.cleanString(row.ownerCustomerPhone)
      || this.cleanString(row.customerPhone)
      || this.cleanString(row.ownerPhone)
      || this.cleanString(row.phone);
    if (!ownerPhoneRaw) {
      throw new BadRequestException('Thiếu ownerCustomerId hoặc ownerCustomerPhone.');
    }

    const normalizedPhone = normalizeVietnamPhone(ownerPhoneRaw);
    if (!normalizedPhone) {
      throw new BadRequestException('ownerCustomerPhone không hợp lệ.');
    }

    const customer = await this.prisma.client.customer.findFirst({
      where: {
        phoneNormalized: normalizedPhone
      },
      select: {
        id: true
      }
    });

    if (!customer) {
      throw new NotFoundException(`Không tìm thấy khách hàng theo số điện thoại ${ownerPhoneRaw}.`);
    }

    return customer.id;
  }

  private resolveVehicleActor() {
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
      userId
    };
  }

  private async assertVehicleWriteAccess(ownerCustomerId: string | null, ownerStaffId: string | null) {
    const actor = this.resolveVehicleActor();
    if (actor.role === UserRole.ADMIN) {
      return;
    }

    if (!ownerCustomerId) {
      throw new ForbiddenException('Bạn chỉ được thao tác xe thuộc khách hàng mình phụ trách.');
    }

    if (!actor.userId) {
      throw new ForbiddenException('Không xác định được người dùng hiện tại để thao tác xe.');
    }

    if (!ownerStaffId || ownerStaffId !== actor.userId) {
      throw new ForbiddenException('Bạn chỉ được thao tác xe thuộc khách hàng mình phụ trách.');
    }
  }
}
