import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/auth/auth.decorators';
import {
  CreateAccountDto,
  CreateBudgetPlanDto,
  CreateInvoiceDto,
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
  createInvoice(@Body() body: CreateInvoiceDto) {
    return this.financeService.createInvoice(body);
  }

  @Patch('invoices/:id')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  updateInvoice(@Param('id') id: string, @Body() body: UpdateInvoiceDto) {
    return this.financeService.updateInvoice(id, body);
  }

  @Post('invoices/:id/issue')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  issueInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.issueInvoice(id, body);
  }

  @Post('invoices/:id/approve')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  approveInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.approveInvoice(id, body);
  }

  @Post('invoices/:id/pay')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  payInvoice(@Param('id') id: string, @Body() body: InvoiceTransitionDto) {
    return this.financeService.payInvoice(id, body);
  }

  @Post('invoices/:id/void')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
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
  listInvoiceAllocations(@Param('id') id: string) {
    return this.financeService.listInvoiceAllocations(id);
  }

  @Post('invoices/:id/allocations')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
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
  closePeriod(@Param('period') period: string, @Body() body: { closedBy?: string }) {
    return this.financeService.closePeriod(period, body?.closedBy);
  }
}
