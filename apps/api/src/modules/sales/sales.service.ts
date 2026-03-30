import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(query: PaginationQueryDto, status?: GenericStatus | 'ALL') {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const keyword = query.q?.trim();

    const where: Prisma.OrderWhereInput = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (keyword) {
      where.OR = [
        { customerName: { contains: keyword, mode: 'insensitive' } },
        { orderNo: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const orders = await this.prisma.client.order.findMany({
      where,
      include: { items: true },
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

  async createOrder(payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();
    const items = this.normalizeOrderItems(payload);

    if (items.length === 0) {
      throw new BadRequestException('Danh sách sản phẩm không hợp lệ.');
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const customerId = payload.customerId ? String(payload.customerId) : null;

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

    return this.prisma.client.order.findFirst({
      where: { id: order.id },
      include: { items: true }
    });
  }

  async updateOrder(orderId: string, payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId },
      include: { items: true }
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

    const settings = await this.getOrderSettings();
    const needsApproval = this.shouldRequireApproval({
      oldTotalAmount,
      newTotalAmount,
      settings
    });

    if (needsApproval) {
      if (!settings.approverId) {
        throw new BadRequestException('Chưa cấu hình người phê duyệt đơn hàng.');
      }

      await this.prisma.client.approval.create({
        data: {
          tenant_Id: tenantId,
          targetType: 'ORDER_EDIT',
          targetId: order.id,
          requesterId,
          approverId: settings.approverId,
          status: GenericStatus.PENDING,
          contextJson: {
            requesterName,
            originalAmount: oldTotalAmount,
            totalAmount: newTotalAmount,
            items: mappedItems
          }
        }
      });

      await this.prisma.client.order.updateMany({
        where: { id: order.id },
        data: { status: GenericStatus.PENDING }
      });

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
          status: GenericStatus.PENDING
        }
      });
    });

    return this.prisma.client.order.findFirst({
      where: { id: order.id },
      include: { items: true }
    });
  }

  async listApprovals() {
    return this.prisma.client.approval.findMany({
      where: { targetType: 'ORDER_EDIT' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async approve(approvalId: string) {
    return this.handleApprovalDecision(approvalId, GenericStatus.APPROVED);
  }

  async reject(approvalId: string) {
    return this.handleApprovalDecision(approvalId, GenericStatus.REJECTED);
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
            totalAmount: Number(ctx.totalAmount ?? 0),
            status: GenericStatus.PENDING
          }
        });
      } else {
        await tx.order.updateMany({
          where: { id: approval.targetId },
          data: { status: GenericStatus.PENDING }
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

  private async getOrderSettings(): Promise<OrderSettings> {
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

  private normalizeOrderItems(payload: Record<string, unknown>, fallbackItems: OrderItemInput[] = []) {
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
}
