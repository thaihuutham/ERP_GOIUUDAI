import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CheckoutLineActivationStatus,
  CheckoutOrderGroup,
  CheckoutOrderStatus,
  GenericStatus,
  PaymentIntentStatus,
  Prisma,
  ServiceContractProductType,
  UserRole
} from '@prisma/client';
import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_USER_CONTEXT_KEY } from '../src/common/request/request.constants';
import { SalesCheckoutService } from '../src/modules/sales/sales-checkout.service';

const BASE_SALES_POLICY = {
  checkoutTemplates: {
    INSURANCE: [{ code: 'INSURANCE_STD', label: 'Insurance', requiredFields: ['insuranceType'] }],
    TELECOM: [{ code: 'TELECOM_STD', label: 'Telecom', requiredFields: ['packageCode'] }],
    DIGITAL: [{ code: 'DIGITAL_STD', label: 'Digital', requiredFields: ['planCode'] }]
  },
  paymentPolicy: {
    partialPaymentEnabled: true,
    overrideRoles: ['ADMIN'],
    callbackTolerance: 300,
    reconcileSchedule: '0 */2 * * *'
  },
  invoiceAutomation: {
    INSURANCE: { trigger: 'ON_ACTIVATED', requireFullPayment: true },
    TELECOM: { trigger: 'ON_PAID', requireFullPayment: true },
    DIGITAL: { trigger: 'ON_PAID', requireFullPayment: true }
  },
  activationPolicy: {
    INSURANCE: 'HYBRID',
    TELECOM: 'HYBRID',
    DIGITAL: 'AUTO'
  },
  effectiveDateMapping: {},
  orderNumberingPolicy: {
    resetRule: 'DAILY',
    sequencePadding: 4,
    groupPrefixes: {
      INSURANCE: 'INS',
      TELECOM: 'TEL',
      DIGITAL: 'DIG'
    }
  }
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value instanceof Prisma.Decimal) return Number(value.toString());
  return Number(value as any);
}

function signBankPayload(payload: Record<string, unknown>, secret: string) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  return {
    rawBody,
    signature,
    timestamp: String(Math.floor(Date.now() / 1000))
  };
}

function makeProcessBankHarness(options?: {
  amountLocked?: number;
  paidAmount?: number;
  partialPaymentEnabled?: boolean;
}) {
  const secret = 'checkout-webhook-secret';
  const state = {
    order: {
      id: 'order_checkout_1',
      checkoutStatus: CheckoutOrderStatus.PENDING_PAYMENT
    },
    intent: {
      id: 'intent_checkout_1',
      intentCode: 'PI-CHECKOUT-1',
      amountLocked: new Prisma.Decimal(options?.amountLocked ?? 100),
      paidAmount: new Prisma.Decimal(options?.paidAmount ?? 0),
      remainingAmount: new Prisma.Decimal((options?.amountLocked ?? 100) - (options?.paidAmount ?? 0)),
      status: PaymentIntentStatus.UNPAID,
      qrActive: true
    },
    dedupeSeen: new Set<string>()
  };

  const tx = {
    paymentIntent: {
      findFirst: vi.fn().mockImplementation(async () => ({
        ...state.intent,
        order: { id: state.order.id }
      })),
      updateMany: vi.fn().mockImplementation(async ({ data }: any) => {
        state.intent = {
          ...state.intent,
          ...data
        };
        return { count: 1 };
      })
    },
    paymentTransaction: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const dedupeHash = String(where?.dedupeHash ?? '');
        if (!dedupeHash) return null;
        if (!state.dedupeSeen.has(dedupeHash)) return null;
        return {
          id: 'txn_existing_1',
          dedupeHash
        };
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        state.dedupeSeen.add(String(data?.dedupeHash ?? ''));
        return {
          id: `txn_${state.dedupeSeen.size}`,
          ...data
        };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    order: {
      updateMany: vi.fn().mockImplementation(async ({ data }: any) => {
        state.order = {
          ...state.order,
          ...data
        };
        return { count: 1 };
      })
    }
  };

  const prisma = {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      $transaction: vi.fn(async (callback: (ctx: typeof tx) => Promise<unknown>) => callback(tx))
    }
  };

  const runtimeSettings = {
    getIntegrationRuntime: vi.fn().mockResolvedValue({
      payments: {
        enabled: true,
        bankWebhookSecret: secret,
        callbackSkewSeconds: 300,
        reconcileEnabled: true
      }
    }),
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue({
      ...BASE_SALES_POLICY,
      paymentPolicy: {
        ...BASE_SALES_POLICY.paymentPolicy,
        partialPaymentEnabled: options?.partialPaymentEnabled ?? true
      }
    })
  };

  const search = {
    syncOrderUpsert: vi.fn().mockResolvedValue(undefined)
  };

  const service = new SalesCheckoutService(
    prisma as any,
    runtimeSettings as any,
    search as any
  );

  vi.spyOn(service, 'getCheckoutPaymentIntent').mockImplementation(async () => ({
    id: state.intent.id,
    status: state.intent.status,
    paidAmount: state.intent.paidAmount,
    remainingAmount: state.intent.remainingAmount,
    qrActive: state.intent.qrActive
  }) as any);
  const syncSpy = vi.spyOn(service as any, 'syncOrderSearch').mockResolvedValue(undefined);
  const reEvaluateSpy = vi.spyOn(service as any, 'reEvaluateInvoiceAutomation').mockResolvedValue({ triggered: true });

  return {
    service,
    state,
    tx,
    secret,
    syncSpy,
    reEvaluateSpy
  };
}

function makeOverrideHarness(actorRole: UserRole) {
  const state = {
    order: {
      id: 'order_override_1'
    },
    intent: {
      id: 'intent_override_1',
      amountLocked: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(70),
      status: PaymentIntentStatus.PARTIALLY_PAID,
      qrActive: true
    }
  };

  const tx = {
    paymentIntent: {
      findFirst: vi.fn().mockResolvedValue({
        id: state.intent.id,
        amountLocked: state.intent.amountLocked,
        paidAmount: state.intent.paidAmount,
        status: state.intent.status
      }),
      updateMany: vi.fn().mockImplementation(async ({ data }: any) => {
        state.intent = {
          ...state.intent,
          ...data
        };
        return { count: 1 };
      })
    },
    paymentOverrideLog: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'override_1',
        ...data
      }))
    },
    order: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    }
  };

  const prisma = {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: state.order.id,
          paymentIntents: [{ id: state.intent.id }]
        })
      },
      $transaction: vi.fn(async (callback: (ctx: typeof tx) => Promise<unknown>) => callback(tx))
    }
  };

  const runtimeSettings = {
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue(BASE_SALES_POLICY)
  };
  const search = { syncOrderUpsert: vi.fn().mockResolvedValue(undefined) };
  const cls = {
    get: vi.fn((key: string) => (
      key === AUTH_USER_CONTEXT_KEY
        ? {
            userId: `${actorRole.toLowerCase()}_1`,
            email: `${actorRole.toLowerCase()}@erp.local`,
            role: actorRole
          }
        : undefined
    ))
  };

  const service = new SalesCheckoutService(
    prisma as any,
    runtimeSettings as any,
    search as any,
    cls as any
  );
  vi.spyOn(service, 'getCheckoutPaymentIntent').mockResolvedValue({
    id: state.intent.id
  } as any);
  const syncSpy = vi.spyOn(service as any, 'syncOrderSearch').mockResolvedValue(undefined);
  const reEvaluateSpy = vi.spyOn(service as any, 'reEvaluateInvoiceAutomation').mockResolvedValue({ triggered: true });

  return {
    service,
    state,
    tx,
    prisma,
    syncSpy,
    reEvaluateSpy
  };
}

describe('SalesCheckoutService', () => {
  it('ensures callback idempotency and prevents duplicate amount accumulation', async () => {
    const { service, state, tx, secret } = makeProcessBankHarness();

    const payload = {
      intentCode: 'PI-CHECKOUT-1',
      transactionRef: 'BANK-TXN-001',
      amount: 60,
      currency: 'VND',
      bankTxnAt: '2026-04-09T10:00:00.000Z',
      idempotencyKey: 'idem-1'
    };
    const signed = signBankPayload(payload, secret);

    const first = await service.processBankEvent(payload as any, {
      ...signed,
      idempotencyKey: 'idem-1'
    });
    expect(first.duplicate).toBe(false);
    expect(first.applied).toBe(true);
    expect(toNumber(state.intent.paidAmount)).toBe(60);

    const second = await service.processBankEvent(payload as any, {
      ...signed,
      idempotencyKey: 'idem-1'
    });
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
    expect(toNumber(state.intent.paidAmount)).toBe(60);
    expect(tx.paymentIntent.updateMany).toHaveBeenCalledTimes(1);
  });

  it('transitions UNPAID -> PARTIALLY_PAID -> PAID with QR deactivated on full payment', async () => {
    const { service, state, secret, reEvaluateSpy } = makeProcessBankHarness();

    const partialPayload = {
      intentCode: 'PI-CHECKOUT-1',
      transactionRef: 'BANK-TXN-101',
      amount: 40,
      currency: 'VND',
      bankTxnAt: '2026-04-09T10:01:00.000Z',
      idempotencyKey: 'idem-partial-1'
    };
    await service.processBankEvent(partialPayload as any, {
      ...signBankPayload(partialPayload, secret),
      idempotencyKey: 'idem-partial-1'
    });

    expect(state.intent.status).toBe(PaymentIntentStatus.PARTIALLY_PAID);
    expect(state.order.checkoutStatus).toBe(CheckoutOrderStatus.PARTIALLY_PAID);
    expect(state.intent.qrActive).toBe(true);

    const fullPayload = {
      intentCode: 'PI-CHECKOUT-1',
      transactionRef: 'BANK-TXN-102',
      amount: 60,
      currency: 'VND',
      bankTxnAt: '2026-04-09T10:02:00.000Z',
      idempotencyKey: 'idem-partial-2'
    };
    await service.processBankEvent(fullPayload as any, {
      ...signBankPayload(fullPayload, secret),
      idempotencyKey: 'idem-partial-2'
    });

    expect(state.intent.status).toBe(PaymentIntentStatus.PAID);
    expect(state.order.checkoutStatus).toBe(CheckoutOrderStatus.PAID);
    expect(state.intent.qrActive).toBe(false);
    expect(reEvaluateSpy).toHaveBeenCalledTimes(1);
    expect(reEvaluateSpy).toHaveBeenCalledWith(
      'order_checkout_1',
      'ON_PAID',
      expect.objectContaining({ force: false })
    );
  });

  it('blocks USER from manual payment override', async () => {
    const { service, prisma } = makeOverrideHarness(UserRole.USER);

    await expect(service.createPaymentOverride('order_override_1', {
      reason: 'Webhook timeout fallback',
      reference: 'OVR-001'
    } as any)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('allows ADMIN override with audit trail and updates intent status', async () => {
    const { service, state, tx, reEvaluateSpy, syncSpy } = makeOverrideHarness(UserRole.ADMIN);

    const result = await service.createPaymentOverride('order_override_1', {
      reason: 'Webhook timeout fallback',
      reference: 'OVR-ADMIN-001'
    } as any);

    expect(result.override).toBeTruthy();
    expect(tx.paymentOverrideLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overrideRole: UserRole.ADMIN,
          reason: 'Webhook timeout fallback',
          reference: 'OVR-ADMIN-001'
        })
      })
    );
    expect(toNumber(state.intent.paidAmount)).toBe(100);
    expect(state.intent.status).toBe(PaymentIntentStatus.PAID);
    expect(state.intent.qrActive).toBe(false);
    expect(reEvaluateSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('syncs canonical effectiveFrom/effectiveTo to service contract dates when activation completes', async () => {
    const line = {
      id: 'line_1',
      orderId: 'order_1',
      activationStatus: CheckoutLineActivationStatus.PENDING,
      activationRef: null,
      effectiveFrom: null,
      effectiveTo: null,
      serviceMetaJson: {},
      order: {
        id: 'order_1',
        orderGroup: CheckoutOrderGroup.TELECOM,
        checkoutStatus: CheckoutOrderStatus.PAID
      }
    };

    const tx = {
      paymentIntent: {
        findFirst: vi.fn().mockResolvedValue({
          status: PaymentIntentStatus.PAID
        })
      },
      orderItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { activationStatus: CheckoutLineActivationStatus.COMPLETED }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          ...line,
          activationStatus: CheckoutLineActivationStatus.COMPLETED
        })
      },
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      serviceContract: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where?.id && where?.salesOrderId) {
            return { id: 'contract_1' };
          }
          if (where?.id === 'contract_1') {
            return {
              id: 'contract_1',
              productType: ServiceContractProductType.TELECOM_PACKAGE
            };
          }
          return null;
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      telecomServiceLine: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      autoInsurancePolicyDetail: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      motoInsurancePolicyDetail: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };

    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        orderItem: {
          findFirst: vi.fn().mockResolvedValue(line)
        },
        $transaction: vi.fn(async (callback: (ctx: typeof tx) => Promise<unknown>) => callback(tx))
      }
    };

    const runtimeSettings = {
      getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue(BASE_SALES_POLICY)
    };
    const search = { syncOrderUpsert: vi.fn().mockResolvedValue(undefined) };
    const service = new SalesCheckoutService(prisma as any, runtimeSettings as any, search as any);
    vi.spyOn(service as any, 'reEvaluateInvoiceAutomation').mockResolvedValue({ triggered: false });
    vi.spyOn(service as any, 'syncOrderSearch').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getCheckoutOrderById').mockResolvedValue({ id: 'order_1' });

    await service.completeActivationLine('order_1', 'line_1', {
      serviceContractId: 'contract_1',
      activationRef: 'ACT-TELECOM-001',
      effectiveFrom: '2026-05-01T00:00:00.000Z',
      effectiveTo: '2026-06-01T00:00:00.000Z'
    } as any);

    const contractSyncCall = tx.serviceContract.updateMany.mock.calls[0]?.[0];
    expect(contractSyncCall.data.startsAt.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(contractSyncCall.data.endsAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');

    const telecomSyncCall = tx.telecomServiceLine.updateMany.mock.calls[0]?.[0];
    expect(telecomSyncCall.data.currentExpiryAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('blocks activation completion when payment is not fully paid by policy', async () => {
    const line = {
      id: 'line_not_paid_1',
      orderId: 'order_not_paid_1',
      activationStatus: CheckoutLineActivationStatus.PENDING,
      activationRef: null,
      effectiveFrom: null,
      effectiveTo: null,
      serviceMetaJson: {},
      order: {
        id: 'order_not_paid_1',
        orderGroup: CheckoutOrderGroup.TELECOM,
        checkoutStatus: CheckoutOrderStatus.PARTIALLY_PAID
      }
    };

    const tx = {
      paymentIntent: {
        findFirst: vi.fn().mockResolvedValue({
          status: PaymentIntentStatus.PARTIALLY_PAID
        })
      },
      orderItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(line)
      },
      order: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      serviceContract: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      telecomServiceLine: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      autoInsurancePolicyDetail: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      motoInsurancePolicyDetail: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };

    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        orderItem: {
          findFirst: vi.fn().mockResolvedValue(line)
        },
        $transaction: vi.fn(async (callback: (ctx: typeof tx) => Promise<unknown>) => callback(tx))
      }
    };
    const runtimeSettings = {
      getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue(BASE_SALES_POLICY)
    };
    const search = { syncOrderUpsert: vi.fn().mockResolvedValue(undefined) };
    const service = new SalesCheckoutService(prisma as any, runtimeSettings as any, search as any);

    await expect(service.completeActivationLine('order_not_paid_1', 'line_not_paid_1', {
      activationRef: 'ACT-NOT-PAID-001'
    } as any)).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('triggers invoice automation for TELECOM on paid and skips INSURANCE when not activated', async () => {
    const telecomOrder = {
      id: 'order_telecom_1',
      orderGroup: CheckoutOrderGroup.TELECOM,
      totalAmount: new Prisma.Decimal(100),
      items: [{ activationStatus: CheckoutLineActivationStatus.PENDING }],
      paymentIntents: [{ status: PaymentIntentStatus.PAID, paidAmount: new Prisma.Decimal(100) }],
      invoices: []
    };
    const insuranceOrder = {
      id: 'order_insurance_1',
      orderGroup: CheckoutOrderGroup.INSURANCE,
      totalAmount: new Prisma.Decimal(100),
      items: [{ activationStatus: CheckoutLineActivationStatus.PENDING }],
      paymentIntents: [{ status: PaymentIntentStatus.PAID, paidAmount: new Prisma.Decimal(100) }],
      invoices: []
    };

    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        order: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(telecomOrder)
            .mockResolvedValueOnce(insuranceOrder)
        },
        invoice: {
          create: vi.fn().mockResolvedValue({
            id: 'invoice_1',
            status: GenericStatus.APPROVED
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue(null)
        }
      }
    };
    const runtimeSettings = {
      getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue(BASE_SALES_POLICY)
    };
    const search = { syncOrderUpsert: vi.fn().mockResolvedValue(undefined) };
    const service = new SalesCheckoutService(prisma as any, runtimeSettings as any, search as any);

    const telecomResult = await (service as any).reEvaluateInvoiceAutomation('order_telecom_1', 'ON_PAID', {
      force: false,
      reason: 'payment_callback'
    });
    expect(telecomResult.triggered).toBe(true);
    expect(prisma.client.invoice.create).toHaveBeenCalledTimes(1);

    const insuranceResult = await (service as any).reEvaluateInvoiceAutomation('order_insurance_1', 'ON_PAID', {
      force: false,
      reason: 'payment_callback'
    });
    expect(insuranceResult.triggered).toBe(false);
    expect(insuranceResult.reason).toBe('TRIGGER_CONDITION_NOT_MET');
    expect(prisma.client.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('keeps invoice automation blocked when full-payment policy is not satisfied', async () => {
    const prisma = {
      getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
      client: {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'order_digital_1',
            orderGroup: CheckoutOrderGroup.DIGITAL,
            totalAmount: new Prisma.Decimal(200),
            items: [{ activationStatus: CheckoutLineActivationStatus.COMPLETED }],
            paymentIntents: [{ status: PaymentIntentStatus.PARTIALLY_PAID, paidAmount: new Prisma.Decimal(100) }],
            invoices: []
          })
        },
        invoice: {
          create: vi.fn(),
          updateMany: vi.fn(),
          findFirst: vi.fn()
        }
      }
    };
    const runtimeSettings = {
      getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue(BASE_SALES_POLICY)
    };
    const search = { syncOrderUpsert: vi.fn().mockResolvedValue(undefined) };
    const service = new SalesCheckoutService(prisma as any, runtimeSettings as any, search as any);

    const result = await (service as any).reEvaluateInvoiceAutomation('order_digital_1', 'ON_PAID', {
      force: false,
      reason: 'payment_callback'
    });

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('FULL_PAYMENT_REQUIRED');
    expect(prisma.client.invoice.create).not.toHaveBeenCalled();
  });
});
