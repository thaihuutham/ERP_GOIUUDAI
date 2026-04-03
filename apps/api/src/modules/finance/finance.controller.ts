import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CustomFieldEntityType, UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  CreateAccountDto,
  CreateBudgetPlanDto,
  CreateInvoiceDto,
  CreateInvoiceFromOrderDto,
  CreateJournalEntryDto,
  CreatePaymentAllocationDto,
  FinanceListQueryDto,
  InvoiceTransitionDto,
  UpdateAccountDto,
  UpdateBudgetPlanDto,
  UpdateInvoiceDto,
  UpdateJournalEntryDto
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly financeService: FinanceService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService
  ) {}

  @Get('invoices')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  async listInvoices(@Query() query: FinanceListQueryDto, @Req() req?: { query?: Record<string, unknown> }) {
    const entityIds = await this.customFields.resolveEntityIdsByQuery(CustomFieldEntityType.INVOICE, req?.query);
    const result = await this.financeService.listInvoices(query, entityIds);
    return this.customFields.wrapResult(CustomFieldEntityType.INVOICE, result);
  }

  @Post('invoices')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_INVOICE', entityType: 'Invoice' })
  async createInvoice(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const invoice = await this.financeService.createInvoice(mutation.base as unknown as CreateInvoiceDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.INVOICE, (invoice as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Post('invoices/from-order')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_INVOICE_FROM_ORDER', entityType: 'Invoice' })
  async createInvoiceFromOrder(@Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const invoice = await this.financeService.createInvoiceFromOrder(mutation.base as unknown as CreateInvoiceFromOrderDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.INVOICE, (invoice as Record<string, unknown>)?.id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Patch('invoices/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async updateInvoice(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mutation = this.customFields.parseMutationBody(body);
    const invoice = await this.financeService.updateInvoice(id, mutation.base as unknown as UpdateInvoiceDto);
    await this.customFields.applyEntityMutation(CustomFieldEntityType.INVOICE, id, mutation);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Delete('invoices/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ARCHIVE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async archiveInvoice(@Param('id') id: string) {
    const invoice = await this.financeService.archiveInvoice(id);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Post('invoices/:id/issue')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ISSUE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async issueInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    const invoice = await this.financeService.issueInvoice(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Post('invoices/:id/approve')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async approveInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    const invoice = await this.financeService.approveInvoice(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Post('invoices/:id/pay')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'PAY_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async payInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    const invoice = await this.financeService.payInvoice(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Post('invoices/:id/void')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'VOID_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  async voidInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    const invoice = await this.financeService.voidInvoice(id, body);
    return this.customFields.wrapEntity(CustomFieldEntityType.INVOICE, invoice);
  }

  @Get('invoices-aging')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  getInvoiceAging(@Query() query: FinanceListQueryDto) {
    return this.financeService.getInvoiceAging(query);
  }

  @Get('invoices/:id/allocations')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  @AuditRead({ action: 'READ_INVOICE_ALLOCATIONS', entityType: 'Invoice', entityIdParam: 'id' })
  listInvoiceAllocations(@Param('id') id: string) {
    return this.financeService.listInvoiceAllocations(id);
  }

  @Post('invoices/:id/allocations')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ALLOCATE_INVOICE_PAYMENT', entityType: 'Invoice', entityIdParam: 'id' })
  allocatePayment(@Param('id') id: string, @Body() body: CreatePaymentAllocationDto) {
    return this.financeService.allocatePayment(id, body);
  }

  @Get('accounts')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listAccounts(@Query() query: FinanceListQueryDto) {
    return this.financeService.listAccounts(query);
  }

  @Post('accounts')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createAccount(@Body() body: CreateAccountDto) {
    return this.financeService.createAccount(body);
  }

  @Patch('accounts/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateAccount(@Param('id') id: string, @Body() body: UpdateAccountDto) {
    return this.financeService.updateAccount(id, body);
  }

  @Get('journal-entries')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listJournalEntries(@Query() query: FinanceListQueryDto) {
    return this.financeService.listJournalEntries(query);
  }

  @Post('journal-entries')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createJournalEntry(@Body() body: CreateJournalEntryDto) {
    return this.financeService.createJournalEntry(body);
  }

  @Patch('journal-entries/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateJournalEntry(@Param('id') id: string, @Body() body: UpdateJournalEntryDto) {
    return this.financeService.updateJournalEntry(id, body);
  }

  @Get('budget-plans')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listBudgetPlans(@Query() query: FinanceListQueryDto) {
    return this.financeService.listBudgetPlans(query);
  }

  @Post('budget-plans')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  createBudgetPlans(@Body() body: CreateBudgetPlanDto) {
    return this.financeService.createBudgetPlan(body);
  }

  @Patch('budget-plans/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateBudgetPlan(@Param('id') id: string, @Body() body: UpdateBudgetPlanDto) {
    return this.financeService.updateBudgetPlan(id, body);
  }

  @Get('periods/locks')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  listLockedPeriods() {
    return this.financeService.listLockedPeriods();
  }

  @Post('periods/:period/close')
  @Roles(UserRole.ADMIN)
  @AuditAction({ action: 'CLOSE_FINANCE_PERIOD', entityType: 'FinancePeriod', entityIdParam: 'period' })
  closePeriod(@Param('period') period: string, @Body() body: { closedBy?: string }) {
    return this.financeService.closePeriod(period, body?.closedBy);
  }
}
