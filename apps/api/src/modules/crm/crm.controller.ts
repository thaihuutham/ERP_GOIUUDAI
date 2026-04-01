import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { AuditAction } from '../../common/audit/audit.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(@Inject(CrmService) private readonly crmService: CrmService) {}

  @Get('customers')
  listCustomers(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: GenericStatus | 'ALL',
    @Query('stage') stage?: string,
    @Query('tag') tag?: string
  ) {
    return this.crmService.listCustomers(query, { status, stage, tag });
  }

  @Get('taxonomy')
  getTaxonomy() {
    return this.crmService.getCustomerTaxonomy();
  }

  @Post('customers')
  @AuditAction({ action: 'CREATE_CUSTOMER', entityType: 'Customer' })
  createCustomer(@Body() body: Record<string, unknown>) {
    return this.crmService.createCustomer(body);
  }

  @Patch('customers/:id')
  @AuditAction({ action: 'UPDATE_CUSTOMER', entityType: 'Customer', entityIdParam: 'id' })
  updateCustomer(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmService.updateCustomer(id, body);
  }

  @Delete('customers/:id')
  @AuditAction({ action: 'ARCHIVE_CUSTOMER', entityType: 'Customer', entityIdParam: 'id' })
  archiveCustomer(@Param('id') id: string) {
    return this.crmService.archiveCustomer(id);
  }

  @Get('customer-360')
  listCustomer360(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: GenericStatus | 'ALL',
    @Query('stage') stage?: string,
    @Query('tag') tag?: string
  ) {
    return this.crmService.listCustomers(query, { status, stage, tag });
  }

  @Post('customer-360')
  createCustomer360(@Body() body: Record<string, unknown>) {
    return this.crmService.createCustomer(body);
  }

  @Patch('customer-360/:id')
  updateCustomer360(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crmService.updateCustomer(id, body);
  }

  @Delete('customer-360/:id')
  archiveCustomer360(@Param('id') id: string) {
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
}
