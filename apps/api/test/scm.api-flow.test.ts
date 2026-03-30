import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ScmService } from '../src/modules/scm/scm.service';

describe('SCM API flow integration', () => {
  let app: INestApplication;
  let scmService: ScmService;

  const makeToken = (role: 'ADMIN' | 'MANAGER' | 'STAFF') =>
    sign(
      {
        sub: `test_${role.toLowerCase()}`,
        userId: `test_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        role,
        tenantId: 'tenant_demo_company'
      },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = 'phase2-integration-test-secret';
    process.env.PRISMA_SKIP_CONNECT = 'true';

    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false
    });

    app.setGlobalPrefix('api/v1');
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true
      })
    );

    await app.init();
    scmService = app.get(ScmService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes PO lifecycle flow: create -> submit -> approve -> receive -> close', async () => {
    const managerToken = makeToken('MANAGER');

    const state = {
      po: {
        id: 'po_api_1',
        poNo: 'PO-API-001',
        totalAmount: 100,
        receivedAmount: 0,
        lifecycleStatus: 'DRAFT',
        status: 'DRAFT'
      }
    };

    vi.spyOn(scmService, 'createPurchaseOrder').mockImplementation(async (body: any) => {
      state.po = {
        ...state.po,
        ...body,
        id: state.po.id,
        lifecycleStatus: 'DRAFT',
        status: 'DRAFT',
        receivedAmount: 0
      };
      return state.po as any;
    });

    vi.spyOn(scmService, 'submitPurchaseOrder').mockImplementation(async (_id: string) => {
      state.po.lifecycleStatus = 'SUBMITTED';
      state.po.status = 'PENDING';
      return state.po as any;
    });

    vi.spyOn(scmService, 'approvePurchaseOrder').mockImplementation(async (_id: string) => {
      state.po.lifecycleStatus = 'APPROVED';
      state.po.status = 'APPROVED';
      return state.po as any;
    });

    vi.spyOn(scmService, 'receivePurchaseOrder').mockImplementation(async (_id: string, body: any) => {
      state.po.receivedAmount = Number((state.po.receivedAmount ?? 0) + Number(body.receivedAmount ?? 0));
      state.po.lifecycleStatus = state.po.receivedAmount >= state.po.totalAmount ? 'RECEIVED' : 'PARTIAL_RECEIVED';
      state.po.status = 'ACTIVE';
      return {
        purchaseOrderId: state.po.id,
        totalReceivedAmount: state.po.receivedAmount,
        fullyReceived: state.po.lifecycleStatus === 'RECEIVED',
        purchaseOrder: state.po
      } as any;
    });

    vi.spyOn(scmService, 'closePurchaseOrder').mockImplementation(async (_id: string) => {
      state.po.lifecycleStatus = 'CLOSED';
      state.po.status = 'ARCHIVED';
      return state.po as any;
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/scm/purchase-orders')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        poNo: 'PO-API-001',
        totalAmount: 100
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.lifecycleStatus).toBe('DRAFT');

    const submitRes = await request(app.getHttpServer())
      .post('/api/v1/scm/purchase-orders/po_api_1/submit')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ note: 'submit for approval' });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.lifecycleStatus).toBe('SUBMITTED');

    const approveRes = await request(app.getHttpServer())
      .post('/api/v1/scm/purchase-orders/po_api_1/approve')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ note: 'approved' });

    expect(approveRes.status).toBe(201);
    expect(approveRes.body.lifecycleStatus).toBe('APPROVED');

    const receiveRes = await request(app.getHttpServer())
      .post('/api/v1/scm/purchase-orders/po_api_1/receive')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        receiptNo: 'RCV-001',
        receivedAmount: 100
      });

    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.fullyReceived).toBe(true);
    expect(receiveRes.body.purchaseOrder.lifecycleStatus).toBe('RECEIVED');

    const closeRes = await request(app.getHttpServer())
      .post('/api/v1/scm/purchase-orders/po_api_1/close')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ note: 'close po' });

    expect(closeRes.status).toBe(201);
    expect(closeRes.body.lifecycleStatus).toBe('CLOSED');
    expect(closeRes.body.status).toBe('ARCHIVED');
  });

  it('executes shipment lifecycle flow: create -> ship -> deliver', async () => {
    const managerToken = makeToken('MANAGER');

    const shipment = {
      id: 'ship_api_1',
      shipmentNo: 'SHIP-API-001',
      lifecycleStatus: 'PENDING',
      status: 'DRAFT',
      expectedDeliveryAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      onTimeDelivery: null as boolean | null
    };

    vi.spyOn(scmService, 'createShipment').mockImplementation(async (body: any) => {
      return {
        ...shipment,
        ...body,
        id: shipment.id,
        lifecycleStatus: 'PENDING',
        status: 'DRAFT'
      } as any;
    });

    vi.spyOn(scmService, 'shipShipment').mockImplementation(async (_id: string) => {
      return {
        ...shipment,
        lifecycleStatus: 'IN_TRANSIT',
        status: 'PENDING'
      } as any;
    });

    vi.spyOn(scmService, 'deliverShipment').mockImplementation(async (_id: string) => {
      return {
        ...shipment,
        lifecycleStatus: 'DELIVERED',
        status: 'APPROVED',
        onTimeDelivery: true
      } as any;
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/scm/shipments')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        shipmentNo: 'SHIP-API-001',
        orderRef: 'SO-1'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.lifecycleStatus).toBe('PENDING');

    const shipRes = await request(app.getHttpServer())
      .post('/api/v1/scm/shipments/ship_api_1/ship')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ note: 'departed' });

    expect(shipRes.status).toBe(201);
    expect(shipRes.body.lifecycleStatus).toBe('IN_TRANSIT');

    const deliverRes = await request(app.getHttpServer())
      .post('/api/v1/scm/shipments/ship_api_1/deliver')
      .set('authorization', `Bearer ${managerToken}`)
      .send({ note: 'delivered on time' });

    expect(deliverRes.status).toBe(201);
    expect(deliverRes.body.lifecycleStatus).toBe('DELIVERED');
    expect(deliverRes.body.onTimeDelivery).toBe(true);
  });
});
