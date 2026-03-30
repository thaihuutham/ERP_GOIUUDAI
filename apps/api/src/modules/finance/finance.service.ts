import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAccountDto,
  CreateBudgetPlanDto,
  CreateInvoiceDto,
  CreateJournalEntryDto,
  CreatePaymentAllocationDto,
  FinanceListQueryDto,
  InvoiceTransitionDto,
  JournalEntryLineDto,
  UpdateAccountDto,
  UpdateBudgetPlanDto,
  UpdateInvoiceDto,
  UpdateJournalEntryDto
} from './dto/finance.dto';

type InvoiceAction = 'ISSUE' | 'APPROVE' | 'PAY' | 'VOID';

const OPEN_INVOICE_STATUSES: GenericStatus[] = [GenericStatus.PENDING, GenericStatus.APPROVED];
const PERIOD_LOCK_SETTING_KEY = 'finance_period_locks';

const INVOICE_TRANSITIONS: Record<InvoiceAction, { from: GenericStatus[]; to: GenericStatus }> = {
  ISSUE: { from: [GenericStatus.DRAFT], to: GenericStatus.PENDING },
  APPROVE: { from: [GenericStatus.PENDING], to: GenericStatus.APPROVED },
  PAY: { from: [GenericStatus.APPROVED], to: GenericStatus.ARCHIVED },
  VOID: { from: [GenericStatus.DRAFT, GenericStatus.PENDING, GenericStatus.APPROVED], to: GenericStatus.REJECTED }
};

@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listInvoices(query: FinanceListQueryDto) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.invoiceType ? { invoiceType: query.invoiceType } : {}),
      ...(query.q
        ? {
            OR: [
              { invoiceNo: { contains: query.q, mode: 'insensitive' } },
              { partnerName: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const invoices = await this.prisma.client.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });

    return invoices.map((invoice) => {
      const total = Number(invoice.totalAmount ?? 0);
      const paid = Number(invoice.paidAmount ?? 0);
      return {
        ...invoice,
        outstandingAmount: Math.max(0, total - paid)
      };
    });
  }

  async createInvoice(body: CreateInvoiceDto) {
    const status = body.status ?? GenericStatus.DRAFT;
    if (status !== GenericStatus.DRAFT) {
      throw new BadRequestException('Hóa đơn mới chỉ được khởi tạo ở trạng thái DRAFT.');
    }

    const dueAt = body.dueAt ? this.parseDate(body.dueAt, 'dueAt') : undefined;
    await this.assertPeriodUnlockedByDate(dueAt, 'tạo hóa đơn');

    return this.prisma.client.invoice.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        invoiceNo: body.invoiceNo ?? null,
        invoiceType: body.invoiceType,
        partnerName: body.partnerName ?? null,
        totalAmount: body.totalAmount,
        paidAmount: 0,
        dueAt: dueAt ?? null,
        status
      }
    });
  }

  async updateInvoice(id: string, body: UpdateInvoiceDto) {
    const invoice = await this.getInvoiceOrThrow(id);

    if (invoice.status === GenericStatus.ARCHIVED || invoice.status === GenericStatus.REJECTED) {
      throw new BadRequestException('Hóa đơn đã đóng, không thể chỉnh sửa trực tiếp.');
    }

    if (body.status && body.status !== invoice.status) {
      throw new BadRequestException('Không cập nhật status qua PATCH. Dùng endpoint transition hóa đơn.');
    }

    await this.assertPeriodUnlockedByDate(invoice.dueAt ?? undefined, 'sửa hóa đơn');
    const nextDueAt = body.dueAt ? this.parseDate(body.dueAt, 'dueAt') : body.dueAt === undefined ? undefined : null;
    if (nextDueAt instanceof Date) {
      await this.assertPeriodUnlockedByDate(nextDueAt, 'đổi kỳ hóa đơn');
    }

    await this.prisma.client.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        invoiceNo: body.invoiceNo,
        invoiceType: body.invoiceType,
        partnerName: body.partnerName,
        totalAmount: body.totalAmount,
        dueAt: nextDueAt
      }
    });

    return this.getInvoiceOrThrow(id);
  }

  async issueInvoice(id: string, payload: InvoiceTransitionDto) {
    return this.transitionInvoice(id, 'ISSUE', payload);
  }

  async approveInvoice(id: string, payload: InvoiceTransitionDto) {
    return this.transitionInvoice(id, 'APPROVE', payload);
  }

  async payInvoice(id: string, payload: InvoiceTransitionDto) {
    return this.transitionInvoice(id, 'PAY', payload);
  }

  async voidInvoice(id: string, payload: InvoiceTransitionDto) {
    return this.transitionInvoice(id, 'VOID', payload);
  }

  async getInvoiceAging(query: FinanceListQueryDto) {
    const asOf = query.asOf ? this.parseDate(query.asOf, 'asOf') : new Date();

    const invoices = await this.prisma.client.invoice.findMany({
      where: {
        status: { in: OPEN_INVOICE_STATUSES },
        dueAt: { not: null },
        ...(query.invoiceType ? { invoiceType: query.invoiceType } : {})
      },
      orderBy: { dueAt: 'asc' }
    });

    const summary = {
      current: 0,
      overdue_1_30: 0,
      overdue_31_60: 0,
      overdue_61_90: 0,
      overdue_over_90: 0
    };

    const partnerMap = new Map<string, { partnerName: string; totalOutstanding: number; invoiceCount: number }>();

    for (const invoice of invoices) {
      const amount = Math.max(0, Number(invoice.totalAmount ?? 0) - Number(invoice.paidAmount ?? 0));
      if (amount <= 0 || !invoice.dueAt) {
        continue;
      }

      const overdueDays = this.dateDiffInDays(asOf, invoice.dueAt);
      if (overdueDays <= 0) {
        summary.current += amount;
      } else if (overdueDays <= 30) {
        summary.overdue_1_30 += amount;
      } else if (overdueDays <= 60) {
        summary.overdue_31_60 += amount;
      } else if (overdueDays <= 90) {
        summary.overdue_61_90 += amount;
      } else {
        summary.overdue_over_90 += amount;
      }

      const partnerName = invoice.partnerName?.trim() || 'UNKNOWN';
      const existing = partnerMap.get(partnerName) ?? {
        partnerName,
        totalOutstanding: 0,
        invoiceCount: 0
      };
      existing.totalOutstanding += amount;
      existing.invoiceCount += 1;
      partnerMap.set(partnerName, existing);
    }

    const totalOutstanding =
      summary.current
      + summary.overdue_1_30
      + summary.overdue_31_60
      + summary.overdue_61_90
      + summary.overdue_over_90;

    return {
      asOf: asOf.toISOString(),
      invoiceType: query.invoiceType ?? 'ALL',
      totalOutstanding,
      buckets: summary,
      partners: [...partnerMap.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding)
    };
  }

  async listInvoiceAllocations(invoiceId: string) {
    await this.getInvoiceOrThrow(invoiceId);
    return this.prisma.client.paymentAllocation.findMany({
      where: { invoiceId },
      orderBy: { allocatedAt: 'desc' }
    });
  }

  async allocatePayment(invoiceId: string, body: CreatePaymentAllocationDto) {
    const invoice = await this.getInvoiceOrThrow(invoiceId);

    if (invoice.status === GenericStatus.REJECTED || invoice.status === GenericStatus.DRAFT) {
      throw new BadRequestException('Hóa đơn chưa sẵn sàng để ghi nhận thanh toán.');
    }

    await this.assertPeriodUnlockedByDate(invoice.dueAt ?? undefined, 'ghi nhận thanh toán hóa đơn');
    const allocatedAt = body.allocatedAt ? this.parseDate(body.allocatedAt, 'allocatedAt') : new Date();
    await this.assertPeriodUnlockedByDate(allocatedAt, 'ghi nhận thanh toán hóa đơn');

    const currentSum = await this.prisma.client.paymentAllocation.aggregate({
      where: { invoiceId },
      _sum: { allocatedAmount: true }
    });
    const currentAllocated = Number(currentSum._sum.allocatedAmount ?? 0);
    const invoiceTotal = Number(invoice.totalAmount ?? 0);
    const nextAllocated = currentAllocated + body.allocatedAmount;

    if (invoiceTotal <= 0) {
      throw new BadRequestException('Hóa đơn chưa có tổng tiền hợp lệ.');
    }
    if (nextAllocated - invoiceTotal > 0.005) {
      throw new BadRequestException(`Số tiền phân bổ vượt quá giá trị hóa đơn. Remaining=${invoiceTotal - currentAllocated}`);
    }

    const allocation = await this.prisma.client.paymentAllocation.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        invoiceId: invoice.id,
        paymentRef: body.paymentRef ?? null,
        sourceInvoiceNo: body.invoiceNo ?? null,
        allocatedAmount: body.allocatedAmount,
        allocatedAt,
        note: body.note ?? null,
        createdBy: body.createdBy ?? null
      }
    });

    const isPaidOff = invoiceTotal - nextAllocated <= 0.005;
    await this.prisma.client.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        paidAmount: nextAllocated,
        status: isPaidOff ? GenericStatus.ARCHIVED : GenericStatus.APPROVED,
        paidAt: isPaidOff ? allocatedAt : undefined,
        closedAt: isPaidOff ? allocatedAt : undefined
      }
    });

    return {
      allocation,
      invoiceId: invoice.id,
      totalAmount: invoiceTotal,
      paidAmount: nextAllocated,
      outstandingAmount: Math.max(0, invoiceTotal - nextAllocated),
      isPaidOff
    };
  }

  async listAccounts(query: FinanceListQueryDto) {
    return this.prisma.client.account.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createAccount(body: CreateAccountDto) {
    return this.prisma.client.account.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        accountCode: body.accountCode,
        name: body.name,
        accountType: body.accountType,
        balance: body.balance
      }
    });
  }

  async updateAccount(id: string, body: UpdateAccountDto) {
    await this.ensureEntityExists('account', id);
    await this.prisma.client.account.updateMany({
      where: { id },
      data: {
        accountCode: body.accountCode,
        name: body.name,
        accountType: body.accountType,
        balance: body.balance
      }
    });
    return this.prisma.client.account.findFirst({ where: { id } });
  }

  async listJournalEntries(query: FinanceListQueryDto) {
    return this.prisma.client.journalEntry.findMany({
      where: query.status ? { status: query.status } : {},
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createJournalEntry(body: CreateJournalEntryDto) {
    const entryDate = this.parseDate(body.entryDate, 'entryDate');
    await this.assertPeriodUnlockedByDate(entryDate, 'tạo bút toán');

    const journalSummary = this.validateBalancedJournalLines(body.lines);

    const tenantId = this.prisma.getTenantId();

    return this.prisma.client.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          tenant_Id: tenantId,
          entryNo: body.entryNo ?? null,
          entryDate,
          description: this.buildJournalDescription(body.description, journalSummary),
          status: body.status ?? GenericStatus.DRAFT
        }
      });

      if (body.lines && body.lines.length > 0) {
        await tx.journalEntryLine.createMany({
          data: body.lines.map((line) => ({
            tenant_Id: tenantId,
            journalEntryId: entry.id,
            accountCode: line.accountCode as string,
            debit: line.debit ?? null,
            credit: line.credit ?? null,
            description: line.description ?? null
          }))
        });
      }

      return tx.journalEntry.findFirst({
        where: { id: entry.id },
        include: { lines: true }
      });
    });
  }

  async updateJournalEntry(id: string, body: UpdateJournalEntryDto) {
    const entry = await this.prisma.client.journalEntry.findFirst({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Không tìm thấy bút toán.');
    }

    if (entry.status === GenericStatus.APPROVED || entry.status === GenericStatus.ARCHIVED) {
      throw new BadRequestException('Bút toán đã chốt, không thể chỉnh sửa.');
    }

    await this.assertPeriodUnlockedByDate(entry.entryDate, 'sửa bút toán');
    const nextEntryDate = body.entryDate ? this.parseDate(body.entryDate, 'entryDate') : undefined;
    if (nextEntryDate) {
      await this.assertPeriodUnlockedByDate(nextEntryDate, 'đổi kỳ bút toán');
    }

    const journalSummary = body.lines ? this.validateBalancedJournalLines(body.lines) : null;

    const tenantId = this.prisma.getTenantId();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.journalEntry.updateMany({
        where: { id },
        data: {
          entryNo: body.entryNo,
          entryDate: nextEntryDate,
          description:
            journalSummary
              ? this.buildJournalDescription(body.description, journalSummary)
              : body.description,
          status: body.status
        }
      });

      if (body.lines) {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: id } });

        if (body.lines.length > 0) {
          await tx.journalEntryLine.createMany({
            data: body.lines.map((line) => ({
              tenant_Id: tenantId,
              journalEntryId: id,
              accountCode: line.accountCode as string,
              debit: line.debit ?? null,
              credit: line.credit ?? null,
              description: line.description ?? null
            }))
          });
        }
      }
    });

    return this.prisma.client.journalEntry.findFirst({ where: { id }, include: { lines: true } });
  }

  async listBudgetPlans(query: FinanceListQueryDto) {
    return this.prisma.client.budgetPlan.findMany({
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async createBudgetPlan(body: CreateBudgetPlanDto) {
    await this.assertPeriodUnlockedByPeriodLabel(body.fiscalPeriod, 'tạo ngân sách');

    return this.prisma.client.budgetPlan.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        category: body.category,
        fiscalPeriod: body.fiscalPeriod,
        plannedAmount: body.plannedAmount,
        actualAmount: body.actualAmount
      }
    });
  }

  async updateBudgetPlan(id: string, body: UpdateBudgetPlanDto) {
    const plan = await this.prisma.client.budgetPlan.findFirst({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Không tìm thấy kế hoạch ngân sách.');
    }

    await this.assertPeriodUnlockedByPeriodLabel(plan.fiscalPeriod, 'sửa ngân sách');
    if (body.fiscalPeriod) {
      await this.assertPeriodUnlockedByPeriodLabel(body.fiscalPeriod, 'đổi kỳ ngân sách');
    }

    await this.prisma.client.budgetPlan.updateMany({
      where: { id },
      data: {
        category: body.category,
        fiscalPeriod: body.fiscalPeriod,
        plannedAmount: body.plannedAmount,
        actualAmount: body.actualAmount
      }
    });

    return this.prisma.client.budgetPlan.findFirst({ where: { id } });
  }

  async listLockedPeriods() {
    const { periods } = await this.getLockedPeriods();
    return {
      periods,
      count: periods.length
    };
  }

  async closePeriod(period: string, closedBy?: string) {
    const normalizedPeriod = this.normalizePeriod(period);
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey: PERIOD_LOCK_SETTING_KEY }
    });
    const payload = this.ensureRecord(existing?.settingValue);

    const periodSet = new Set(this.parseLockedPeriods(payload.periods));
    periodSet.add(normalizedPeriod);
    const periods = [...periodSet].sort();

    const nextPayload = {
      periods,
      updatedAt: new Date().toISOString(),
      updatedBy: closedBy ?? 'system'
    };

    if (existing) {
      await this.prisma.client.setting.updateMany({
        where: { id: existing.id },
        data: { settingValue: nextPayload as Prisma.InputJsonValue }
      });
    } else {
      await this.prisma.client.setting.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          settingKey: PERIOD_LOCK_SETTING_KEY,
          settingValue: nextPayload as Prisma.InputJsonValue
        }
      });
    }

    return {
      period: normalizedPeriod,
      locked: true,
      periods
    };
  }

  private async transitionInvoice(id: string, action: InvoiceAction, payload: InvoiceTransitionDto) {
    const invoice = await this.getInvoiceOrThrow(id);
    const flow = INVOICE_TRANSITIONS[action];

    if (!flow.from.includes(invoice.status)) {
      throw new BadRequestException(
        `Không thể thực hiện ${action} từ trạng thái ${invoice.status}. Trạng thái hợp lệ: ${flow.from.join(', ')}.`
      );
    }

    await this.assertPeriodUnlockedByDate(invoice.dueAt ?? undefined, `chuyển trạng thái hóa đơn (${action})`);

    await this.prisma.client.invoice.updateMany({
      where: { id: invoice.id },
      data: {
        status: flow.to,
        paidAmount: action === 'PAY' ? invoice.totalAmount ?? undefined : undefined,
        paidAt: action === 'PAY' ? new Date() : undefined,
        closedAt: action === 'PAY' || action === 'VOID' ? new Date() : undefined
      }
    });

    const updated = await this.getInvoiceOrThrow(id);
    return {
      ...updated,
      transition: {
        action,
        from: invoice.status,
        to: flow.to,
        note: payload.note ?? null
      }
    };
  }

  private async getInvoiceOrThrow(id: string) {
    const invoice = await this.prisma.client.invoice.findFirst({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hóa đơn.');
    }
    return invoice;
  }

  private async ensureEntityExists(model: 'account', id: string) {
    const exists = await this.prisma.client[model].findFirst({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Không tìm thấy dữ liệu.');
    }
    return exists;
  }

  private validateBalancedJournalLines(lines?: JournalEntryLineDto[]) {
    if (!lines || lines.length === 0) {
      return { lineCount: 0, totalDebit: 0, totalCredit: 0 };
    }

    if (lines.length < 2) {
      throw new BadRequestException('Bút toán phải có ít nhất 2 dòng định khoản.');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (!line.accountCode?.trim()) {
        throw new BadRequestException('Mỗi dòng định khoản phải có accountCode.');
      }

      if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
        throw new BadRequestException('Mỗi dòng định khoản chỉ được có debit hoặc credit > 0.');
      }

      totalDebit += debit;
      totalCredit += credit;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(`Bút toán không cân bằng: debit=${totalDebit}, credit=${totalCredit}.`);
    }

    return {
      lineCount: lines.length,
      totalDebit,
      totalCredit
    };
  }

  private buildJournalDescription(
    description: string | undefined,
    summary: { lineCount: number; totalDebit: number; totalCredit: number }
  ) {
    if (summary.lineCount === 0) {
      return description ?? null;
    }

    const prefix = description?.trim() ? description.trim() : 'Journal entry';
    return `${prefix} [lines=${summary.lineCount}; debit=${summary.totalDebit}; credit=${summary.totalCredit}]`;
  }

  private async assertPeriodUnlockedByDate(date: Date | undefined, actionLabel: string) {
    if (!date) {
      return;
    }

    const period = this.toPeriod(date);
    await this.assertPeriodUnlocked(period, actionLabel);
  }

  private async assertPeriodUnlockedByPeriodLabel(periodLabel: string | undefined, actionLabel: string) {
    if (!periodLabel) {
      return;
    }

    const normalized = this.normalizePeriodFromLabel(periodLabel);
    if (!normalized) {
      return;
    }
    await this.assertPeriodUnlocked(normalized, actionLabel);
  }

  private async assertPeriodUnlocked(period: string, actionLabel: string) {
    const { periods } = await this.getLockedPeriods();
    if (periods.includes(period)) {
      throw new BadRequestException(`Kỳ ${period} đã khóa, không thể ${actionLabel}.`);
    }
  }

  private async getLockedPeriods() {
    const row = await this.prisma.client.setting.findFirst({
      where: { settingKey: PERIOD_LOCK_SETTING_KEY }
    });

    const payload = this.ensureRecord(row?.settingValue);
    const periods = this.parseLockedPeriods(payload.periods).sort();
    return { periods };
  }

  private parseLockedPeriods(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.normalizePeriod(String(item)))
      .filter((item, index, arr) => arr.indexOf(item) === index);
  }

  private normalizePeriodFromLabel(periodLabel: string) {
    const trimmed = periodLabel.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      return this.normalizePeriod(trimmed);
    }
    if (/^\d{4}\/\d{2}$/.test(trimmed)) {
      return this.normalizePeriod(trimmed.replace('/', '-'));
    }
    return null;
  }

  private normalizePeriod(rawPeriod: string) {
    const period = rawPeriod.trim().replace('/', '-');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException(`Kỳ không hợp lệ: ${rawPeriod}. Định dạng đúng: YYYY-MM.`);
    }
    return period;
  }

  private toPeriod(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private parseDate(raw: string, fieldName: string) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return date;
  }

  private dateDiffInDays(left: Date, right: Date) {
    const leftAt = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
    const rightAt = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
    return Math.floor((leftAt - rightAt) / (24 * 60 * 60 * 1000));
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private take(limit?: number, max = 200) {
    return Math.min(Math.max(limit ?? 100, 1), max);
  }
}
