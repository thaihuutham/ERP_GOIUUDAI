import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDemandForecastDto,
  CreateDistributionDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReceiptDto,
  CreateShipmentDto,
  CreateSupplyChainRiskDto,
  CreateVendorDto,
  PoTransitionDto,
  ScmListQueryDto,
  UpdateDemandForecastDto,
  UpdateDistributionDto,
  UpdatePurchaseOrderDto,
  UpdateShipmentDto,
  UpdateSupplyChainRiskDto,
  UpdateVendorDto,
  VendorScorecardQueryDto
} from './dto/scm.dto';

const PO_LIFECYCLE = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PARTIAL_RECEIVED: 'PARTIAL_RECEIVED',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED'
} as const;

const SHIPMENT_LIFECYCLE = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
} as const;

@Injectable()
export class ScmService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async listVendors(query: ScmListQueryDto) {
    return this.prisma.client.vendor.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { code: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createVendor(body: CreateVendorDto) {
    return this.prisma.client.vendor.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        code: body.code ?? null,
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        status: body.status ?? GenericStatus.ACTIVE
      }
    });
  }

  async updateVendor(id: string, body: UpdateVendorDto) {
    await this.ensureVendor(id);
    await this.prisma.client.vendor.updateMany({
      where: { id },
      data: {
        code: body.code,
        name: body.name,
        phone: body.phone,
        email: body.email,
        status: body.status
      }
    });
    return this.prisma.client.vendor.findFirst({ where: { id } });
  }

  async listPurchaseOrders(query: ScmListQueryDto) {
    return this.prisma.client.purchaseOrder.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
        ...(query.vendorId ? { vendorId: query.vendorId } : {}),
        ...(query.q
          ? {
              OR: [
                { poNo: { contains: query.q, mode: 'insensitive' } },
                { relatedSalesOrderNo: { contains: query.q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      include: { vendor: true, receipts: true },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createPurchaseOrder(body: CreatePurchaseOrderDto) {
    if (body.vendorId) {
      await this.ensureVendor(body.vendorId);
    }
    if (body.relatedSalesOrderNo) {
      await this.ensureSalesOrderByNo(body.relatedSalesOrderNo);
    }

    const expectedReceiveAt = body.expectedReceiveAt ? this.parseDate(body.expectedReceiveAt, 'expectedReceiveAt') : null;
    const policy = await this.runtimeSettings.getCatalogScmPolicyRuntime();
    const warehouseCode = this.normalizeWarehouseCode(body.warehouseCode) ?? policy.warehouseDefault;

    return this.prisma.client.purchaseOrder.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        poNo: body.poNo ?? null,
        vendorId: body.vendorId ?? null,
        relatedSalesOrderNo: body.relatedSalesOrderNo ?? null,
        warehouseCode,
        totalAmount: body.totalAmount,
        receivedAmount: 0,
        lifecycleStatus: body.lifecycleStatus ?? PO_LIFECYCLE.DRAFT,
        expectedReceiveAt,
        notes: body.notes ?? null,
        status: body.status ?? GenericStatus.DRAFT
      }
    });
  }

  async updatePurchaseOrder(id: string, body: UpdatePurchaseOrderDto) {
    const po = await this.ensurePurchaseOrder(id);
    if (po.lifecycleStatus === PO_LIFECYCLE.CLOSED || po.lifecycleStatus === PO_LIFECYCLE.CANCELLED) {
      throw new BadRequestException('PO đã đóng/hủy, không thể chỉnh sửa.');
    }

    if (body.vendorId) {
      await this.ensureVendor(body.vendorId);
    }
    if (body.relatedSalesOrderNo) {
      await this.ensureSalesOrderByNo(body.relatedSalesOrderNo);
    }
    const policy = await this.runtimeSettings.getCatalogScmPolicyRuntime();
    const warehouseCode = this.normalizeWarehouseCode(body.warehouseCode) ?? undefined;

    await this.prisma.client.purchaseOrder.updateMany({
      where: { id },
      data: {
        poNo: body.poNo,
        vendorId: body.vendorId,
        relatedSalesOrderNo: body.relatedSalesOrderNo,
        warehouseCode,
        totalAmount: body.totalAmount,
        expectedReceiveAt: body.expectedReceiveAt ? this.parseDate(body.expectedReceiveAt, 'expectedReceiveAt') : undefined,
        notes: body.notes,
        status: body.status
      }
    });

    return this.prisma.client.purchaseOrder.findFirst({ where: { id }, include: { vendor: true, receipts: true } });
  }

  async submitPurchaseOrder(id: string, payload: PoTransitionDto) {
    const po = await this.ensurePurchaseOrder(id);
    if (po.lifecycleStatus !== PO_LIFECYCLE.DRAFT) {
      throw new BadRequestException(`PO chỉ submit được từ DRAFT. Current=${po.lifecycleStatus}`);
    }
    await this.prisma.client.purchaseOrder.updateMany({
      where: { id },
      data: {
        lifecycleStatus: PO_LIFECYCLE.SUBMITTED,
        status: GenericStatus.PENDING,
        notes: this.mergeNote(po.notes, payload.note)
      }
    });
    return this.ensurePurchaseOrder(id);
  }

  async approvePurchaseOrder(id: string, payload: PoTransitionDto) {
    const po = await this.ensurePurchaseOrder(id);
    if (po.lifecycleStatus !== PO_LIFECYCLE.SUBMITTED) {
      throw new BadRequestException(`PO chỉ approve được từ SUBMITTED. Current=${po.lifecycleStatus}`);
    }
    await this.prisma.client.purchaseOrder.updateMany({
      where: { id },
      data: {
        lifecycleStatus: PO_LIFECYCLE.APPROVED,
        status: GenericStatus.APPROVED,
        approvedAt: new Date(),
        notes: this.mergeNote(po.notes, payload.note)
      }
    });
    return this.ensurePurchaseOrder(id);
  }

  async cancelPurchaseOrder(id: string, payload: PoTransitionDto) {
    const po = await this.ensurePurchaseOrder(id);
    if ([PO_LIFECYCLE.CLOSED, PO_LIFECYCLE.CANCELLED, PO_LIFECYCLE.RECEIVED].includes(po.lifecycleStatus as any)) {
      throw new BadRequestException(`Không thể hủy PO ở trạng thái ${po.lifecycleStatus}.`);
    }
    await this.prisma.client.purchaseOrder.updateMany({
      where: { id },
      data: {
        lifecycleStatus: PO_LIFECYCLE.CANCELLED,
        status: GenericStatus.REJECTED,
        closedAt: new Date(),
        notes: this.mergeNote(po.notes, payload.note)
      }
    });
    return this.ensurePurchaseOrder(id);
  }

  async closePurchaseOrder(id: string, payload: PoTransitionDto) {
    const po = await this.ensurePurchaseOrder(id);
    if (![PO_LIFECYCLE.RECEIVED, PO_LIFECYCLE.PARTIAL_RECEIVED].includes(po.lifecycleStatus as any)) {
      throw new BadRequestException(`Chỉ close được PO đã nhận hàng. Current=${po.lifecycleStatus}`);
    }
    await this.prisma.client.purchaseOrder.updateMany({
      where: { id },
      data: {
        lifecycleStatus: PO_LIFECYCLE.CLOSED,
        status: GenericStatus.ARCHIVED,
        closedAt: new Date(),
        notes: this.mergeNote(po.notes, payload.note)
      }
    });
    return this.ensurePurchaseOrder(id);
  }

  async listPurchaseReceipts(purchaseOrderId: string) {
    await this.ensurePurchaseOrder(purchaseOrderId);
    return this.prisma.client.purchaseReceipt.findMany({
      where: { purchaseOrderId },
      orderBy: { receivedAt: 'desc' }
    });
  }

  async receivePurchaseOrder(id: string, body: CreatePurchaseReceiptDto) {
    const po = await this.ensurePurchaseOrder(id);
    if (![PO_LIFECYCLE.APPROVED, PO_LIFECYCLE.PARTIAL_RECEIVED, PO_LIFECYCLE.SUBMITTED].includes(po.lifecycleStatus as any)) {
      throw new BadRequestException(`PO chưa sẵn sàng nhận hàng. Current=${po.lifecycleStatus}`);
    }

    const receivedAt = body.receivedAt ? this.parseDate(body.receivedAt, 'receivedAt') : new Date();
    const receipt = await this.prisma.client.purchaseReceipt.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        purchaseOrderId: po.id,
        receiptNo: body.receiptNo ?? null,
        invoiceNo: body.invoiceNo ?? null,
        receivedAmount: body.receivedAmount,
        receivedQty: body.receivedQty ?? null,
        acceptedQty: body.acceptedQty ?? null,
        rejectedQty: body.rejectedQty ?? null,
        note: body.note ?? null,
        receivedAt
      }
    });

    const sums = await this.prisma.client.purchaseReceipt.aggregate({
      where: { purchaseOrderId: po.id },
      _sum: { receivedAmount: true }
    });
    const totalReceived = Number(sums._sum.receivedAmount ?? 0);
    const poTotal = Number(po.totalAmount ?? 0);
    const policy = await this.runtimeSettings.getCatalogScmPolicyRuntime();
    const overReceiveLimit = poTotal * (1 + Number(policy.receiving.allowOverReceivePercent ?? 0) / 100);
    if (poTotal > 0 && totalReceived - overReceiveLimit > 0.005) {
      throw new BadRequestException(
        `Số lượng nhận vượt quá policy receiving.allowOverReceivePercent=${policy.receiving.allowOverReceivePercent}%.`
      );
    }
    const fullyReceived = poTotal > 0 && poTotal - totalReceived <= 0.005;

    await this.prisma.client.purchaseOrder.updateMany({
      where: { id: po.id },
      data: {
        receivedAmount: totalReceived,
        lifecycleStatus: fullyReceived ? PO_LIFECYCLE.RECEIVED : PO_LIFECYCLE.PARTIAL_RECEIVED,
        status: fullyReceived ? GenericStatus.ACTIVE : GenericStatus.PENDING
      }
    });

    return {
      receipt,
      purchaseOrderId: po.id,
      totalAmount: poTotal,
      receivedAmount: totalReceived,
      remainingAmount: Math.max(0, poTotal - totalReceived),
      fullyReceived
    };
  }

  async getPurchaseOrderThreeWayMatch(id: string) {
    const po = await this.ensurePurchaseOrder(id);
    const receipts = await this.prisma.client.purchaseReceipt.findMany({
      where: { purchaseOrderId: po.id },
      orderBy: { receivedAt: 'desc' }
    });

    const receiptSum = receipts.reduce((sum, row) => sum + Number(row.receivedAmount ?? 0), 0);
    const invoiceNoSet = new Set(receipts.map((r) => r.invoiceNo).filter(Boolean) as string[]);

    const relatedInvoices = await this.prisma.client.invoice.findMany({
      where: {
        OR: [
          ...(po.vendor?.name ? [{ partnerName: po.vendor.name }] : []),
          ...(invoiceNoSet.size > 0 ? [{ invoiceNo: { in: [...invoiceNoSet] } }] : [])
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const invoiceSum = relatedInvoices.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
    const poAmount = Number(po.totalAmount ?? 0);

    return {
      purchaseOrder: {
        id: po.id,
        poNo: po.poNo,
        vendorId: po.vendorId,
        vendorName: po.vendor?.name ?? null,
        lifecycleStatus: po.lifecycleStatus,
        amount: poAmount
      },
      receipt: {
        count: receipts.length,
        amount: receiptSum
      },
      invoice: {
        count: relatedInvoices.length,
        amount: invoiceSum
      },
      variance: {
        poVsReceipt: poAmount - receiptSum,
        receiptVsInvoice: receiptSum - invoiceSum
      }
    };
  }

  async listShipments(query: ScmListQueryDto) {
    return this.prisma.client.shipment.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
        ...(query.q
          ? {
              OR: [
                { shipmentNo: { contains: query.q, mode: 'insensitive' } },
                { orderRef: { contains: query.q, mode: 'insensitive' } },
                { carrier: { contains: query.q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      include: { purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createShipment(body: CreateShipmentDto) {
    const policy = await this.runtimeSettings.getCatalogScmPolicyRuntime();
    const linkedPo = body.purchaseOrderId ? await this.ensurePurchaseOrder(body.purchaseOrderId) : null;
    const warehouseCode =
      this.normalizeWarehouseCode(body.warehouseCode)
      ?? linkedPo?.warehouseCode
      ?? policy.warehouseDefault;
    return this.prisma.client.shipment.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        shipmentNo: body.shipmentNo ?? null,
        orderRef: body.orderRef ?? null,
        purchaseOrderId: body.purchaseOrderId ?? null,
        warehouseCode,
        carrier: body.carrier ?? null,
        lifecycleStatus: body.lifecycleStatus ?? SHIPMENT_LIFECYCLE.PENDING,
        expectedDeliveryAt: body.expectedDeliveryAt ? this.parseDate(body.expectedDeliveryAt, 'expectedDeliveryAt') : null,
        shippedAt: body.shippedAt ? this.parseDate(body.shippedAt, 'shippedAt') : null,
        deliveredAt: body.deliveredAt ? this.parseDate(body.deliveredAt, 'deliveredAt') : null,
        damageReported: body.damageReported ?? null,
        status: body.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateShipment(id: string, body: UpdateShipmentDto) {
    await this.ensureShipment(id);
    if (body.purchaseOrderId) {
      await this.ensurePurchaseOrder(body.purchaseOrderId);
    }
    const warehouseCode = this.normalizeWarehouseCode(body.warehouseCode) ?? undefined;
    await this.prisma.client.shipment.updateMany({
      where: { id },
      data: {
        shipmentNo: body.shipmentNo,
        orderRef: body.orderRef,
        purchaseOrderId: body.purchaseOrderId,
        warehouseCode,
        carrier: body.carrier,
        lifecycleStatus: body.lifecycleStatus,
        expectedDeliveryAt: body.expectedDeliveryAt ? this.parseDate(body.expectedDeliveryAt, 'expectedDeliveryAt') : undefined,
        shippedAt: body.shippedAt ? this.parseDate(body.shippedAt, 'shippedAt') : undefined,
        deliveredAt: body.deliveredAt ? this.parseDate(body.deliveredAt, 'deliveredAt') : undefined,
        damageReported: body.damageReported,
        status: body.status
      }
    });
    return this.prisma.client.shipment.findFirst({ where: { id }, include: { purchaseOrder: true } });
  }

  async shipShipment(id: string, payload: PoTransitionDto) {
    const shipment = await this.ensureShipment(id);
    if (![SHIPMENT_LIFECYCLE.PENDING].includes(shipment.lifecycleStatus as any)) {
      throw new BadRequestException(`Chỉ ship được shipment ở trạng thái PENDING. Current=${shipment.lifecycleStatus}`);
    }
    await this.prisma.client.shipment.updateMany({
      where: { id },
      data: {
        lifecycleStatus: SHIPMENT_LIFECYCLE.IN_TRANSIT,
        shippedAt: new Date(),
        status: GenericStatus.PENDING,
        orderRef: this.mergeNote(shipment.orderRef, payload.note)
      }
    });
    return this.ensureShipment(id);
  }

  async deliverShipment(id: string, payload: PoTransitionDto) {
    const shipment = await this.ensureShipment(id);
    if (![SHIPMENT_LIFECYCLE.IN_TRANSIT, SHIPMENT_LIFECYCLE.PENDING].includes(shipment.lifecycleStatus as any)) {
      throw new BadRequestException(`Không thể mark delivered ở trạng thái ${shipment.lifecycleStatus}`);
    }
    const deliveredAt = new Date();
    const onTimeDelivery =
      shipment.expectedDeliveryAt
        ? deliveredAt.getTime() <= shipment.expectedDeliveryAt.getTime()
        : null;

    await this.prisma.client.shipment.updateMany({
      where: { id },
      data: {
        lifecycleStatus: SHIPMENT_LIFECYCLE.DELIVERED,
        deliveredAt,
        onTimeDelivery,
        status: GenericStatus.APPROVED,
        orderRef: this.mergeNote(shipment.orderRef, payload.note)
      }
    });
    return this.ensureShipment(id);
  }

  async listDistributions(query: ScmListQueryDto) {
    return this.prisma.client.distribution.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { distributionNo: { contains: query.q, mode: 'insensitive' } },
                { destination: { contains: query.q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createDistribution(body: CreateDistributionDto) {
    return this.prisma.client.distribution.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        distributionNo: body.distributionNo ?? null,
        destination: body.destination ?? null,
        status: body.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateDistribution(id: string, body: UpdateDistributionDto) {
    await this.ensureDistribution(id);
    await this.prisma.client.distribution.updateMany({
      where: { id },
      data: {
        distributionNo: body.distributionNo,
        destination: body.destination,
        status: body.status
      }
    });
    return this.prisma.client.distribution.findFirst({ where: { id } });
  }

  async listDemandForecasts(query: ScmListQueryDto) {
    return this.prisma.client.demandForecast.findMany({
      where: query.q
        ? {
            OR: [
              { sku: { contains: query.q, mode: 'insensitive' } },
              { period: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createDemandForecast(body: CreateDemandForecastDto) {
    return this.prisma.client.demandForecast.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        sku: body.sku ?? null,
        period: body.period,
        predictedQty: body.predictedQty,
        confidence: body.confidence
      }
    });
  }

  async updateDemandForecast(id: string, body: UpdateDemandForecastDto) {
    await this.ensureDemandForecast(id);
    await this.prisma.client.demandForecast.updateMany({
      where: { id },
      data: {
        sku: body.sku,
        period: body.period,
        predictedQty: body.predictedQty,
        confidence: body.confidence
      }
    });
    return this.prisma.client.demandForecast.findFirst({ where: { id } });
  }

  async listSupplyChainRisks(query: ScmListQueryDto) {
    return this.prisma.client.supplyChainRisk.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { severity: { contains: query.q, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createSupplyChainRisk(body: CreateSupplyChainRiskDto) {
    return this.prisma.client.supplyChainRisk.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        title: body.title,
        severity: body.severity,
        mitigation: body.mitigation ?? null,
        status: body.status ?? GenericStatus.PENDING
      }
    });
  }

  async updateSupplyChainRisk(id: string, body: UpdateSupplyChainRiskDto) {
    await this.ensureSupplyChainRisk(id);
    await this.prisma.client.supplyChainRisk.updateMany({
      where: { id },
      data: {
        title: body.title,
        severity: body.severity,
        mitigation: body.mitigation,
        status: body.status
      }
    });
    return this.prisma.client.supplyChainRisk.findFirst({ where: { id } });
  }

  async getVendorScorecards(query: VendorScorecardQueryDto) {
    const from = query.from ? this.parseDate(query.from, 'from') : new Date('1970-01-01T00:00:00.000Z');
    const to = query.to ? this.parseDate(query.to, 'to') : new Date();
    const dateFilter = { gte: from, lte: to };

    const vendors = await this.prisma.client.vendor.findMany({ orderBy: { name: 'asc' } });
    const purchaseOrders = await this.prisma.client.purchaseOrder.findMany({
      where: { createdAt: dateFilter },
      include: { receipts: true }
    });
    const shipments = await this.prisma.client.shipment.findMany({
      where: { deliveredAt: dateFilter }
    });

    const scorecards = vendors.map((vendor) => {
      const vendorPos = purchaseOrders.filter((po) => po.vendorId === vendor.id);
      const poIds = new Set(vendorPos.map((po) => po.id));
      const vendorShipments = shipments.filter((s) => s.purchaseOrderId && poIds.has(s.purchaseOrderId));

      const leadTimes = vendorPos
        .flatMap((po) => po.receipts.map((r) => ({ po, receipt: r })))
        .map(({ po, receipt }) => {
          const start = po.approvedAt ?? po.createdAt;
          const end = receipt.receivedAt;
          return (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
        })
        .filter((days) => Number.isFinite(days) && days >= 0);

      const qtyTotals = vendorPos.flatMap((po) => po.receipts).reduce(
        (acc, receipt) => {
          acc.accepted += receipt.acceptedQty ?? 0;
          acc.rejected += receipt.rejectedQty ?? 0;
          return acc;
        },
        { accepted: 0, rejected: 0 }
      );

      const deliveredShipments = vendorShipments.filter((s) => !!s.deliveredAt);
      const onTimeCount = deliveredShipments.filter((s) => s.onTimeDelivery === true).length;

      const avgLeadTimeDays =
        leadTimes.length > 0
          ? leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length
          : 0;
      const defectBase = qtyTotals.accepted + qtyTotals.rejected;
      const defectRate = defectBase > 0 ? qtyTotals.rejected / defectBase : 0;
      const onTimeDeliveryRate = deliveredShipments.length > 0 ? onTimeCount / deliveredShipments.length : 0;

      return {
        vendorId: vendor.id,
        vendorName: vendor.name,
        totalPurchaseOrders: vendorPos.length,
        approvedPurchaseOrders: vendorPos.filter((po) => po.lifecycleStatus === PO_LIFECYCLE.APPROVED).length,
        receivedPurchaseOrders: vendorPos.filter((po) => po.lifecycleStatus === PO_LIFECYCLE.RECEIVED).length,
        closedPurchaseOrders: vendorPos.filter((po) => po.lifecycleStatus === PO_LIFECYCLE.CLOSED).length,
        avgLeadTimeDays: Number(avgLeadTimeDays.toFixed(2)),
        defectRate: Number(defectRate.toFixed(4)),
        onTimeDeliveryRate: Number(onTimeDeliveryRate.toFixed(4))
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      scorecards
    };
  }

  private async ensureVendor(id: string) {
    const vendor = await this.prisma.client.vendor.findFirst({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Không tìm thấy vendor.');
    }
    return vendor;
  }

  private async ensurePurchaseOrder(id: string) {
    const po = await this.prisma.client.purchaseOrder.findFirst({
      where: { id },
      include: { vendor: true, receipts: true }
    });
    if (!po) {
      throw new NotFoundException('Không tìm thấy purchase order.');
    }
    return po;
  }

  private async ensureShipment(id: string) {
    const shipment = await this.prisma.client.shipment.findFirst({
      where: { id },
      include: { purchaseOrder: true }
    });
    if (!shipment) {
      throw new NotFoundException('Không tìm thấy shipment.');
    }
    return shipment;
  }

  private async ensureDistribution(id: string) {
    const distribution = await this.prisma.client.distribution.findFirst({ where: { id } });
    if (!distribution) {
      throw new NotFoundException('Không tìm thấy distribution.');
    }
    return distribution;
  }

  private async ensureDemandForecast(id: string) {
    const row = await this.prisma.client.demandForecast.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy demand forecast.');
    }
    return row;
  }

  private async ensureSupplyChainRisk(id: string) {
    const row = await this.prisma.client.supplyChainRisk.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy supply chain risk.');
    }
    return row;
  }

  private async ensureSalesOrderByNo(orderNo: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { orderNo }
    });
    if (!order) {
      throw new BadRequestException(`Không tìm thấy sales order với orderNo=${orderNo}`);
    }
    return order;
  }

  private mergeNote(oldValue: string | null, appended?: string) {
    const cleanAppend = appended?.trim();
    if (!cleanAppend) {
      return oldValue;
    }
    return oldValue?.trim()
      ? `${oldValue}\n${new Date().toISOString()} - ${cleanAppend}`
      : `${new Date().toISOString()} - ${cleanAppend}`;
  }

  private parseDate(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return parsed;
  }

  private normalizeWarehouseCode(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized || undefined;
  }

  private take(limit?: number, max = 200) {
    return Math.min(Math.max(limit ?? 100, 1), max);
  }
}
