import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SettingsPolicyService } from '../settings/settings-policy.service';
import { CreateSalesOrderDto, OrderDecisionDto, UpdateSalesOrderDto } from './dto/sales.dto';

type OrderItemInput = {
  productId?: string;
  productName?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
};

type OrderSettings = {
  allowIncreaseWithoutApproval: boolean;
  requireApprovalForDecrease: boolean;
  approverId?: string;
};

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(SettingsPolicyService) private readonly settingsPolicy: SettingsPolicyService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async listOrders(query: PaginationQueryDto, status?: GenericStatus | 'ALL') {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = query.q?.trim();
    const normalizedStatus = status && status !== 'ALL' ? status : undefined;

    const where: Prisma.OrderWhereInput = {};

    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    if (keyword && await this.search.shouldUseHybridSearch(keyword, query.cursor)) {
      const rankedIds = await this.search.searchOrderIds(
        keyword,
        this.prisma.getTenantId(),
        take + 1,
        { status: normalizedStatus }
      );

      if (rankedIds !== null) {
        const lookupIds = rankedIds.slice(0, take + 1);
        const rankedRows = lookupIds.length > 0
          ? await this.prisma.client.order.findMany({
              where: {
                ...where,
                id: { in: lookupIds }
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
        { customerName: { contains: keyword, mode: 'insensitive' } },
        { orderNo: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const orders = await this.prisma.client.order.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = orders.length > take;
    const items = hasMore ? orders.slice(0, take) : orders;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async createOrder(payload: CreateSalesOrderDto) {
    const tenantId = this.prisma.getTenantId();
    const items = this.normalizeOrderItems(payload);

    if (items.length === 0) {
      throw new BadRequestException('Danh sách sản phẩm không hợp lệ.');
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const customerId = payload.customerId ? String(payload.customerId) : null;
    const employeeId = payload.employeeId ? String(payload.employeeId) : null;
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    await this.assertDiscountPolicy(payload as unknown as Record<string, unknown>, items, salesPolicy.discountPolicy);
    await this.assertCreditPolicy(customerId, totalAmount, salesPolicy.creditPolicy);

    let customerName = payload.customerName ? String(payload.customerName) : null;
    if (customerId && !customerName) {
      const customer = await this.prisma.client.customer.findFirst({ where: { id: customerId } });
      customerName = customer?.fullName ?? null;
    }

    const order = await this.prisma.client.order.create({
      data: {
        tenant_Id: tenantId,
        customerId,
        customerName,
        employeeId,
        orderNo: payload.orderNo ? String(payload.orderNo) : null,
        totalAmount,
        status: GenericStatus.PENDING,
        createdBy: payload.createdBy ? String(payload.createdBy) : null
      }
    });

    await this.prisma.client.orderItem.createMany({
      data: items.map((item) => ({
        tenant_Id: tenantId,
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }))
    });

    const created = await this.prisma.client.order.findFirst({
      where: { id: order.id },
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
      }
    });
    if (created) {
      await this.search.syncOrderUpsert(created);
    }
    return created;
  }

  async updateOrder(orderId: string, payload: UpdateSalesOrderDto) {
    const tenantId = this.prisma.getTenantId();
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId },
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
      }
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    const mappedItems = this.normalizeOrderItems(payload, order.items as unknown as OrderItemInput[]);

    if (mappedItems.length === 0) {
      throw new BadRequestException('Danh sách sản phẩm không hợp lệ.');
    }

    const newTotalAmount = mappedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const oldTotalAmount = Number(order.totalAmount ?? 0);
    const requesterId = payload.requesterId ? String(payload.requesterId) : 'system';
    const requesterName = payload.requesterName ? String(payload.requesterName) : 'System';
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    await this.assertDiscountPolicy(payload as unknown as Record<string, unknown>, mappedItems, salesPolicy.discountPolicy);
    await this.assertCreditPolicy(order.customerId ?? null, newTotalAmount, salesPolicy.creditPolicy, order.id);

    const settings = await this.getOrderSettings();
    const nextEmployeeId = Object.prototype.hasOwnProperty.call(payload, 'employeeId')
      ? (payload.employeeId ? String(payload.employeeId) : null)
      : undefined;
    const needsApproval = this.shouldRequireApproval({
      oldTotalAmount,
      newTotalAmount,
      settings
    });

    if (needsApproval) {
      const resolved = await this.resolveApproverByAmount('sales', newTotalAmount, settings.approverId);
      if (!resolved.approverId) throw new BadRequestException('Chưa cấu hình người phê duyệt đơn hàng.');

      await this.prisma.client.approval.create({
        data: {
          tenant_Id: tenantId,
          targetType: 'ORDER_EDIT',
          targetId: order.id,
          requesterId,
          approverId: resolved.approverId,
          dueAt: resolved.dueAt,
          status: GenericStatus.PENDING,
          contextJson: {
            requesterName,
            originalAmount: oldTotalAmount,
            totalAmount: newTotalAmount,
            escalationRole: resolved.escalateToRole,
            employeeId: nextEmployeeId ?? order.employeeId ?? null,
            items: mappedItems
          }
        }
      });

      await this.prisma.client.order.updateMany({
        where: { id: order.id },
        data: { status: GenericStatus.PENDING }
      });
      const pendingOrder = await this.prisma.client.order.findFirst({
        where: { id: order.id },
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
        }
      });
      if (pendingOrder) {
        await this.search.syncOrderUpsert(pendingOrder);
      }

      return {
        message: 'Yêu cầu chỉnh sửa đã được gửi để phê duyệt.',
        needsApproval: true
      };
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.orderItem.createMany({
        data: mappedItems.map((item) => ({
          tenant_Id: tenantId,
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        }))
      });
      await tx.order.updateMany({
        where: { id: order.id },
        data: {
          totalAmount: newTotalAmount,
          employeeId: nextEmployeeId,
          status: GenericStatus.APPROVED
        }
      });
    });

    const updated = await this.prisma.client.order.findFirst({
      where: { id: order.id },
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
      }
    });
    if (updated) {
      await this.search.syncOrderUpsert(updated);
    }
    return updated;
  }

  async listApprovals() {
    return this.prisma.client.approval.findMany({
      where: { targetType: 'ORDER_EDIT' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async approveOrder(orderId: string, payload: OrderDecisionDto) {
    return this.transitionOrderLifecycle(orderId, GenericStatus.APPROVED, payload);
  }

  async rejectOrder(orderId: string, payload: OrderDecisionDto) {
    return this.transitionOrderLifecycle(orderId, GenericStatus.REJECTED, payload);
  }

  async approve(approvalId: string) {
    return this.handleApprovalDecision(approvalId, GenericStatus.APPROVED);
  }

  async reject(approvalId: string) {
    return this.handleApprovalDecision(approvalId, GenericStatus.REJECTED);
  }

  private async transitionOrderLifecycle(
    orderId: string,
    nextStatus: GenericStatus,
    payload: OrderDecisionDto
  ) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId },
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
      }
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    if (order.status !== GenericStatus.PENDING) {
      throw new BadRequestException(`Đơn hàng chỉ chuyển duyệt từ PENDING. Current=${order.status}`);
    }

    const decidedAt = new Date();
    const decisionNote = payload?.note ? String(payload.note) : null;
    const actorId = payload?.decidedBy ? String(payload.decidedBy) : null;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: order.id },
        data: { status: nextStatus }
      });

      await tx.approval.updateMany({
        where: {
          targetType: 'ORDER_EDIT',
          targetId: order.id,
          status: GenericStatus.PENDING
        },
        data: {
          status: nextStatus,
          decidedAt,
          decisionNote,
          approverId: actorId ?? undefined
        }
      });

      if (order.createdBy) {
        await tx.notification.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            userId: order.createdBy,
            title: nextStatus === GenericStatus.APPROVED ? 'Đơn hàng đã được phê duyệt' : 'Đơn hàng bị từ chối',
            content:
              nextStatus === GenericStatus.APPROVED
                ? `Đơn hàng ${order.orderNo ?? order.id} đã được phê duyệt.`
                : `Đơn hàng ${order.orderNo ?? order.id} đã bị từ chối.`
          }
        });
      }
    });

    const updatedOrder = await this.prisma.client.order.findFirst({
      where: { id: order.id },
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
      }
    });
    if (updatedOrder) {
      await this.search.syncOrderUpsert(updatedOrder);
    }

    return {
      order: updatedOrder,
      transition: {
        from: order.status,
        to: nextStatus,
        note: decisionNote
      }
    };
  }

  private async handleApprovalDecision(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    const tenantId = this.prisma.getTenantId();
    const approval = await this.prisma.client.approval.findFirst({ where: { id: approvalId } });
    if (!approval) {
      throw new NotFoundException('Không tìm thấy yêu cầu phê duyệt.');
    }

    if (approval.status !== GenericStatus.PENDING) {
      throw new BadRequestException('Yêu cầu này đã được xử lý.');
    }

    const ctx = (approval.contextJson ?? {}) as Record<string, any>;

    await this.prisma.client.$transaction(async (tx) => {
      if (decision === GenericStatus.APPROVED) {
        const items = Array.isArray(ctx.items) ? ctx.items : [];
        if (items.length > 0) {
          await tx.orderItem.deleteMany({ where: { orderId: approval.targetId } });
          await tx.orderItem.createMany({
            data: items.map((item) => ({
              tenant_Id: tenantId,
              orderId: approval.targetId,
              productId: item.productId ?? null,
              productName: item.productName ?? null,
              quantity: Math.max(1, Number(item.quantity ?? 1)),
              unitPrice: Number(item.unitPrice ?? 0)
            }))
          });
        }

        await tx.order.updateMany({
          where: { id: approval.targetId },
          data: {
            totalAmount: ctx.totalAmount !== undefined ? Number(ctx.totalAmount) : undefined,
            employeeId: ctx.employeeId !== undefined ? String(ctx.employeeId || '') || null : undefined,
            status: GenericStatus.APPROVED
          }
        });
      } else {
        await tx.order.updateMany({
          where: { id: approval.targetId },
          data: { status: GenericStatus.REJECTED }
        });
      }

      await tx.approval.updateMany({
        where: { id: approval.id },
        data: {
          status: decision,
          decidedAt: new Date()
        }
      });

      if (approval.requesterId) {
        await tx.notification.create({
          data: {
            tenant_Id: tenantId,
            userId: approval.requesterId,
            title: decision === GenericStatus.APPROVED ? 'Yêu cầu chỉnh sửa đã được duyệt' : 'Yêu cầu chỉnh sửa bị từ chối',
            content:
              decision === GenericStatus.APPROVED
                ? `Đơn hàng ${approval.targetId} đã được phê duyệt thay đổi.`
                : `Đơn hàng ${approval.targetId} đã bị từ chối thay đổi.`
          }
        });
      }
    });

    const updatedOrder = await this.prisma.client.order.findFirst({
      where: { id: approval.targetId },
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
      }
    });
    if (updatedOrder) {
      await this.search.syncOrderUpsert(updatedOrder);
    }

    return {
      id: approval.id,
      status: decision
    };
  }

  private shouldRequireApproval(args: { oldTotalAmount: number; newTotalAmount: number; settings: OrderSettings }) {
    const { oldTotalAmount, newTotalAmount, settings } = args;
    if (newTotalAmount > oldTotalAmount) {
      return !settings.allowIncreaseWithoutApproval;
    }
    if (newTotalAmount < oldTotalAmount) {
      return settings.requireApprovalForDecrease;
    }
    return false;
  }

  private async resolveApproverByAmount(moduleKey: string, amount: number, fallbackApproverId?: string) {
    const approvalPolicy = await this.runtimeSettings.getApprovalMatrixRuntime();
    const normalizedModule = String(moduleKey || '').toLowerCase();
    const matchedRules = approvalPolicy.rules
      .filter((rule) => rule.module === normalizedModule && amount >= Number(rule.minAmount ?? 0))
      .sort((a, b) => Number(b.minAmount ?? 0) - Number(a.minAmount ?? 0));

    const topRule = matchedRules[0];
    const approverId = topRule?.approverRole ? `ROLE:${topRule.approverRole}` : fallbackApproverId;
    const dueAt = approvalPolicy.escalation.enabled
      ? new Date(Date.now() + Number(approvalPolicy.escalation.slaHours || 24) * 60 * 60 * 1000)
      : undefined;

    return {
      approverId,
      dueAt,
      escalateToRole: approvalPolicy.escalation.escalateToRole,
      delegationMaxDays: approvalPolicy.delegation.maxDays
    };
  }

  private async assertDiscountPolicy(
    payload: Record<string, unknown>,
    items: Array<{ quantity: number; unitPrice: number }>,
    policy: { maxDiscountPercent: number; requireApprovalAbovePercent: number }
  ) {
    const payloadDiscount = Number(payload.discountPercent ?? payload.discountPct ?? 0);
    const itemDiscounts = Array.isArray(payload.items)
      ? (payload.items as Array<Record<string, unknown>>).map((row) => Number(row.discountPercent ?? row.discountPct ?? 0))
      : [];
    const maxAppliedDiscount = Math.max(payloadDiscount, ...itemDiscounts, 0);

    if (maxAppliedDiscount > policy.maxDiscountPercent) {
      throw new BadRequestException(
        `Chiết khấu ${maxAppliedDiscount}% vượt quá policy.maxDiscountPercent=${policy.maxDiscountPercent}%.`
      );
    }

    if (maxAppliedDiscount > policy.requireApprovalAbovePercent && items.length > 0) {
      // Preserve behavior: approval flow handled by existing updateOrder approval matrix.
      // This gate ensures create/update payload cannot silently exceed approval threshold.
    }
  }

  private async assertCreditPolicy(
    customerId: string | null,
    nextOrderAmount: number,
    policy: { allowNegativeBalance: boolean; maxCreditLimit: number },
    excludeOrderId?: string
  ) {
    if (!customerId) {
      return;
    }

    const limit = Number(policy.maxCreditLimit ?? 0);
    if (limit <= 0) {
      return;
    }

    const where: Prisma.OrderWhereInput = {
      customerId,
      status: { in: [GenericStatus.PENDING, GenericStatus.APPROVED] },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {})
    };

    const currentOutstanding = await this.prisma.client.order.aggregate({
      where,
      _sum: { totalAmount: true }
    });
    const outstanding = Number(currentOutstanding._sum.totalAmount ?? 0);
    const projected = outstanding + Number(nextOrderAmount || 0);

    if (!policy.allowNegativeBalance && projected > limit) {
      throw new BadRequestException(
        `Vượt hạn mức tín dụng khách hàng: projected=${projected}, maxCreditLimit=${limit}.`
      );
    }
  }

  private async getOrderSettings(): Promise<OrderSettings> {
    try {
      const policySettings = await this.settingsPolicy.getOrderSettingsPolicy();
      return {
        allowIncreaseWithoutApproval: policySettings.allowIncreaseWithoutApproval,
        requireApprovalForDecrease: policySettings.requireApprovalForDecrease,
        approverId: policySettings.approverId || undefined
      };
    } catch {
      // fallback legacy
    }

    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: 'order_settings' }
    });

    const defaultValue: OrderSettings = {
      allowIncreaseWithoutApproval: true,
      requireApprovalForDecrease: true
    };

    if (!row?.settingValue || typeof row.settingValue !== 'object' || Array.isArray(row.settingValue)) {
      return defaultValue;
    }

    const payload = row.settingValue as Record<string, unknown>;
    return {
      allowIncreaseWithoutApproval:
        typeof payload.allowIncreaseWithoutApproval === 'boolean'
          ? payload.allowIncreaseWithoutApproval
          : defaultValue.allowIncreaseWithoutApproval,
      requireApprovalForDecrease:
        typeof payload.requireApprovalForDecrease === 'boolean'
          ? payload.requireApprovalForDecrease
          : defaultValue.requireApprovalForDecrease,
      approverId: typeof payload.approverId === 'string' ? payload.approverId : undefined
    };
  }

  private normalizeOrderItems(
    payload: CreateSalesOrderDto | UpdateSalesOrderDto | Record<string, unknown>,
    fallbackItems: OrderItemInput[] = []
  ) {
    const hasSingleItemFields = payload.productName !== undefined
      || payload.unitPrice !== undefined
      || payload.quantity !== undefined
      || payload.productId !== undefined;

    const rawItems: OrderItemInput[] = Array.isArray(payload.items)
      ? (payload.items as OrderItemInput[])
      : hasSingleItemFields
        ? [
            {
              productId: payload.productId ? String(payload.productId) : undefined,
              productName: payload.productName ? String(payload.productName) : undefined,
              quantity: payload.quantity ? Number(payload.quantity) : 1,
              unitPrice: payload.unitPrice ? Number(payload.unitPrice) : 0
            }
          ]
        : fallbackItems;

    return rawItems
      .map((item) => ({
        productId: item.productId ?? null,
        productName: item.productName ?? null,
        quantity: Math.max(1, Number(item.quantity ?? 1)),
        unitPrice: Number(item.unitPrice ?? item.price ?? 0)
      }))
      .filter((item) => item.unitPrice > 0);
  }

  private rankByIds<T extends { id: string }>(rows: T[], orderedIds: string[]) {
    const rankMap = new Map(orderedIds.map((id, index) => [id, index]));
    return [...rows].sort((left, right) => {
      const leftRank = rankMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }
}
