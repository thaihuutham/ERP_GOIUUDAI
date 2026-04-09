import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  CheckoutLineActivationStatus,
  CheckoutOrderGroup,
  CheckoutOrderStatus,
  GenericStatus,
  PaymentIntentStatus,
  PaymentTransactionStatus,
  Prisma,
  ServiceContractProductType,
  UserRole
} from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import {
  ActivationLineCompleteDto,
  CreateSalesCheckoutOrderDto,
  PaymentBankEventDto,
  PaymentOverrideDto,
  ReEvaluateInvoiceActionDto,
  SalesCheckoutOrderItemDto
} from './dto/sales-checkout.dto';

type CheckoutOrderDetail = Prisma.OrderGetPayload<{
  include: {
    items: true;
    invoices: {
      select: {
        id: true;
        invoiceNo: true;
        status: true;
        totalAmount: true;
        paidAmount: true;
        createdAt: true;
      };
    };
    paymentIntents: {
      include: {
        transactions: true;
        overrides: true;
      };
    };
  };
}>;

type PaymentIntentDetail = Prisma.PaymentIntentGetPayload<{
  include: {
    order: {
      select: {
        id: true;
        orderNo: true;
        orderGroup: true;
        checkoutStatus: true;
        totalAmount: true;
      };
    };
    transactions: true;
    overrides: true;
  };
}>;

type ActorContext = {
  role: string;
  userId: string;
  email: string;
};

type BankEventHeaders = {
  signature?: string;
  timestamp?: string;
  idempotencyKey?: string;
  rawBody?: Buffer;
};

type InvoiceAutomationTriggerSource = 'ON_PAID' | 'ON_ACTIVATED' | 'MANUAL';

@Injectable()
export class SalesCheckoutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Inject(SearchService) private readonly search: SearchService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService
  ) {}

  async createCheckoutOrder(payload: CreateSalesCheckoutOrderDto) {
    const items = this.normalizeCheckoutItems(payload.items);
    if (items.length === 0) {
      throw new BadRequestException('Cần tối thiểu 1 dòng dịch vụ hợp lệ.');
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (totalAmount <= 0) {
      throw new BadRequestException('Tổng tiền thanh toán phải lớn hơn 0.');
    }

    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const selectedTemplate = this.resolveCheckoutTemplate(
      payload.orderGroup,
      payload.templateCode,
      salesPolicy.checkoutTemplates
    );
    this.assertTemplateRequiredFields(selectedTemplate.requiredFields, payload.templateFields ?? {});
    this.assertTemplateFieldPayloadSize(payload.templateFields ?? {});

    const customerId = this.cleanString(payload.customerId) || null;
    const customerName = await this.resolveCheckoutCustomerName(customerId, payload.customerName);
    const employeeId = this.cleanString(payload.employeeId) || null;
    const createdBy = this.cleanString(payload.createdBy) || this.resolveActorContext().userId || null;
    const note = this.cleanString(payload.note) || null;
    const amountLocked = this.decimal(totalAmount);
    const now = new Date();

    let orderId = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const orderNo = await this.generateCheckoutOrderNo(payload.orderGroup);
      const intentCode = this.generatePaymentIntentCode(orderNo);
      const qrPayload = this.buildQrPayload(intentCode, totalAmount, 'VND');

      try {
        const created = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
          const order = await tx.order.create({
            data: {
              tenant_Id: this.prisma.getTenantId(),
              orderNo,
              orderGroup: payload.orderGroup,
              checkoutStatus: CheckoutOrderStatus.PENDING_PAYMENT,
              customerId,
              customerName,
              employeeId,
              totalAmount: amountLocked,
              status: GenericStatus.PENDING,
              commercialLockedAt: now,
              commercialSnapshotJson: {
                template: selectedTemplate,
                templateFields: payload.templateFields ?? {},
                note,
                currency: 'VND',
                amountLocked: totalAmount,
                items
              } as Prisma.InputJsonValue,
              createdBy
            }
          });

          await tx.orderItem.createMany({
            data: items.map((item) => ({
              tenant_Id: this.prisma.getTenantId(),
              orderId: order.id,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: this.decimal(item.unitPrice),
              effectiveFrom: item.effectiveFrom,
              effectiveTo: item.effectiveTo,
              activationStatus: CheckoutLineActivationStatus.PENDING,
              serviceMetaJson: {
                serviceContractId: item.serviceContractId,
                ...(item.serviceMetaJson ?? {})
              } as Prisma.InputJsonValue
            }))
          });

          await tx.paymentIntent.create({
            data: {
              tenant_Id: this.prisma.getTenantId(),
              orderId: order.id,
              intentCode,
              amountLocked,
              paidAmount: this.decimal(0),
              remainingAmount: amountLocked,
              currency: 'VND',
              qrPayload,
              paymentLink: qrPayload,
              qrActive: true,
              status: PaymentIntentStatus.UNPAID,
              lockedAt: now,
              metadataJson: {
                templateCode: selectedTemplate.code,
                orderGroup: payload.orderGroup
              } as Prisma.InputJsonValue
            }
          });

          return order.id;
        });

        orderId = created;
        break;
      } catch (error) {
        if (this.isOrderNoUniqueConflict(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    if (!orderId) {
      throw new BadRequestException('Không thể tạo đơn checkout, vui lòng thử lại.');
    }

    const detail = await this.getCheckoutOrderById(orderId);
    await this.search.syncOrderUpsert(detail);
    return detail;
  }

  async getCheckoutOrder(orderId: string) {
    return this.getCheckoutOrderById(orderId);
  }

  async getCheckoutPaymentIntent(orderId: string) {
    const intent = await this.prisma.client.paymentIntent.findFirst({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderGroup: true,
            checkoutStatus: true,
            totalAmount: true
          }
        },
        transactions: {
          orderBy: [{ createdAt: 'desc' }]
        },
        overrides: {
          orderBy: [{ createdAt: 'desc' }]
        }
      }
    });

    if (!intent) {
      throw new NotFoundException('Không tìm thấy payment intent cho đơn hàng này.');
    }
    return intent;
  }

  async getCheckoutConfig() {
    const policy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    return {
      checkoutTemplates: policy.checkoutTemplates,
      paymentPolicy: {
        partialPaymentEnabled: policy.paymentPolicy.partialPaymentEnabled,
        overrideRoles: policy.paymentPolicy.overrideRoles
      },
      activationPolicy: policy.activationPolicy,
      invoiceAutomation: policy.invoiceAutomation
    };
  }

  async processBankEvent(payload: PaymentBankEventDto, headers: BankEventHeaders = {}) {
    const integrationRuntime = await this.runtimeSettings.getIntegrationRuntime();
    if (!integrationRuntime.payments.enabled) {
      throw new BadRequestException('Payments integration đang tắt.');
    }
    this.verifyBankEventSignature(payload, headers, integrationRuntime.payments.bankWebhookSecret, integrationRuntime.payments.callbackSkewSeconds);

    const paymentPolicy = (await this.runtimeSettings.getSalesCrmPolicyRuntime()).paymentPolicy;
    const normalizedTransactionRef = this.cleanString(payload.transactionRef);
    const normalizedIntentCode = this.cleanString(payload.intentCode);
    const normalizedIdempotencyKey = this.cleanString(headers.idempotencyKey || payload.idempotencyKey) || normalizedTransactionRef;
    const currency = this.cleanString(payload.currency).toUpperCase() || 'VND';
    const amount = Number(payload.amount);
    const bankTxnAt = payload.bankTxnAt ? new Date(payload.bankTxnAt) : new Date();
    const now = new Date();

    const outcome = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const intent = await tx.paymentIntent.findFirst({
        where: { intentCode: normalizedIntentCode },
        include: { order: { select: { id: true } } }
      });
      if (!intent) {
        throw new NotFoundException('Không tìm thấy payment intent theo intentCode.');
      }

      const dedupeHash = this.sha256(`${this.prisma.getTenantId()}|${intent.id}|${normalizedIdempotencyKey}`);
      const existing = await tx.paymentTransaction.findFirst({
        where: { dedupeHash }
      });
      if (existing) {
        return {
          duplicate: true,
          applied: false,
          rejected: false,
          reason: 'DUPLICATE_EVENT',
          orderId: intent.order.id,
          intentId: intent.id,
          intentStatus: intent.status
        };
      }

      const createdTransaction = await tx.paymentTransaction.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          intentId: intent.id,
          transactionRef: normalizedTransactionRef,
          bankTxnAt,
          amount: this.decimal(amount),
          currency,
          rawPayloadJson: {
            ...this.buildPaymentAuditPayload(payload),
            receivedAt: now.toISOString()
          } as Prisma.InputJsonValue,
          dedupeHash,
          status: PaymentTransactionStatus.RECEIVED,
          source: 'BANK_CALLBACK'
        }
      });

      const lockedAmount = this.toNumber(intent.amountLocked);
      const currentPaidAmount = this.toNumber(intent.paidAmount);
      const projectedPaidAmount = currentPaidAmount + amount;

      if (!paymentPolicy.partialPaymentEnabled && projectedPaidAmount + 0.0001 < lockedAmount) {
        await tx.paymentTransaction.updateMany({
          where: { id: createdTransaction.id },
          data: {
            status: PaymentTransactionStatus.REJECTED,
            note: 'Partial payment is disabled by policy.'
          }
        });

        return {
          duplicate: false,
          applied: false,
          rejected: true,
          reason: 'PARTIAL_PAYMENT_DISABLED',
          orderId: intent.order.id,
          intentId: intent.id,
          intentStatus: intent.status
        };
      }

      const nextPaidAmount = Math.min(projectedPaidAmount, lockedAmount);
      const remainingAmount = Math.max(lockedAmount - nextPaidAmount, 0);
      const nextIntentStatus = this.resolvePaymentIntentStatus(nextPaidAmount, lockedAmount);
      const nextOrderStatus = this.resolveOrderCheckoutStatus(nextIntentStatus);

      await tx.paymentIntent.updateMany({
        where: { id: intent.id },
        data: {
          paidAmount: this.decimal(nextPaidAmount),
          remainingAmount: this.decimal(remainingAmount),
          status: nextIntentStatus,
          qrActive: nextIntentStatus !== PaymentIntentStatus.PAID,
          paidAt: nextIntentStatus === PaymentIntentStatus.PAID ? now : null
        }
      });

      await tx.order.updateMany({
        where: { id: intent.order.id },
        data: {
          checkoutStatus: nextOrderStatus
        }
      });

      await tx.paymentTransaction.updateMany({
        where: { id: createdTransaction.id },
        data: {
          status: PaymentTransactionStatus.APPLIED
        }
      });

      return {
        duplicate: false,
        applied: true,
        rejected: false,
        reason: 'APPLIED',
        orderId: intent.order.id,
        intentId: intent.id,
        intentStatus: nextIntentStatus
      };
    });

    if (outcome.applied && outcome.intentStatus === PaymentIntentStatus.PAID) {
      await this.reEvaluateInvoiceAutomation(outcome.orderId, 'ON_PAID', { force: false, reason: 'payment_callback' });
    }
    await this.syncOrderSearch(outcome.orderId);

    const intent = await this.getCheckoutPaymentIntent(outcome.orderId);
    return {
      ...outcome,
      intent
    };
  }

  async createPaymentOverride(orderId: string, payload: PaymentOverrideDto) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId },
      include: {
        paymentIntents: true
      }
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng checkout.');
    }
    if (!order.paymentIntents[0]) {
      throw new BadRequestException('Đơn hàng chưa có payment intent để override.');
    }

    const actor = this.resolveActorContext();
    const paymentPolicy = (await this.runtimeSettings.getSalesCrmPolicyRuntime()).paymentPolicy;
    const allowedRoles = paymentPolicy.overrideRoles.length > 0 ? paymentPolicy.overrideRoles : ['ADMIN'];
    if (!allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('Vai trò hiện tại không được phép override thanh toán.');
    }

    const intent = order.paymentIntents[0];
    const requestedAmount = payload.amount !== undefined ? Number(payload.amount) : undefined;
    if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      throw new BadRequestException('Số tiền override phải lớn hơn 0.');
    }

    const now = new Date();
    const result = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const latestIntent = await tx.paymentIntent.findFirst({
        where: { id: intent.id }
      });
      if (!latestIntent) {
        throw new NotFoundException('Không tìm thấy payment intent để override.');
      }

      const amountLocked = this.toNumber(latestIntent.amountLocked);
      const currentPaidAmount = this.toNumber(latestIntent.paidAmount);
      const currentRemaining = Math.max(amountLocked - currentPaidAmount, 0);
      const appliedAmount = Math.min(requestedAmount ?? currentRemaining, currentRemaining);
      if (appliedAmount <= 0) {
        throw new BadRequestException('Số tiền override không hợp lệ hoặc intent đã đủ tiền.');
      }

      const nextPaidAmount = Math.min(currentPaidAmount + appliedAmount, amountLocked);
      const remainingAmount = Math.max(amountLocked - nextPaidAmount, 0);
      const nextIntentStatus = this.resolvePaymentIntentStatus(nextPaidAmount, amountLocked);
      const nextOrderStatus = this.resolveOrderCheckoutStatus(nextIntentStatus);

      const createdOverride = await tx.paymentOverrideLog.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          intentId: intent.id,
          overrideBy: actor.userId || actor.email || 'system',
          overrideRole: actor.role,
          reason: this.cleanString(payload.reason),
          reference: this.cleanString(payload.reference),
          amount: this.decimal(appliedAmount),
          note: this.cleanString(payload.note) || null,
          metadataJson: {
            source: 'MANUAL_OVERRIDE'
          } as Prisma.InputJsonValue
        }
      });

      await tx.paymentIntent.updateMany({
        where: { id: latestIntent.id },
        data: {
          paidAmount: this.decimal(nextPaidAmount),
          remainingAmount: this.decimal(remainingAmount),
          status: nextIntentStatus,
          qrActive: nextIntentStatus !== PaymentIntentStatus.PAID,
          paidAt: nextIntentStatus === PaymentIntentStatus.PAID ? now : null
        }
      });

      await tx.order.updateMany({
        where: { id: order.id },
        data: {
          checkoutStatus: nextOrderStatus
        }
      });

      return {
        override: createdOverride,
        intentStatus: nextIntentStatus
      };
    });

    if (result.intentStatus === PaymentIntentStatus.PAID) {
      await this.reEvaluateInvoiceAutomation(order.id, 'ON_PAID', { force: false, reason: 'manual_override' });
    }
    await this.syncOrderSearch(order.id);

    return {
      override: result.override,
      intent: await this.getCheckoutPaymentIntent(order.id)
    };
  }

  async completeActivationLine(orderId: string, lineId: string, payload: ActivationLineCompleteDto) {
    const line = await this.prisma.client.orderItem.findFirst({
      where: {
        id: lineId,
        orderId
      },
      include: {
        order: true
      }
    });
    if (!line) {
      throw new NotFoundException('Không tìm thấy dòng dịch vụ cần kích hoạt.');
    }

    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const requireFullPaymentForActivation = this.shouldRequireFullPaymentForActivation(
      line.order.orderGroup,
      salesPolicy.invoiceAutomation
    );

    const effectiveFrom = payload.effectiveFrom ? new Date(payload.effectiveFrom) : line.effectiveFrom;
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : line.effectiveTo;
    if (effectiveFrom && effectiveTo && effectiveFrom.getTime() > effectiveTo.getTime()) {
      throw new BadRequestException('effectiveFrom không thể lớn hơn effectiveTo.');
    }

    const serviceMeta = this.ensureRecord(line.serviceMetaJson);
    const resolvedServiceContractId = this.cleanString(payload.serviceContractId)
      || this.cleanString(serviceMeta.serviceContractId);
    const mergedServiceMeta: Prisma.InputJsonValue = {
      ...serviceMeta,
      ...(payload.serviceMetaJson ?? {}),
      serviceContractId: resolvedServiceContractId || undefined
    };
    const now = new Date();

    const updateResult = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      if (requireFullPaymentForActivation) {
        const latestIntent = await tx.paymentIntent.findFirst({
          where: { orderId },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            status: true
          }
        });

        if (!latestIntent || latestIntent.status !== PaymentIntentStatus.PAID) {
          throw new BadRequestException('Không thể hoàn tất activation khi đơn chưa thanh toán đủ theo policy.');
        }
      }

      await tx.orderItem.updateMany({
        where: { id: line.id },
        data: {
          activationStatus: CheckoutLineActivationStatus.COMPLETED,
          activatedAt: now,
          activationRef: this.cleanString(payload.activationRef) || line.activationRef || null,
          effectiveFrom,
          effectiveTo,
          serviceMetaJson: mergedServiceMeta
        }
      });

      await this.syncServiceContractEffectiveDatesTx(tx, {
        orderId,
        orderGroup: line.order.orderGroup,
        explicitServiceContractId: resolvedServiceContractId,
        effectiveFrom,
        effectiveTo
      });

      const lines = await tx.orderItem.findMany({
        where: { orderId }
      });
      const allCompleted = lines.length > 0 && lines.every((item) => item.activationStatus === CheckoutLineActivationStatus.COMPLETED);
      const anyStarted = lines.some((item) =>
        item.activationStatus === CheckoutLineActivationStatus.IN_PROGRESS
        || item.activationStatus === CheckoutLineActivationStatus.COMPLETED
      );
      const nextOrderStatus = allCompleted
        ? CheckoutOrderStatus.ACTIVE
        : anyStarted
          ? CheckoutOrderStatus.ACTIVATING
          : line.order.checkoutStatus ?? CheckoutOrderStatus.PAID;

      await tx.order.updateMany({
        where: { id: orderId },
        data: {
          checkoutStatus: nextOrderStatus
        }
      });

      const refreshedLine = await tx.orderItem.findFirst({
        where: { id: line.id }
      });
      return {
        line: refreshedLine,
        checkoutStatus: nextOrderStatus
      };
    });

    if (updateResult.checkoutStatus === CheckoutOrderStatus.ACTIVE || updateResult.checkoutStatus === CheckoutOrderStatus.ACTIVATING) {
      await this.reEvaluateInvoiceAutomation(orderId, 'ON_ACTIVATED', { force: false, reason: 'activation_completed' });
    }
    await this.syncOrderSearch(orderId);

    return {
      line: updateResult.line,
      order: await this.getCheckoutOrderById(orderId)
    };
  }

  async reEvaluateInvoiceAction(orderId: string, payload: ReEvaluateInvoiceActionDto) {
    return this.reEvaluateInvoiceAutomation(orderId, 'MANUAL', {
      force: payload.force === true,
      reason: this.cleanString(payload.reason) || 'manual_re_evaluate'
    });
  }

  private async reEvaluateInvoiceAutomation(
    orderId: string,
    source: InvoiceAutomationTriggerSource,
    options: { force: boolean; reason: string }
  ) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId },
      include: {
        items: true,
        invoices: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            paidAt: true,
            closedAt: true,
            createdAt: true
          }
        },
        paymentIntents: {
          orderBy: [{ createdAt: 'desc' }],
          take: 1
        }
      }
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn checkout.');
    }
    if (!order.orderGroup) {
      return { triggered: false, reason: 'ORDER_GROUP_NOT_SET', orderId };
    }

    const policy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const groupPolicy = policy.invoiceAutomation[order.orderGroup];
    const intent = order.paymentIntents[0] ?? null;
    const isFullyPaid = intent?.status === PaymentIntentStatus.PAID;
    const isActivationCompleted = order.items.length > 0 && order.items.every((item) => item.activationStatus === CheckoutLineActivationStatus.COMPLETED);

    if (groupPolicy.requireFullPayment && !isFullyPaid && !options.force) {
      return {
        triggered: false,
        reason: 'FULL_PAYMENT_REQUIRED',
        orderId
      };
    }

    const shouldTriggerByPolicy = this.shouldTriggerInvoiceByPolicy(groupPolicy.trigger, {
      source,
      isFullyPaid,
      isActivationCompleted
    });

    if (!shouldTriggerByPolicy && !options.force) {
      return {
        triggered: false,
        reason: 'TRIGGER_CONDITION_NOT_MET',
        orderId
      };
    }

    const paidAmount = this.decimal(this.toNumber(intent?.paidAmount ?? 0));
    const totalAmount = order.totalAmount ?? this.decimal(0);
    const nextInvoiceStatus = isFullyPaid ? GenericStatus.APPROVED : GenericStatus.PENDING;
    const now = new Date();

    if (order.invoices[0]) {
      const existing = order.invoices[0];
      await this.prisma.client.invoice.updateMany({
        where: { id: existing.id },
        data: {
          paidAmount,
          status: nextInvoiceStatus,
          paidAt: isFullyPaid ? (existing.paidAt ?? now) : null,
          closedAt: isFullyPaid ? (existing.closedAt ?? now) : null
        }
      });

      const updated = await this.prisma.client.invoice.findFirst({
        where: { id: existing.id }
      });
      return {
        triggered: false,
        reason: 'EXISTING_INVOICE_UPDATED',
        orderId,
        invoice: updated
      };
    }

    const created = await this.prisma.client.invoice.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        invoiceType: `CHECKOUT_${order.orderGroup}`,
        partnerName: order.customerName ?? null,
        orderId: order.id,
        totalAmount,
        paidAmount,
        status: nextInvoiceStatus,
        paidAt: isFullyPaid ? now : null,
        closedAt: isFullyPaid ? now : null
      }
    });

    return {
      triggered: true,
      reason: options.reason,
      orderId,
      invoice: created
    };
  }

  private shouldTriggerInvoiceByPolicy(
    trigger: string,
    context: { source: InvoiceAutomationTriggerSource; isFullyPaid: boolean; isActivationCompleted: boolean }
  ) {
    const normalizedTrigger = this.cleanString(trigger).toUpperCase();
    if (normalizedTrigger === 'ON_PAID') {
      return context.isFullyPaid;
    }
    if (normalizedTrigger === 'ON_ACTIVATED') {
      return context.isActivationCompleted;
    }
    return context.source === 'MANUAL';
  }

  private shouldRequireFullPaymentForActivation(
    orderGroup: CheckoutOrderGroup | null,
    invoiceAutomation: Record<string, { requireFullPayment?: boolean }>
  ) {
    if (!orderGroup) {
      return false;
    }

    const groupPolicy = this.ensureRecord(invoiceAutomation[orderGroup]);
    return this.toBool(groupPolicy.requireFullPayment, true);
  }

  private async syncServiceContractEffectiveDatesTx(
    tx: Prisma.TransactionClient,
    args: {
      orderId: string;
      orderGroup: CheckoutOrderGroup | null;
      explicitServiceContractId?: string;
      effectiveFrom?: Date | null;
      effectiveTo?: Date | null;
    }
  ) {
    const explicitServiceContractId = this.cleanString(args.explicitServiceContractId);
    let serviceContractId = '';
    if (explicitServiceContractId) {
      const explicitContract = await tx.serviceContract.findFirst({
        where: {
          id: explicitServiceContractId,
          salesOrderId: args.orderId
        },
        select: { id: true }
      });
      if (!explicitContract) {
        throw new BadRequestException('serviceContractId không thuộc đơn hàng checkout hiện tại.');
      }
      serviceContractId = explicitContract.id;
    } else {
      serviceContractId = await this.findServiceContractIdByOrderGroupTx(tx, args.orderId, args.orderGroup);
    }
    if (!serviceContractId) {
      return null;
    }

    const contract = await tx.serviceContract.findFirst({
      where: { id: serviceContractId }
    });
    if (!contract) {
      return null;
    }

    await tx.serviceContract.updateMany({
      where: { id: contract.id },
      data: {
        startsAt: args.effectiveFrom ?? undefined,
        endsAt: args.effectiveTo ?? undefined
      }
    });

    if (contract.productType === ServiceContractProductType.AUTO_INSURANCE) {
      await tx.autoInsurancePolicyDetail.updateMany({
        where: { contractId: contract.id },
        data: {
          policyFromAt: args.effectiveFrom ?? undefined,
          policyToAt: args.effectiveTo ?? undefined
        }
      });
      return contract.id;
    }

    if (contract.productType === ServiceContractProductType.MOTO_INSURANCE) {
      await tx.motoInsurancePolicyDetail.updateMany({
        where: { contractId: contract.id },
        data: {
          policyFromAt: args.effectiveFrom ?? undefined,
          policyToAt: args.effectiveTo ?? undefined
        }
      });
      return contract.id;
    }

    if (contract.productType === ServiceContractProductType.TELECOM_PACKAGE) {
      await tx.telecomServiceLine.updateMany({
        where: { contractId: contract.id },
        data: {
          currentExpiryAt: args.effectiveTo ?? undefined
        }
      });
      return contract.id;
    }

    return contract.id;
  }

  private async findServiceContractIdByOrderGroupTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    orderGroup: CheckoutOrderGroup | null
  ) {
    if (!orderGroup) {
      return '';
    }

    const candidateProductTypes = this.resolveProductTypesByOrderGroup(orderGroup);
    const contract = await tx.serviceContract.findFirst({
      where: {
        salesOrderId: orderId,
        productType: {
          in: candidateProductTypes
        }
      },
      orderBy: [{ createdAt: 'desc' }]
    });
    return this.cleanString(contract?.id);
  }

  private resolveProductTypesByOrderGroup(group: CheckoutOrderGroup): ServiceContractProductType[] {
    if (group === CheckoutOrderGroup.INSURANCE) {
      return [ServiceContractProductType.AUTO_INSURANCE, ServiceContractProductType.MOTO_INSURANCE];
    }
    if (group === CheckoutOrderGroup.TELECOM) {
      return [ServiceContractProductType.TELECOM_PACKAGE];
    }
    return [ServiceContractProductType.DIGITAL_SERVICE];
  }

  private async getCheckoutOrderById(orderId: string): Promise<CheckoutOrderDetail> {
    const detail = await this.prisma.client.order.findFirst({
      where: { id: orderId },
      include: {
        items: true,
        invoices: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            createdAt: true
          }
        },
        paymentIntents: {
          include: {
            transactions: {
              orderBy: [{ createdAt: 'desc' }]
            },
            overrides: {
              orderBy: [{ createdAt: 'desc' }]
            }
          }
        }
      }
    });
    if (!detail) {
      throw new NotFoundException('Không tìm thấy đơn checkout.');
    }
    return detail;
  }

  private async syncOrderSearch(orderId: string) {
    const row = await this.prisma.client.order.findFirst({
      where: { id: orderId },
      include: {
        items: true,
        invoices: {
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            createdAt: true
          }
        }
      }
    });
    if (row) {
      await this.search.syncOrderUpsert(row);
    }
  }

  private resolvePaymentIntentStatus(nextPaidAmount: number, amountLocked: number) {
    if (amountLocked <= 0) {
      return PaymentIntentStatus.PAID;
    }
    if (nextPaidAmount <= 0) {
      return PaymentIntentStatus.UNPAID;
    }
    if (nextPaidAmount + 0.0001 < amountLocked) {
      return PaymentIntentStatus.PARTIALLY_PAID;
    }
    return PaymentIntentStatus.PAID;
  }

  private resolveOrderCheckoutStatus(intentStatus: PaymentIntentStatus) {
    if (intentStatus === PaymentIntentStatus.PAID) {
      return CheckoutOrderStatus.PAID;
    }
    if (intentStatus === PaymentIntentStatus.PARTIALLY_PAID) {
      return CheckoutOrderStatus.PARTIALLY_PAID;
    }
    if (intentStatus === PaymentIntentStatus.CANCELLED) {
      return CheckoutOrderStatus.CANCELLED;
    }
    return CheckoutOrderStatus.PENDING_PAYMENT;
  }

  private normalizeCheckoutItems(items: SalesCheckoutOrderItemDto[]) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item) => {
        const productId = this.cleanString(item.productId) || null;
        const productName = this.cleanString(item.productName) || null;
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        const effectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : null;
        const effectiveTo = item.effectiveTo ? new Date(item.effectiveTo) : null;
        const serviceContractId = this.cleanString(item.serviceContractId) || null;
        const serviceMetaJson = this.ensureRecord(item.serviceMetaJson);
        return {
          productId,
          productName,
          quantity,
          unitPrice,
          effectiveFrom,
          effectiveTo,
          serviceContractId,
          serviceMetaJson
        };
      })
      .filter((item) => item.unitPrice > 0 && item.quantity > 0 && (item.productName || item.productId));
  }

  private resolveCheckoutTemplate(
    group: CheckoutOrderGroup,
    templateCode: string | undefined,
    templates: Record<string, Array<Record<string, unknown>>>
  ) {
    const groupTemplates = Array.isArray(templates[group]) ? templates[group] : [];
    if (groupTemplates.length === 0) {
      throw new BadRequestException(`Chưa cấu hình checkoutTemplates cho nhóm ${group}.`);
    }

    const normalizedTemplateCode = this.cleanString(templateCode).toUpperCase();
    if (!normalizedTemplateCode) {
      const fallback = groupTemplates[0] ?? {};
      return {
        code: this.cleanString(fallback.code) || `${group}_STD`,
        label: this.cleanString(fallback.label) || `${group} template`,
        requiredFields: this.toStringArray(fallback.requiredFields)
      };
    }

    const matched = groupTemplates.find((item) => this.cleanString(item.code).toUpperCase() === normalizedTemplateCode);
    if (!matched) {
      throw new BadRequestException(`Không tìm thấy templateCode=${normalizedTemplateCode} cho nhóm ${group}.`);
    }

    return {
      code: this.cleanString(matched.code) || normalizedTemplateCode,
      label: this.cleanString(matched.label) || normalizedTemplateCode,
      requiredFields: this.toStringArray(matched.requiredFields)
    };
  }

  private assertTemplateRequiredFields(requiredFields: string[], templateFields: Record<string, unknown>) {
    const missing = requiredFields.filter((key) => {
      const value = templateFields[key];
      if (value === undefined || value === null) return true;
      if (typeof value === 'string' && value.trim().length === 0) return true;
      if (Array.isArray(value) && value.length === 0) return true;
      return false;
    });

    if (missing.length > 0) {
      throw new BadRequestException(`Thiếu field bắt buộc theo template: ${missing.join(', ')}.`);
    }
  }

  private assertTemplateFieldPayloadSize(templateFields: Record<string, unknown>) {
    const serialized = JSON.stringify(templateFields ?? {});
    if (serialized.length > 10_000) {
      throw new BadRequestException('Template fields quá lớn, vui lòng rút gọn dữ liệu đầu vào.');
    }
  }

  private buildPaymentAuditPayload(payload: PaymentBankEventDto): Record<string, unknown> {
    return {
      intentCode: this.cleanString(payload.intentCode),
      transactionRef: this.cleanString(payload.transactionRef),
      amount: Number(payload.amount),
      currency: this.cleanString(payload.currency).toUpperCase() || 'VND',
      bankTxnAt: payload.bankTxnAt ?? null,
      status: this.cleanString(payload.status) || null,
      idempotencyKey: this.cleanString(payload.idempotencyKey) || null
    };
  }

  private async resolveCheckoutCustomerName(customerId: string | null, customerNameRaw?: string) {
    const directName = this.cleanString(customerNameRaw);
    if (directName) {
      return directName;
    }
    if (!customerId) {
      return null;
    }

    const customer = await this.prisma.client.customer.findFirst({
      where: { id: customerId }
    });
    return this.cleanString(customer?.fullName) || null;
  }

  private async generateCheckoutOrderNo(group: CheckoutOrderGroup) {
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const webRuntime = await this.runtimeSettings.getWebRuntime();
    const numbering = salesPolicy.orderNumberingPolicy;
    const timezone = this.cleanString(webRuntime.locale.timezone) || 'Asia/Ho_Chi_Minh';
    const prefix = this.cleanString(numbering.groupPrefixes[group]).toUpperCase() || group.slice(0, 3);

    const now = new Date();
    const fullDate = this.formatDateStamp(now, timezone, 'YYYYMMDD');
    const resetKey = this.resolveOrderResetKey(numbering.resetRule, now, timezone);
    const settingKey = `settings.numbering.checkout.${group}.${resetKey}`;
    const sequence = await this.nextNumberingSequence(settingKey);
    const padding = Math.max(3, Math.min(12, Number(numbering.sequencePadding || 4)));
    return `${prefix}-${fullDate}-${String(sequence).padStart(padding, '0')}`;
  }

  private resolveOrderResetKey(rule: string, now: Date, timezone: string) {
    const normalizedRule = this.cleanString(rule).toUpperCase();
    if (normalizedRule === 'YEARLY') {
      return this.formatDateStamp(now, timezone, 'YYYY');
    }
    if (normalizedRule === 'MONTHLY') {
      return this.formatDateStamp(now, timezone, 'YYYYMM');
    }
    return this.formatDateStamp(now, timezone, 'YYYYMMDD');
  }

  private async nextNumberingSequence(settingKey: string) {
    const existing = await this.prisma.client.setting.findFirst({
      where: { settingKey }
    });
    const payload = this.ensureRecord(existing?.settingValue);
    const current = Number(payload.nextSeq ?? 1);
    const sequence = Number.isFinite(current) && current > 0 ? Math.trunc(current) : 1;
    const nextPayload = {
      nextSeq: sequence + 1,
      updatedAt: new Date().toISOString()
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
          settingKey,
          settingValue: nextPayload as Prisma.InputJsonValue
        }
      });
    }

    return sequence;
  }

  private generatePaymentIntentCode(orderNo: string) {
    const compact = this.cleanString(orderNo).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return `PI-${compact}-${Date.now().toString(36).toUpperCase()}`;
  }

  private buildQrPayload(intentCode: string, amount: number, currency: string) {
    const params = new URLSearchParams({
      intentCode,
      amount: String(Math.trunc(amount)),
      currency
    });
    return `bank://checkout?${params.toString()}`;
  }

  private verifyBankEventSignature(
    payload: PaymentBankEventDto,
    headers: BankEventHeaders,
    secret: string,
    allowedSkewSeconds: number
  ) {
    const normalizedSecret = this.cleanString(secret);
    if (!normalizedSecret) {
      throw new ForbiddenException('Webhook secret chưa được cấu hình.');
    }

    const signature = this.normalizeSignature(headers.signature);
    if (!signature) {
      throw new ForbiddenException('Thiếu chữ ký webhook.');
    }

    const timestamp = this.cleanString(headers.timestamp);
    if (timestamp) {
      const eventEpoch = Number(timestamp);
      if (Number.isFinite(eventEpoch)) {
        const nowEpoch = Math.floor(Date.now() / 1000);
        if (Math.abs(nowEpoch - eventEpoch) > Math.max(10, allowedSkewSeconds)) {
          throw new ForbiddenException('Webhook timestamp vượt quá tolerance.');
        }
      }
    }

    const rawBody = headers.rawBody && headers.rawBody.length > 0
      ? headers.rawBody
      : Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', normalizedSecret).update(rawBody).digest('hex');
    if (!this.safeEqualHex(digest, signature)) {
      throw new ForbiddenException('Webhook signature không hợp lệ.');
    }
  }

  private normalizeSignature(signatureRaw?: string) {
    const raw = this.cleanString(signatureRaw).toLowerCase();
    if (!raw) {
      return '';
    }
    if (raw.startsWith('sha256=')) {
      return raw.slice('sha256='.length);
    }
    return raw;
  }

  private safeEqualHex(leftHex: string, rightHex: string) {
    if (!leftHex || !rightHex) {
      return false;
    }

    try {
      const left = Buffer.from(leftHex, 'hex');
      const right = Buffer.from(rightHex, 'hex');
      if (left.length !== right.length) {
        return false;
      }
      return timingSafeEqual(left, right);
    } catch {
      return false;
    }
  }

  private resolveActorContext(): ActorContext {
    const auth = this.ensureRecord(this.cls?.get(AUTH_USER_CONTEXT_KEY));
    const role = this.normalizeAccessRole(auth.role);
    const sub = this.cleanString(auth.sub);
    const email = this.cleanString(auth.email);
    const userId = this.cleanString(auth.userId) || sub || email;
    return {
      role,
      userId,
      email
    };
  }

  private formatDateStamp(date: Date, timezone: string, mode: 'YYYY' | 'YYYYMM' | 'YYYYMMDD') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const year = parts.find((item) => item.type === 'year')?.value ?? '1970';
    const month = parts.find((item) => item.type === 'month')?.value ?? '01';
    const day = parts.find((item) => item.type === 'day')?.value ?? '01';
    if (mode === 'YYYY') {
      return year;
    }
    if (mode === 'YYYYMM') {
      return `${year}${month}`;
    }
    return `${year}${month}${day}`;
  }

  private isOrderNoUniqueConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }
    const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(',') : String(error.meta?.target ?? '');
    return target.includes('tenant_Id') && target.includes('orderNo');
  }

  private normalizeAccessRole(roleRaw: unknown): string {
    const normalized = this.cleanString(roleRaw).toUpperCase();
    if (normalized === UserRole.ADMIN) {
      return UserRole.ADMIN;
    }
    if (normalized === UserRole.USER || normalized === 'MANAGER' || normalized === 'STAFF') {
      return UserRole.USER;
    }
    return UserRole.USER;
  }

  private decimal(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  private toNumber(value: number | string | Prisma.Decimal | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return Number(value.toString());
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return fallback;
  }

  private cleanString(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.cleanString(item))
      .filter(Boolean);
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
