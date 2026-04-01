import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import { AuditAction, AuditRead } from '../../common/audit/audit.decorators';
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
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Get('invoices')
  @Roles(UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN)
  listInvoices(@Query() query: FinanceListQueryDto) {
    return this.financeService.listInvoices(query);
  }

  @Post('invoices')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_INVOICE', entityType: 'Invoice' })
  createInvoice(@Body() body: CreateInvoiceDto) {
    return this.financeService.createInvoice(body);
  }

  @Post('invoices/from-order')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'CREATE_INVOICE_FROM_ORDER', entityType: 'Invoice' })
  createInvoiceFromOrder(@Body() body: CreateInvoiceFromOrderDto) {
    return this.financeService.createInvoiceFromOrder(body);
  }

  @Patch('invoices/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'UPDATE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  updateInvoice(@Param('id') id: string, @Body() body: UpdateInvoiceDto) {
    return this.financeService.updateInvoice(id, body);
  }

  @Delete('invoices/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ARCHIVE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  archiveInvoice(@Param('id') id: string) {
    return this.financeService.archiveInvoice(id);
  }

  @Post('invoices/:id/issue')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'ISSUE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  issueInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.issueInvoice(id, body);
  }

  @Post('invoices/:id/approve')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'APPROVE_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  approveInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.approveInvoice(id, body);
  }

  @Post('invoices/:id/pay')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'PAY_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  payInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.payInvoice(id, body);
  }

  @Post('invoices/:id/void')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditAction({ action: 'VOID_INVOICE', entityType: 'Invoice', entityIdParam: 'id' })
  voidInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.voidInvoice(id, body);
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
