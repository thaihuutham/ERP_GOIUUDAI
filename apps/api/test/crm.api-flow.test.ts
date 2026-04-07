import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { CrmService } from '../src/modules/crm/crm.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('CRM API flow integration', () => {
  let app: INestApplication;
  let crmService: CrmService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-crm-flow-secret');

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
    crmService = app.get(CrmService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes CRM flow: customer -> interaction -> payment request -> mark paid', async () => {
    const managerToken = makeAuthToken('MANAGER');

    const state = {
      customer: {
        id: 'cus_api_1',
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'a@example.com',
        customerStage: 'MOI',
        status: 'MOI_CHUA_TU_VAN',
        tags: ['moi']
      },
      paymentRequest: {
        id: 'pay_api_1',
        customerId: 'cus_api_1',
        invoiceNo: 'INV-API-001',
        amount: 1500000,
        status: 'DA_GUI'
      }
    };

    vi.spyOn(crmService, 'createCustomer').mockImplementation(async (body: any) => {
      state.customer = {
        ...state.customer,
        ...body,
        id: state.customer.id
      };
      return {
        deduplicated: false,
        message: 'Đã tạo khách hàng mới.',
        customer: state.customer
      } as any;
    });

    vi.spyOn(crmService, 'createInteraction').mockImplementation(async (body: any) => ({
      id: 'interaction_api_1',
      customerId: body.customerId ?? state.customer.id,
      interactionType: body.interactionType ?? 'TU_VAN',
      channel: body.channel ?? 'ZALO',
      content: body.content,
      resultTag: body.resultTag ?? null
    }) as any);

    vi.spyOn(crmService, 'createPaymentRequest').mockImplementation(async (body: any) => {
      state.paymentRequest = {
        ...state.paymentRequest,
        ...body,
        id: state.paymentRequest.id,
        status: body.status ?? 'DA_GUI'
      };
      return state.paymentRequest as any;
    });

    vi.spyOn(crmService, 'markPaymentRequestPaid').mockImplementation(async (_id: string) => ({
      ...state.paymentRequest,
      status: 'DA_THANH_TOAN',
      paidAt: new Date().toISOString()
    }) as any);

    const createCustomerRes = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        fullName: 'Nguyen Van A',
        phone: '0912345678',
        email: 'a@example.com',
        customerStage: 'MOI',
        tags: ['moi']
      });

    expect(createCustomerRes.status).toBe(201);
    expect(createCustomerRes.body.customer.id).toBe('cus_api_1');

    const createInteractionRes = await request(app.getHttpServer())
      .post('/api/v1/crm/interactions')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        customerId: 'cus_api_1',
        interactionType: 'TU_VAN',
        channel: 'ZALO',
        content: 'Khách quan tâm sản phẩm mới',
        resultTag: 'quan_tam'
      });

    expect(createInteractionRes.status).toBe(201);
    expect(createInteractionRes.body.customerId).toBe('cus_api_1');

    const createPaymentRes = await request(app.getHttpServer())
      .post('/api/v1/crm/payment-requests')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        customerId: 'cus_api_1',
        invoiceNo: 'INV-API-001',
        amount: 1500000,
        status: 'DA_GUI'
      });

    expect(createPaymentRes.status).toBe(201);
    expect(createPaymentRes.body.status).toBe('DA_GUI');

    const markPaidRes = await request(app.getHttpServer())
      .post('/api/v1/crm/payment-requests/pay_api_1/mark-paid')
      .set('authorization', `Bearer ${managerToken}`)
      .send({});

    expect(markPaidRes.status).toBe(201);
    expect(markPaidRes.body.status).toBe('DA_THANH_TOAN');
  });

  it('executes customer merge flow', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(crmService, 'mergeCustomers').mockImplementation(async (body: any) => ({
      message: 'Đã gộp hồ sơ khách hàng thành công.',
      customer: {
        id: body.primaryCustomerId,
        fullName: 'Primary Customer'
      },
      summary: {
        movedOrders: 2,
        movedInteractions: 3,
        movedPaymentRequests: 1
      }
    }) as any);

    const mergeRes = await request(app.getHttpServer())
      .post('/api/v1/crm/merge-customers')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        primaryCustomerId: 'cus_primary',
        mergedCustomerId: 'cus_secondary',
        mergedBy: 'test_manager',
        note: 'merge duplicate by phone'
      });

    expect(mergeRes.status).toBe(201);
    expect(mergeRes.body.customer.id).toBe('cus_primary');
    expect(mergeRes.body.summary.movedInteractions).toBe(3);
  });

  it('returns runtime CRM customer taxonomy', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(crmService, 'getCustomerTaxonomy').mockResolvedValue({
      customerTaxonomy: {
        stages: ['MOI', 'DANG_CHAM_SOC', 'CHOT_DON'],
        sources: ['ONLINE', 'REFERRAL']
      }
    } as any);

    const taxonomyRes = await request(app.getHttpServer())
      .get('/api/v1/crm/taxonomy')
      .set('authorization', `Bearer ${managerToken}`);

    expect(taxonomyRes.status).toBe(200);
    expect(taxonomyRes.body.customerTaxonomy.stages).toEqual(['MOI', 'DANG_CHAM_SOC', 'CHOT_DON']);
    expect(taxonomyRes.body.customerTaxonomy.sources).toEqual(['ONLINE', 'REFERRAL']);
  });

  it('forwards customFilter query to listCustomers service for server-side filtering', async () => {
    const managerToken = makeAuthToken('MANAGER');
    const customFilter = JSON.stringify({
      logic: 'AND',
      conditions: [
        { field: 'status', operator: 'equals', value: 'MOI_CHUA_TU_VAN' },
      ],
    });

    const listSpy = vi.spyOn(crmService, 'listCustomers').mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 20,
    } as any);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/crm/customers?limit=20&customFilter=${encodeURIComponent(customFilter)}`)
      .set('authorization', `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual(
      expect.objectContaining({
        items: [],
        nextCursor: null,
        limit: 20,
      }),
    );
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
      expect.objectContaining({
        customFilter,
      }),
      expect.any(Array),
    );
  });

  it('supports customer saved filters endpoints', async () => {
    const managerToken = makeAuthToken('MANAGER');

    vi.spyOn(crmService, 'listCustomerSavedFilters').mockResolvedValue({
      items: [],
      defaultFilterId: null,
    } as any);

    vi.spyOn(crmService, 'upsertCustomerSavedFilter').mockResolvedValue({
      item: {
        id: 'filter_1',
        name: 'Khach moi',
        logic: 'AND',
        conditions: [{ field: 'status', operator: 'equals', value: 'MOI_CHUA_TU_VAN' }],
        isDefault: true,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
      items: [],
      defaultFilterId: 'filter_1',
    } as any);

    vi.spyOn(crmService, 'deleteCustomerSavedFilter').mockResolvedValue({
      items: [],
      defaultFilterId: null,
    } as any);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/crm/customers/filters')
      .set('authorization', `Bearer ${managerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual(
      expect.objectContaining({
        items: [],
        defaultFilterId: null,
      }),
    );

    const upsertRes = await request(app.getHttpServer())
      .post('/api/v1/crm/customers/filters')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Khach moi',
        logic: 'AND',
        isDefault: true,
        conditions: [{ field: 'status', operator: 'equals', value: 'MOI_CHUA_TU_VAN' }],
      });
    expect(upsertRes.status).toBe(201);
    expect(upsertRes.body.defaultFilterId).toBe('filter_1');

    const deleteRes = await request(app.getHttpServer())
      .delete('/api/v1/crm/customers/filters/filter_1')
      .set('authorization', `Bearer ${managerToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.defaultFilterId).toBeNull();
  });

  it('supports customer import preview endpoint', async () => {
    const adminToken = makeAuthToken('ADMIN');

    vi.spyOn(crmService, 'previewCustomerImport').mockResolvedValue({
      totalRows: 2,
      validRows: 1,
      wouldCreateCount: 1,
      wouldUpdateCount: 0,
      skippedCount: 1,
      errors: [
        {
          rowIndex: 2,
          identifier: '0900000000',
          message: 'Mỗi dòng import cần ít nhất phone hoặc email.',
        },
      ],
    } as any);

    const previewRes = await request(app.getHttpServer())
      .post('/api/v1/crm/customers/import/preview')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        rows: [
          { fullName: 'Khach 1', phone: '0912345678' },
          { fullName: 'Khach 2' },
        ],
      });

    expect(previewRes.status).toBe(201);
    expect(previewRes.body).toEqual(
      expect.objectContaining({
        totalRows: 2,
        validRows: 1,
        wouldCreateCount: 1,
        wouldUpdateCount: 0,
        skippedCount: 1,
      }),
    );
    expect(previewRes.body.errors).toHaveLength(1);
  });
});
