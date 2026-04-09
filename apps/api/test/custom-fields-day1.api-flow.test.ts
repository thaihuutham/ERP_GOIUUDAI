import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CustomFieldEntityType } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { CustomFieldsService } from '../src/modules/custom-fields/custom-fields.service';
import { HrService } from '../src/modules/hr/hr.service';
import { SalesService } from '../src/modules/sales/sales.service';
import { WorkflowsService } from '../src/modules/workflows/workflows.service';
import { makeAuthToken, setupSingleTenantAuthTestEnv } from './auth-test.helper';

describe('Custom Fields Day-1 API flow integration', () => {
  let app: INestApplication;
  let customFieldsService: CustomFieldsService;
  let catalogService: CatalogService;
  let salesService: SalesService;
  let hrService: HrService;
  let workflowsService: WorkflowsService;

  beforeAll(async () => {
    setupSingleTenantAuthTestEnv('phase3-custom-fields-day1-secret');

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
    customFieldsService = app.get(CustomFieldsService);
    catalogService = app.get(CatalogService);
    salesService = app.get(SalesService);
    hrService = app.get(HrService);
    workflowsService = app.get(WorkflowsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes catalog list through custom field query resolver and wrapper', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const serviceResult = [{ id: 'prod_1', name: 'San pham A' }];
    const wrappedResult = {
      items: [
        {
          id: 'prod_1',
          schemaVersion: 2,
          base: { name: 'San pham A' },
          customFields: { catalog__tier: 'gold' }
        }
      ]
    };

    const resolveSpy = vi
      .spyOn(customFieldsService, 'resolveEntityIdsByQuery')
      .mockResolvedValue(['prod_1']);
    const listSpy = vi
      .spyOn(catalogService, 'listProducts')
      .mockResolvedValue(serviceResult as any);
    const wrapSpy = vi
      .spyOn(customFieldsService, 'wrapResult')
      .mockResolvedValue(wrappedResult as any);

    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?limit=10&cf.catalog__tier=gold')
      .set('authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(wrappedResult);
    expect(resolveSpy).toHaveBeenCalledWith(
      CustomFieldEntityType.PRODUCT,
      expect.objectContaining({ 'cf.catalog__tier': 'gold' })
    );
    expect(listSpy).toHaveBeenCalledWith(expect.any(Object), ['prod_1']);
    expect(wrapSpy).toHaveBeenCalledWith(CustomFieldEntityType.PRODUCT, serviceResult);
  });

  it('routes sales order create via unified mutation contract and custom field apply', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const parsedMutation = {
      base: {
        customerName: 'Nguyen Van A',
        items: [{ productName: 'SP A', quantity: 1, unitPrice: 100000 }]
      },
      customFields: {
        sales__priority: 'high'
      },
      schemaVersion: null,
      unifiedContract: true
    };
    const createdOrder = { id: 'so_1', customerName: 'Nguyen Van A' };
    const wrappedOrder = {
      id: 'so_1',
      schemaVersion: 1,
      base: { customerName: 'Nguyen Van A' },
      customFields: { sales__priority: 'high' }
    };

    const parseSpy = vi.spyOn(customFieldsService, 'parseMutationBody').mockReturnValue(parsedMutation as any);
    const createSpy = vi.spyOn(salesService, 'createOrder').mockResolvedValue(createdOrder as any);
    const applySpy = vi.spyOn(customFieldsService, 'applyEntityMutation').mockResolvedValue(1);
    const wrapSpy = vi.spyOn(customFieldsService, 'wrapEntity').mockResolvedValue(wrappedOrder as any);

    const response = await request(app.getHttpServer())
      .post('/api/v1/sales/orders')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        base: parsedMutation.base,
        customFields: parsedMutation.customFields
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(wrappedOrder);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(parsedMutation.base);
    expect(applySpy).toHaveBeenCalledWith(
      CustomFieldEntityType.SALES_ORDER,
      'so_1',
      parsedMutation
    );
    expect(wrapSpy).toHaveBeenCalledWith(CustomFieldEntityType.SALES_ORDER, createdOrder);
  });

  it('routes workflow definition list through custom field filter resolution', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const listResult = [{ id: 'wf_def_1', name: 'Flow approve order' }];
    const wrappedResult = {
      items: [
        {
          id: 'wf_def_1',
          schemaVersion: 3,
          base: { name: 'Flow approve order' },
          customFields: { wf__risk: 'high' }
        }
      ]
    };

    const resolveSpy = vi
      .spyOn(customFieldsService, 'resolveEntityIdsByQuery')
      .mockResolvedValue(['wf_def_1']);
    const listSpy = vi
      .spyOn(workflowsService, 'listDefinitions')
      .mockResolvedValue(listResult as any);
    const wrapSpy = vi
      .spyOn(customFieldsService, 'wrapResult')
      .mockResolvedValue(wrappedResult as any);

    const response = await request(app.getHttpServer())
      .get('/api/v1/workflows/definitions?cf.wf__risk=high')
      .set('authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(wrappedResult);
    expect(resolveSpy).toHaveBeenCalledWith(
      CustomFieldEntityType.WORKFLOW_DEFINITION,
      expect.objectContaining({ 'cf.wf__risk': 'high' })
    );
    expect(listSpy).toHaveBeenCalledWith(expect.any(Object), ['wf_def_1']);
    expect(wrapSpy).toHaveBeenCalledWith(CustomFieldEntityType.WORKFLOW_DEFINITION, listResult);
  });

  it('routes HR event create via unified mutation contract and HR_EVENT custom field apply', async () => {
    const managerToken = makeAuthToken('ADMIN');
    const parsedMutation = {
      base: {
        eventType: 'TRANSFER',
        effectiveAt: '2026-04-03T00:00:00.000Z',
        note: 'dieu chuyen noi bo'
      },
      customFields: {
        hr__impact: 'medium'
      },
      schemaVersion: null,
      unifiedContract: true
    };
    const createdEvent = {
      id: 'hr_event_1',
      employeeId: 'emp_1',
      eventType: 'TRANSFER'
    };
    const wrappedEvent = {
      id: 'hr_event_1',
      schemaVersion: 2,
      base: { employeeId: 'emp_1', eventType: 'TRANSFER' },
      customFields: { hr__impact: 'medium' }
    };

    const parseSpy = vi.spyOn(customFieldsService, 'parseMutationBody').mockReturnValue(parsedMutation as any);
    const createSpy = vi
      .spyOn(hrService, 'createEmployeeEvent')
      .mockResolvedValue(createdEvent as any);
    const applySpy = vi.spyOn(customFieldsService, 'applyEntityMutation').mockResolvedValue(2);
    const wrapSpy = vi.spyOn(customFieldsService, 'wrapEntity').mockResolvedValue(wrappedEvent as any);

    const response = await request(app.getHttpServer())
      .post('/api/v1/hr/employees/emp_1/events')
      .set('authorization', `Bearer ${managerToken}`)
      .send({
        base: parsedMutation.base,
        customFields: parsedMutation.customFields
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(wrappedEvent);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith('emp_1', parsedMutation.base);
    expect(applySpy).toHaveBeenCalledWith(
      CustomFieldEntityType.HR_EVENT,
      'hr_event_1',
      parsedMutation
    );
    expect(wrapSpy).toHaveBeenCalledWith(CustomFieldEntityType.HR_EVENT, createdEvent);
  });
});
