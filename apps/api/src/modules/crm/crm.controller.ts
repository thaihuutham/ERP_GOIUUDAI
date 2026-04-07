import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, GenericStatus } from '@prisma/client';
import { AuditAction } from '../../common/audit/audit.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CrmContractsService } from './crm-contracts.service';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(
    @Inject(CrmService) private readonly crmService: CrmService,
    @Inject(CrmContractsService) private readonly crmContractsService: CrmContractsService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get('customers')
  listCustomers(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: GenericStatus | 'ALL',
    @Query('stage') stage?: string,
    @Query('tag') tag?: string,
    @Req() req?: { query?: Record<string, unknown> }
  ) {
    const entityIdsPromise = this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.CUSTOMER, req?.query);
    return entityIdsPromise
      .then((entityIds) => this.crmService.listCustomers(query, { status, stage, tag }, entityIds))
      .then((result) => this.customFields.wrapResult(CustomFieldEntityType.CUSTOMER, result));
  }

  @Get('taxonomy')
  getTaxonomy() {
    return this.crmService.getCustomerTaxonomy();
  }

  @Post('customers')
  @AuditAction({ action: 'CREATE_CUSTOMER', entityType: 'Customer' })
  createCustomer(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    return this.crmService.createCustomer(mutation.base)
      .then(async (result) => {
        const container = result as Record<string, unknown>;
        const customer = container.customer as Record<string, unknown> | undefined;
        if (customer?.id) {
          await this.customFields.applyEntityMutation(CustomFieldEntityType.CUSTOMER, customer.id, mutation);
        }
        return this.customFields.wrapNestedEntity(CustomFieldEntityType.CUSTOMER, container, 'customer');
      });
  }

  @Post('customers/:id/social-identities')
  @AuditAction({ action: 'UPSERT_CUSTOMER_SOCIAL_IDENTITY', entityType: 'Customer', entityIdParam: 'id' })
  createSocialIdentity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmContractsService.createSocialIdentity(id, body);
  }

  @Delete('customers/:id/social-identities/:identityId')
  @AuditAction({ action: 'DELETE_CUSTOMER_SOCIAL_IDENTITY', entityType: 'Customer', entityIdParam: 'id' })
  deleteSocialIdentity(@Param('identityId') identityId: string) {
    return this.crmContractsService.deleteSocialIdentity(identityId);
  }

  @Get('customers/:id/contracts')
  listCustomerContracts(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.crmContractsService.listCustomerContracts(id, query);
  }

  @Get('customers/:id')
  getCustomerDetail(@Param('id') id: string) {
    return this.crmContractsService.getCustomerDetail(id)
      .then(async (detail) => ({
        ...detail,
        customer: await this.customFields.wrapEntity(CustomFieldEntityType.CUSTOMER, detail.customer)
      }));
  }

  @Patch('customers/:id')
  @AuditAction({ action: 'UPDATE_CUSTOMER', entityType: 'Customer', entityIdParam: 'id' })
  updateCustomer(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    return this.crmService.updateCustomer(id, mutation.base)
      .then(async (customer) => {
        await this.customFields.applyEntityMutation(CustomFieldEntityType.CUSTOMER, id, mutation);
        return this.customFields.wrapEntity(CustomFieldEntityType.CUSTOMER, customer);
      });
  }

  @Delete('customers/:id')
  @AuditAction({ action: 'ARCHIVE_CUSTOMER', entityType: 'Customer', entityIdParam: 'id' })
  archiveCustomer(@Param('id') id: string) {
    return this.crmService.archiveCustomer(id);
  }

  @Get('interactions')
  listInteractions(
    @Query() query: PaginationQueryDto,
    @Query('customerId') customerId?: string
  ) {
    return this.crmService.listInteractions(query, customerId);
  }

  @Post('interactions')
  @AuditAction({ action: 'CREATE_CUSTOMER_INTERACTION', entityType: 'CustomerInteraction' })
  createInteraction(@Body() body: Record<string, unknown>) {
    return this.crmService.createInteraction(body);
  }

  @Get('payment-requests')
  listPaymentRequests(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string
  ) {
    return this.crmService.listPaymentRequests(query, status);
  }

  @Post('payment-requests')
  @AuditAction({ action: 'CREATE_PAYMENT_REQUEST', entityType: 'PaymentRequest' })
  createPaymentRequest(@Body() body: Record<string, unknown>) {
    return this.crmService.createPaymentRequest(body);
  }

  @Post('payment-requests/:id/mark-paid')
  @AuditAction({ action: 'MARK_PAYMENT_REQUEST_PAID', entityType: 'PaymentRequest', entityIdParam: 'id' })
  markPaymentRequestPaid(@Param('id') id: string) {
    return this.crmService.markPaymentRequestPaid(id);
  }

  @Get('dedup-candidates')
  getDedupCandidates() {
    return this.crmService.getDedupCandidates();
  }

  @Post('merge-customers')
  @AuditAction({ action: 'MERGE_CUSTOMERS', entityType: 'Customer' })
  mergeCustomers(@Body() body: Record<string, unknown>) {
    return this.crmService.mergeCustomers(body);
  }

  @Get('contracts')
  listContracts(
    @Query() query: PaginationQueryDto,
    @Query('customerId') customerId?: string,
    @Query('productType') productType?: string,
    @Query('status') status?: string
  ) {
    return this.crmContractsService.listContracts(query, {
      customerId,
      productType,
      status
    });
  }

  @Post('contracts/:id/renew-preview')
  renewContractPreview(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmContractsService.renewContractPreview(id, body);
  }

  @Get('renewal-worklist')
  listRenewalWorklist(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('assigneeStaffId') assigneeStaffId?: string
  ) {
    return this.crmContractsService.listRenewalWorklist(query, {
      status,
      assigneeStaffId
    });
  }

  @Post('renewal-worklist/run-sweep')
  @AuditAction({ action: 'RUN_CRM_RENEWAL_SWEEP', entityType: 'ServiceContract' })
  runRenewalReminderSweep(@Body() body: Record<string, unknown>) {
    return this.crmContractsService.runRenewalReminderSweep(body);
  }

  @Get('vehicles')
  listVehicles(
    @Query() query: PaginationQueryDto,
    @Query('ownerCustomerId') ownerCustomerId?: string,
    @Query('vehicleKind') vehicleKind?: string
  ) {
    return this.crmContractsService.listVehicles(query, {
      ownerCustomerId,
      vehicleKind
    });
  }

  @Post('vehicles')
  @AuditAction({ action: 'CREATE_CRM_VEHICLE', entityType: 'Vehicle' })
  createVehicle(@Body() body: Record<string, unknown>) {
    return this.crmContractsService.createVehicle(body)
      .then((vehicle) => this.customFields.wrapEntity(CustomFieldEntityType.VEHICLE, vehicle));
  }

  @Get('vehicles/:id/policies')
  getVehiclePolicies(@Param('id') id: string) {
    return this.crmContractsService.getVehiclePolicies(id);
  }

  @Post('insurance/sync-orders')
  @AuditAction({ action: 'SYNC_INSURANCE_ORDERS', entityType: 'ServiceContract' })
  syncInsuranceOrders(@Body() body: Record<string, unknown>) {
    return this.crmContractsService.syncInsuranceOrders(body);
  }

  @Post('documents')
  @AuditAction({ action: 'UPLOAD_POLICY_DOCUMENT', entityType: 'InboundPolicyDocument' })
  createPolicyDocument(@Body() body: Record<string, unknown>) {
    return this.crmContractsService.createPolicyDocument(body);
  }

  @Post('documents/:id/extract')
  @AuditAction({ action: 'EXTRACT_POLICY_DOCUMENT', entityType: 'InboundPolicyDocument', entityIdParam: 'id' })
  extractPolicyDocument(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmContractsService.extractPolicyDocument(id, body);
  }

  @Post('documents/:id/approve')
  @AuditAction({ action: 'APPROVE_POLICY_DOCUMENT', entityType: 'InboundPolicyDocument', entityIdParam: 'id' })
  approvePolicyDocument(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmContractsService.approvePolicyDocument(id, body);
  }
}
