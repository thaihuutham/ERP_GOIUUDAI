import { ExecutionContext, HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PaymentCallbackRateLimitGuard } from '../src/modules/sales/guards/payment-callback-rate-limit.guard';

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};

function makeContext(request: RequestLike): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}

describe('PaymentCallbackRateLimitGuard', () => {
  it('allows requests under both per-ip and per-intent thresholds', () => {
    const guard = new PaymentCallbackRateLimitGuard();
    const context = makeContext({
      ip: '10.0.0.1',
      body: {
        intentCode: 'PI-ALLOW-1'
      }
    });

    for (let i = 0; i < 40; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('blocks callback bursts for the same ip+intent in a time window', () => {
    const guard = new PaymentCallbackRateLimitGuard();
    const context = makeContext({
      ip: '10.0.0.2',
      body: {
        intentCode: 'PI-BURST-1'
      }
    });

    for (let i = 0; i < 40; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }

    expect(() => guard.canActivate(context)).toThrowError(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(429);
    }
  });

  it('blocks high request volume per ip even when intent codes differ', () => {
    const guard = new PaymentCallbackRateLimitGuard();

    for (let i = 0; i < 120; i += 1) {
      const context = makeContext({
        ip: '10.0.0.3',
        body: {
          intentCode: `PI-IP-${i}`
        }
      });
      expect(guard.canActivate(context)).toBe(true);
    }

    const overflowContext = makeContext({
      ip: '10.0.0.3',
      body: {
        intentCode: 'PI-IP-OVERFLOW'
      }
    });
    expect(() => guard.canActivate(overflowContext)).toThrowError(HttpException);
  });

  it('resolves client ip from forwarded headers', () => {
    const guard = new PaymentCallbackRateLimitGuard();
    const context = makeContext({
      ip: '127.0.0.1',
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.10'
      },
      body: {
        intentCode: 'PI-FWD-1'
      }
    });

    for (let i = 0; i < 40; i += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(() => guard.canActivate(context)).toThrowError(HttpException);
  });
});
