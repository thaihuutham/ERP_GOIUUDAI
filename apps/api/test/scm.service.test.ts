import { BadRequestException } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScmService } from '../src/modules/scm/scm.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      vendor: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      purchaseOrder: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      purchaseReceipt: {
        create: vi.fn(),
        aggregate: vi.fn(),
        findMany: vi.fn()
      },
      invoice: {
        findMany: vi.fn()
      },
      shipment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      distribution: {
        findFirst: vi.fn()
      },
      demandForecast: {
        findFirst: vi.fn()
      },
      supplyChainRisk: {
        findFirst: vi.fn()
      },
      order: {
        findFirst: vi.fn()
      }
    }
  };
}

describe('ScmService', () => {
  it('rejects submit transition when PO is not in DRAFT', async () => {
    const prisma = makePrismaMock();
    prisma.client.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po_1',
      lifecycleStatus: 'SUBMITTED',
      status: GenericStatus.PENDING,
      vendor: null,
      receipts: []
    });
    const service = new ScmService(prisma as any);

    await expect(
      service.submitPurchaseOrder('po_1', { note: 'submit again' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks PO as fully received when receipt sum reaches total amount', async () => {
    const prisma = makePrismaMock();
    prisma.client.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po_2',
      lifecycleStatus: 'APPROVED',
      status: GenericStatus.APPROVED,
      totalAmount: 100,
      vendor: null,
      receipts: []
    });
    prisma.client.purchaseReceipt.create.mockResolvedValue({ id: 'rc_1' });
    prisma.client.purchaseReceipt.aggregate.mockResolvedValue({
      _sum: { receivedAmount: 100 }
    });

    const service = new ScmService(prisma as any);
    const result = await service.receivePurchaseOrder('po_2', {
      receivedAmount: 100
    });

    expect(result.fullyReceived).toBe(true);
    expect(prisma.client.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'RECEIVED',
          status: GenericStatus.ACTIVE
        })
      })
    );
  });

  it('returns 3-way match summary with expected variance', async () => {
    const prisma = makePrismaMock();
    prisma.client.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po_3',
      poNo: 'PO-003',
      vendorId: 'ven_1',
      totalAmount: 100,
      lifecycleStatus: 'PARTIAL_RECEIVED',
      vendor: { name: 'Vendor A' },
      receipts: []
    });
    prisma.client.purchaseReceipt.findMany.mockResolvedValue([
      { receivedAmount: 80, invoiceNo: 'INV-1', receivedAt: new Date() }
    ]);
    prisma.client.invoice.findMany.mockResolvedValue([
      { totalAmount: 70 }
    ]);

    const service = new ScmService(prisma as any);
    const result = await service.getPurchaseOrderThreeWayMatch('po_3');

    expect(result.variance.poVsReceipt).toBe(20);
    expect(result.variance.receiptVsInvoice).toBe(10);
  });

  it('marks delivered shipment with on-time flag', async () => {
    const prisma = makePrismaMock();
    prisma.client.shipment.findFirst.mockResolvedValue({
      id: 'sh_1',
      lifecycleStatus: 'IN_TRANSIT',
      expectedDeliveryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      orderRef: 'REF-1',
      purchaseOrder: null
    });

    const service = new ScmService(prisma as any);
    await service.deliverShipment('sh_1', { note: 'delivered' });

    expect(prisma.client.shipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'DELIVERED',
          onTimeDelivery: true,
          status: GenericStatus.APPROVED
        })
      })
    );
  });
});
